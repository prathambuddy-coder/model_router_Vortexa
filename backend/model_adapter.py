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
MAX_COMPLETION_TOKENS = 2048

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


def _call_openrouter(profile: ModelProfile, prompt: str, timeout_ms: int) -> dict:
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

    # Enforceable client-side wall-clock timeout limit (capped between 8s and 25s)
    effective_timeout = min(25.0, max(8.0, float(timeout_ms) / 1000.0 if timeout_ms else 15.0))
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_REFERER", "http://localhost:3000"),
        "X-Title": os.environ.get("OPENROUTER_TITLE", "ModelRouter Gateway"),
    }
    payload = {
        "model": profile.model_id or "liquid/lfm-2.5-2.6b:free",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "max_tokens": MAX_COMPLETION_TOKENS,
    }

    start = time.time()
    try:
        # Run HTTP post in thread with strict wall-clock deadline
        future = _http_pool.submit(
            requests.post,
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            timeout=effective_timeout,
        )
        try:
            resp = future.result(timeout=effective_timeout)
        except concurrent.futures.TimeoutError:
            future.cancel()  # no-op if already running; the worker finishes in the background
            raise

        elapsed_ms = int((time.time() - start) * 1000)

        if resp.status_code == 200:
            data = resp.json()
            choices = data.get("choices", [])
            response_text = ""
            if choices and isinstance(choices, list):
                msg = choices[0].get("message", {})
                response_text = msg.get("content", "")

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
            }
        else:
            # OpenRouter returned non-200 (rate limit, quota, server error) -> Trigger failover
            elapsed_ms = int((time.time() - start) * 1000)
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


class ModelAdapter:
    """
    Executes inference and records measured latency back to the shared registry.
    """

    def call_model(self, profile: ModelProfile, prompt: str, timeout_ms: int = 5000) -> dict:
        result = _call_openrouter(profile, prompt, timeout_ms)

        # Record actual execution latency (concept C: measured latency)
        # Distinct from judge-configured latency estimate (concept A)
        if result.get("latency_ms"):
            registry.record_measured_latency(profile.model_key, result["latency_ms"])

        return result
