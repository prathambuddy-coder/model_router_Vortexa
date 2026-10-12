"""
model_adapter.py - OpenRouter Provider Layer for A-01 ModelRouter
-----------------------------------------------------------------
Translates routing decisions into model execution:
- Live OpenRouter cloud inference via https://openrouter.ai/api/v1/chat/completions
- Realistic Persona-Based Simulation Fallback (when API key is not yet set or endpoint unreachable)
- Explicit execution mode flag: 'OPENROUTER_INFERENCE' vs 'SIMULATED'
- Measured latency recording to ModelRegistry
"""

import os
import time
import random
import requests
import concurrent.futures
from typing import Optional
from dotenv import load_dotenv
from models import ModelProfile, registry

load_dotenv()

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
MAX_COMPLETION_TOKENS = 6000      # total output budget (reasoning + visible answer)
REASONING_TOKEN_BUDGET = 3000     # cap on hidden thinking so reasoning models leave room to answer

# Shared pool: a timed-out request is abandoned here (never joined), so the
# gateway can fail over immediately instead of blocking until OpenRouter replies.
_http_pool = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix="openrouter")


def _simulate_response(profile: ModelProfile, prompt: str) -> dict:
    """
    Generate a deterministic, persona-appropriate simulated response.
    Explicitly labeled as SIMULATED so test/dev mode is crystal clear.
    """
    # Sleep realistic duration around model's avg_latency_ms
    sleep_secs = min(3.0, (profile.avg_latency_ms * random.uniform(0.4, 0.7)) / 1000.0)
    time.sleep(sleep_secs)

    prompt_words = [w.strip(".,?!;:\"'") for w in prompt.split() if len(w) > 3]
    topic = " ".join(prompt_words[:5]) if prompt_words else "your query"

    personas = {
        "liquid-lfm-2.6b": (
            f"⚡ [Liquid LFM2.5 2.6B · Fast Edge Inference]\n"
            f"Quick response to: '{prompt}'.\n"
            f"Result: Direct, low-latency extraction and answer computed efficiently."
        ),
        "nemotron-3.5-lightning": (
            f"⚖️ [NVIDIA Nemotron 3.5 Lightning · Balanced & Agentic]\n"
            f"Analysis for '{topic}':\n"
            f"Nemotron 3.5 Lightning delivers high-throughput general reasoning and balanced execution for everyday tasks."
        ),
        "nemotron-3-super": (
            f"🧠 [NVIDIA Nemotron 3 Super · 120B Advanced Reasoning]\n"
            f"1. Premise Evaluation: Deconstructing '{prompt}' into foundational constraints.\n"
            f"2. Chain-of-Thought Proof: Analyzing mathematical and logical invariants step-by-step.\n"
            f"3. Formal Resolution: The verified conclusion satisfies all required logical conditions."
        ),
        "north-mini-code": (
            f"💻 [Cohere North Mini Code · Coding Specialist]\n"
            f"Software engineering solution for '{topic}':\n"
            f"```python\n"
            f"# Optimized implementation for: {prompt[:40]}...\n"
            f"def execute_task():\n"
            f"    \"\"\"Refactored for optimal time complexity and reliability.\"\"\"\n"
            f"    return {{\n"
            f"        'status': 'complete',\n"
            f"        'topic': '{topic}',\n"
            f"    }}\n"
            f"```"
        ),
        "gemma-4-26b": (
            f"🖼️ [Google Gemma 4 26B A4B · Multimodal & Document Synthesis]\n"
            f"Multimodal feature parsing and visual-document synthesis for '{topic}'. Extracted structured representation with context verification."
        ),
    }

    content = personas.get(
        profile.model_key,
        f"[{profile.name}] Processed: '{prompt}' with capability rating {profile.capability_score}."
    )

    actual_ms = int(sleep_secs * 1000)
    toks = max(10, len(content) // 4)
    p_toks = max(1, len(prompt.split()))
    return {
        "text": content,
        "latency_ms": actual_ms,
        "tokens_used": toks,
        "prompt_tokens": p_toks,
        "completion_tokens": toks,
        "usage": {
            "prompt_tokens": p_toks,
            "completion_tokens": toks,
            "total_tokens": p_toks + toks,
        },
        "success": True,
        "error": None,
        "simulated": True,
        "execution_mode": "SIMULATED",
    }


VISION_FALLBACK_MODEL_IDS = (
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemma-4-31b-it:free",
)
MAX_CALL_TIMEOUT_S = 90.0          # upper bound for one OpenRouter call (vision requests need the most)
RATE_LIMIT_BACKOFF_S = (2.0, 4.0)  # waits before 2nd and 3rd attempts on HTTP 429
MIN_RETRY_WINDOW_S = 3.0           # don't retry unless this much deadline remains after waiting


def _build_content(prompt: str, images: list | None):
    """Plain string for text-only prompts; OpenAI-style content parts when images are attached."""
    if not images:
        return prompt
    parts = [{"type": "text", "text": prompt}]
    parts += [{"type": "image_url", "image_url": {"url": url}} for url in images]
    return parts


def _call_openrouter(profile: ModelProfile, prompt: str, timeout_ms: int, images: list | None = None) -> dict:
    """
    Invokes OpenRouter chat completions API using OPENROUTER_API_KEY.
    Enforces a strict, client-side wall-clock timeout to prevent indefinite hangs in cloud queues.
    Triggers gateway failover if a model takes longer than its SLA timeout.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()

    # If no key or placeholder key configured, fall back to high-fidelity simulation
    if not api_key or api_key in ("your_openrouter_api_key_here", "sk-or-your_openrouter_api_key_here"):
        sim_res = _simulate_response(profile, prompt)
        sim_res["error"] = "OPENROUTER_API_KEY not configured in .env. Running simulated execution."
        return sim_res

    # Enforceable client-side wall-clock timeout limit (capped between 8s and MAX_CALL_TIMEOUT_S)
    effective_timeout = min(MAX_CALL_TIMEOUT_S, max(8.0, float(timeout_ms) / 1000.0 if timeout_ms else 15.0))
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_REFERER", "http://localhost:3000"),
        "X-Title": os.environ.get("OPENROUTER_TITLE", "ModelRouter Gateway"),
    }
    payload = {
        "model": profile.model_id or "liquid/lfm-2.5-2.6b:free",
        "messages": [
            {"role": "user", "content": _build_content(prompt, images)}
        ],
        "max_tokens": MAX_COMPLETION_TOKENS,
        # Free reasoning models otherwise spend the whole budget thinking and return no answer.
        "reasoning": {"max_tokens": REASONING_TOKEN_BUDGET},
    }
    if images:
        # Free vision endpoints are often rate-limited; let OpenRouter fall through to
        # another vision model in priority order instead of failing the request.
        primary = payload["model"]
        payload["models"] = [primary] + [m for m in VISION_FALLBACK_MODEL_IDS if m != primary]

    start = time.time()
    try:
        # Run HTTP post in thread with strict wall-clock deadline. Free-tier upstreams
        # return 429 in short bursts, so retry with backoff while the deadline allows.
        for backoff_s in RATE_LIMIT_BACKOFF_S + (None,):
            remaining = effective_timeout - (time.time() - start)
            if remaining <= 0:
                raise concurrent.futures.TimeoutError()
            future = _http_pool.submit(
                requests.post,
                OPENROUTER_API_URL,
                headers=headers,
                json=payload,
                timeout=remaining,
            )
            try:
                resp = future.result(timeout=remaining)
            except concurrent.futures.TimeoutError:
                future.cancel()  # no-op if already running; the worker finishes in the background
                raise
            if resp.status_code != 429 or backoff_s is None:
                break
            if effective_timeout - (time.time() - start) < backoff_s + MIN_RETRY_WINDOW_S:
                break
            time.sleep(backoff_s)

        elapsed_ms = int((time.time() - start) * 1000)

        data = resp.json() if resp.status_code == 200 else {}
        if resp.status_code == 200 and data.get("error") and not data.get("choices"):
            # OpenRouter can report upstream failures inside a 200 body
            err = data["error"]
            return {
                "text": None,
                "latency_ms": int((time.time() - start) * 1000),
                "tokens_used": 0,
                "success": False,
                "error": f"OpenRouter upstream error: {str(err.get('message', err) if isinstance(err, dict) else err)[:160]}",
                "simulated": False,
                "execution_mode": "API_ERROR",
            }
        if resp.status_code == 200:
            choices = data.get("choices", [])
            response_text = ""
            if choices and isinstance(choices, list):
                msg = choices[0].get("message", {})
                response_text = (msg.get("content") or "").strip()
            if not response_text:
                # Budget exhausted on reasoning (or blank upstream reply): fail over to another model
                return {
                    "text": None,
                    "latency_ms": elapsed_ms,
                    "tokens_used": data.get("usage", {}).get("total_tokens", 0),
                    "success": False,
                    "error": f"'{profile.name}' returned an empty answer "
                             f"(finish_reason={choices[0].get('finish_reason') if choices else 'none'}).",
                    "simulated": False,
                    "execution_mode": "EMPTY_RESPONSE",
                }

            usage = data.get("usage", {})
            prompt_tokens = usage.get("prompt_tokens", max(1, len(prompt.split())))
            completion_tokens = usage.get("completion_tokens", max(1, len(response_text.split())))
            tokens_used = usage.get("total_tokens", prompt_tokens + completion_tokens)

            return {
                "text": response_text,
                "latency_ms": elapsed_ms,
                "tokens_used": tokens_used,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": tokens_used,
                },
                "success": True,
                "error": None,
                "simulated": False,
                "execution_mode": "OPENROUTER_INFERENCE",
                "served_by": data.get("model"),
            }
        else:
            # OpenRouter returned non-200 (rate limit, quota, server error) -> Trigger failover
            elapsed_ms = int((time.time() - start) * 1000)
            if resp.status_code == 429 and _is_daily_quota_error(resp.text):
                return {
                    "text": None,
                    "latency_ms": elapsed_ms,
                    "tokens_used": 0,
                    "success": False,
                    "error": DAILY_QUOTA_MESSAGE,
                    "simulated": False,
                    "execution_mode": "QUOTA_EXHAUSTED",
                }
            return {
                "text": None,
                "latency_ms": elapsed_ms,
                "tokens_used": 0,
                "success": False,
                "error": f"OpenRouter HTTP {resp.status_code}: {resp.text[:120]}",
                "simulated": False,
                "execution_mode": "API_ERROR",
            }

    except concurrent.futures.TimeoutError:
        elapsed_ms = int((time.time() - start) * 1000)
        return {
            "text": None,
            "latency_ms": elapsed_ms,
            "tokens_used": 0,
            "success": False,
            "error": f"Cloud queue timeout: '{profile.name}' exceeded {int(effective_timeout)}s SLA deadline. Triggering failover.",
            "simulated": False,
            "execution_mode": "TIMEOUT_FAILOVER",
        }
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
        elapsed_ms = int((time.time() - start) * 1000)
        return {
            "text": None,
            "latency_ms": elapsed_ms,
            "tokens_used": 0,
            "success": False,
            "error": f"OpenRouter API unreachable or timed out ({type(e).__name__}).",
            "simulated": False,
            "execution_mode": "TIMEOUT_FAILOVER",
        }


DAILY_QUOTA_MESSAGE = (
    "OpenRouter daily free-model limit reached for this API key (shared by every :free model). "
    "It resets at 00:00 UTC; adding credits to the OpenRouter account raises the limit."
)


def _is_daily_quota_error(body: str) -> bool:
    return "free-models-per-day" in (body or "")


TRANSCRIBE_PROMPT = (
    "Transcribe ALL text in the attached image(s) exactly, preserving structure "
    "(headings, lists, code, tables, examples). Then, in one short paragraph, describe any "
    "non-text visual content (diagrams, charts, photos). Do not solve or answer anything."
)
TRANSCRIBE_ATTEMPTS = 4


def transcribe_images(images: list, vision_model_ids: list, timeout_s: float) -> dict:
    """
    Stage 1 of image requests: a vision model only *reads* the images (fast, reasoning off),
    so the text router can send the extracted content to a stronger model to answer.
    Returns {"success", "text", "served_by", "latency_ms", "error"}.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    start = time.time()
    if not api_key:
        return {"success": False, "text": None, "served_by": None, "latency_ms": 0,
                "error": "OPENROUTER_API_KEY not configured; cannot read images."}

    model_ids = list(dict.fromkeys(list(vision_model_ids) + list(VISION_FALLBACK_MODEL_IDS)))
    payload = {
        "models": model_ids,
        "max_tokens": MAX_COMPLETION_TOKENS,
        "reasoning": {"enabled": False},  # reasoning vision models otherwise think for minutes
        "messages": [{"role": "user", "content": _build_content(TRANSCRIBE_PROMPT, images)}],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_REFERER", "http://localhost:3000"),
        "X-Title": os.environ.get("OPENROUTER_TITLE", "ModelRouter Gateway"),
    }
    last_error = "unknown error"
    for attempt in range(TRANSCRIBE_ATTEMPTS):
        remaining = timeout_s - (time.time() - start)
        if remaining <= 1:
            break
        try:
            resp = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=remaining)
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            choices = data.get("choices") or []
            text = (choices[0].get("message", {}).get("content") or "").strip() if choices else ""
            if resp.status_code == 200 and text:
                return {"success": True, "text": text, "served_by": data.get("model"),
                        "latency_ms": int((time.time() - start) * 1000), "error": None}
            if resp.status_code == 429 and _is_daily_quota_error(resp.text):
                return {"success": False, "text": None, "served_by": None, "quota_exhausted": True,
                        "latency_ms": int((time.time() - start) * 1000), "error": DAILY_QUOTA_MESSAGE}
            err = data.get("error")
            last_error = (err.get("message") if isinstance(err, dict) else None) or f"HTTP {resp.status_code}: {resp.text[:120]}"
        except requests.exceptions.RequestException as e:
            last_error = f"{type(e).__name__}: {e}"[:160]
        time.sleep(min(2.0 * (attempt + 1), max(0.0, timeout_s - (time.time() - start) - 1)))

    return {"success": False, "text": None, "served_by": None,
            "latency_ms": int((time.time() - start) * 1000),
            "error": f"Could not read the attached image(s): {last_error}"}


class ModelAdapter:
    """
    Executes inference and records measured latency back to the shared registry.
    """

    def call_model(self, profile: ModelProfile, prompt: str, timeout_ms: int = 5000, images: list | None = None) -> dict:
        result = _call_openrouter(profile, prompt, timeout_ms, images)

        # Record actual execution latency (concept C: measured latency)
        # Distinct from judge-configured latency estimate (concept A)
        if result.get("latency_ms"):
            registry.record_measured_latency(profile.model_key, result["latency_ms"])

        return result
