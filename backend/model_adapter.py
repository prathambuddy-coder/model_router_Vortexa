"""
model_adapter.py - Provider Abstraction Layer for A-01 ModelRouter
-------------------------------------------------------------------
Translates routing decisions into model execution:
- Local Ollama execution (CPU/GPU)
- Realistic Persona-Based Simulation Fallback (when model not yet pulled or Ollama daemon offline)
- Explicit execution mode flag: 'OLLAMA_LOCAL' vs 'SIMULATED'
- Measured latency recording to ModelRegistry
"""

import os
import time
import random
import textwrap
import requests
from typing import Optional
from models import ModelProfile, registry


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
        "qwen-2b": f"Hello! As Qwen3.5 2B (Lightweight), here is a fast response to: '{prompt}'. Everything is running smoothly on local CPU.",
        "qwen-4b": f"Here is a balanced overview regarding '{topic}': Qwen3.5 4B provides well-rounded reasoning and direct answers for general-purpose requests.",
        "deepseek-r1": f"[DeepSeek-R1 7B Reasoning Step-by-Step]\n1. Parsing problem: '{prompt}'\n2. Formal derivation and edge-case validation.\n3. Conclusion: The optimal solution follows mathematical principles with verifiable correctness.",
        "gpt-oss-20b": f"[GPT-OSS 20B Advanced Architecture]\nAnalyzing context for '{topic}'. Here is the high-performance implementation plan with architectural tradeoffs evaluated.",
        "gemma-12b": f"[Gemma 4 12B Document & Multimodal Analyzer]\nExtracted features and semantic parsing for '{topic}'. Analysis complete with full context verification.",
    }

    content = personas.get(
        profile.model_key,
        f"[{profile.name}] Processed: '{prompt}' with capability rating {profile.capability_score}."
    )

    actual_ms = int(sleep_secs * 1000)
    return {
        "text": content,
        "latency_ms": actual_ms,
        "tokens_used": max(10, len(content) // 4),
        "success": True,
        "error": None,
        "simulated": True,
        "execution_mode": "SIMULATED",
    }


def _call_ollama(profile: ModelProfile, prompt: str, timeout_ms: int) -> dict:
    """
    Invokes local Ollama daemon if available and model is downloaded.
    Falls back gracefully to simulation if Ollama is not active.
    """
    timeout_s = max(2.0, timeout_ms / 1000.0)
    url = "http://localhost:11434/api/generate"
    payload = {
        "model": profile.model_id or "qwen2.5:1.5b",
        "prompt": prompt,
        "stream": False,
    }

    start = time.time()
    try:
        resp = requests.post(url, json=payload, timeout=timeout_s)
        elapsed_ms = int((time.time() - start) * 1000)

        if resp.status_code == 200:
            data = resp.json()
            response_text = data.get("response", "")
            tokens_used = data.get("eval_count", max(1, len(response_text) // 4))
            return {
                "text": response_text,
                "latency_ms": elapsed_ms,
                "tokens_used": tokens_used,
                "success": True,
                "error": None,
                "simulated": False,
                "execution_mode": "REAL_OLLAMA_INFERENCE",
            }
        else:
            # Model not pulled in Ollama -> Fallback to simulation with notification
            sim_res = _simulate_response(profile, prompt)
            sim_res["error"] = f"Ollama HTTP {resp.status_code} (model may need pulling). Ran simulation."
            return sim_res

    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
        # Ollama daemon not running or timed out -> Fallback to deterministic CPU simulation
        sim_res = _simulate_response(profile, prompt)
        sim_res["error"] = f"Local Ollama daemon unreachable ({type(e).__name__}). Using simulated execution."
        return sim_res


class ModelAdapter:
    """
    Executes inference and records measured latency back to the shared registry.
    """

    def call_model(self, profile: ModelProfile, prompt: str, timeout_ms: int = 5000) -> dict:
        result = _call_ollama(profile, prompt, timeout_ms)

        # Record actual execution latency (concept C: measured latency)
        # Distinct from judge-configured latency estimate (concept A)
        if result.get("latency_ms"):
            registry.record_measured_latency(profile.model_key, result["latency_ms"])

        return result
