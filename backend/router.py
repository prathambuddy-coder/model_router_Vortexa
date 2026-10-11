"""
router.py - The Brain of A-01 ModelRouter
------------------------------------------
The backend server autonomously decides the model based on:
1. User prompt complexity analysis
2. Models' manipulated features (configured by judges: avg_latency_ms, max_latency_ms, availability, enabled)

If a judge spikes a model's latency or marks it offline, the backend's
routing engine automatically and dynamically selects a valid alternative.
"""

import re
import uuid
from typing import Dict, List, Optional
from models import ModelProfile
from constraint_engine import ConstraintEngine


# Keywords indicating reasoning complexity
_KEYWORDS_COMPLEXITY = [
    # Reasoning-Intensive / Mathematical / Proof (+3.5)
    ("dijkstra", 4.0), ("algorithm", 3.0), ("dynamic programming", 3.5),
    ("proof", 3.5), ("theorem", 3.5), ("mathematical", 3.0), ("derive", 3.0),
    ("cryptography", 3.5), ("distributed", 3.5), ("consensus", 3.5),
    # Complex Architecture & Code (+2.5)
    ("architecture", 2.5), ("microservice", 2.5), ("concurrency", 2.5),
    ("optimize", 2.0), ("refactor", 2.0), ("debug", 2.0), ("benchmark", 2.0),
    ("implement", 2.0), ("database", 2.0),
    # Moderate queries (+1.5)
    ("analyze", 1.5), ("compare", 1.5), ("explain", 1.5), ("evaluate", 1.5),
    ("tradeoff", 1.5), ("difference", 1.2),
]


def _analyze_complexity(prompt: str) -> dict:
    """
    Server-side prompt complexity analyzer.
    Classifies prompt and determines appropriate capability/latency requirements.
    """
    cleaned = prompt.strip().lower()
    words = cleaned.split()
    word_count = len(words)

    if word_count <= 2 and any(g in cleaned for g in ("hi", "hii", "hello", "hey", "test")):
        return {
            "score": 1.5,
            "label": "SIMPLE",
            "inferred_min_capability": 2.0,
            "inferred_max_latency_ms": 4000,
            "preference": "lowest_latency",
            "explanation": "Short conversational greeting or simple check (prioritizes fastest response)",
        }

    score = 1.0
    score += min(3.0, (word_count / 30.0) * 3.0)

    kw_bonus = 0.0
    matched_kws = []
    for kw, weight in _KEYWORDS_COMPLEXITY:
        if kw in cleaned:
            kw_bonus += weight
            matched_kws.append(kw)
    score += min(4.5, kw_bonus)

    if "```" in prompt or "def " in prompt or "class " in prompt or "function " in prompt:
        score += 1.5

    final_score = round(min(10.0, max(1.0, score)), 1)

    if final_score >= 8.0:
        label = "REASONING_INTENSIVE"
        inferred_cap = 8.5
        inferred_max_latency = 10000
        pref = "highest_capability"
    elif final_score >= 5.0:
        label = "COMPLEX"
        inferred_cap = 7.0
        inferred_max_latency = 8000
        pref = "highest_capability"
    elif final_score >= 3.0:
        label = "MODERATE"
        inferred_cap = 4.0
        inferred_max_latency = 4000
        pref = "balanced"
    else:
        label = "SIMPLE"
        inferred_cap = 2.0
        inferred_max_latency = 3000
        pref = "lowest_latency"

    return {
        "score": final_score,
        "label": label,
        "inferred_min_capability": inferred_cap,
        "inferred_max_latency_ms": inferred_max_latency,
        "preference": pref,
        "matched_keywords": matched_kws[:4],
        "explanation": f"Classified as {label} ({final_score}/10) based on token count and keyword demand.",
    }


class ModelRouter:
    """
    Evaluates prompt + models from shared registry.
    Completely server-driven selection based on prompt complexity and judge-configured model features.
    """

    def __init__(self):
        self._engine = ConstraintEngine()

    def route(
        self,
        prompt: str,
        constraints: Optional[dict],
        models: Dict[str, ModelProfile],
        request_id: Optional[str] = None,
    ) -> dict:
        if request_id is None:
            request_id = str(uuid.uuid4())[:8]

        # 1. Complexity Estimation (Server Brain)
        complexity = _analyze_complexity(prompt)

        # Build effective constraints derived by backend logic
        effective_constraints = dict(constraints) if constraints else {}

        # If not explicitly specified by caller, use backend-derived constraints
        if "min_capability" not in effective_constraints and "min_capability_score" not in effective_constraints:
            effective_constraints["min_capability"] = complexity["inferred_min_capability"]

        if "max_latency_ms" not in effective_constraints:
            effective_constraints["max_latency_ms"] = complexity["inferred_max_latency_ms"]

        if "preference" not in effective_constraints:
            effective_constraints["preference"] = complexity["preference"]

        preference = effective_constraints.get("preference", "balanced")

        # 2. Hard Constraint Filtering (Bouncer)
        passed_models: List[ModelProfile] = []
        candidate_list: List[dict] = []

        for model_key, profile in models.items():
            check = self._engine.check_model(profile, effective_constraints)
            if check.passes:
                passed_models.append(profile)
                candidate_list.append({
                    "model_id": model_key,
                    "model_key": model_key,
                    "name": profile.name,
                    "role": profile.role,
                    "status": "passed",
                    "rejection_reason": None,
                    "avg_latency_ms": profile.avg_latency_ms,
                    "max_latency_ms": profile.max_latency_ms,
                    "capability_score": profile.capability_score,
                    "cost_per_1k_tokens": profile.cost_per_1k_tokens,
                    "available": profile.available,
                    "score": None,
                })
            else:
                candidate_list.append({
                    "model_id": model_key,
                    "model_key": model_key,
                    "name": profile.name,
                    "role": profile.role,
                    "status": "rejected",
                    "rejection_reason": "; ".join(check.violations),
                    "avg_latency_ms": profile.avg_latency_ms,
                    "max_latency_ms": profile.max_latency_ms,
                    "capability_score": profile.capability_score,
                    "cost_per_1k_tokens": profile.cost_per_1k_tokens,
                    "available": profile.available,
                    "score": None,
                })

        # 3. Handle NO VALID MODEL
        if not passed_models:
            return {
                "request_id": request_id,
                "status": "NO_VALID_MODEL",
                "message": "No available model satisfies the prompt's required constraints.",
                "selected": None,
                "complexity": complexity,
                "effective_constraints": effective_constraints,
                "candidates": candidate_list,
                "preference_used": preference,
                "explanation": "All candidates were eliminated during hard constraint checking against judge configurations.",
                "failover_chain": [],
            }

        # 4. Soft Ranking & Selection
        ranked = self._engine.rank_models(passed_models, preference)
        winner = ranked[0]

        # Merge scores back into candidate list
        score_lookup = {r.model_key: r for r in ranked}
        for c in candidate_list:
            if c["status"] == "passed":
                rm = score_lookup.get(c["model_key"])
                if rm:
                    c["score"] = rm.score
                    c["score_breakdown"] = rm.score_breakdown
                    if rm.model_key == winner.model_key:
                        c["status"] = "selected"

        # Generate human-readable explanation
        win_m = winner.profile
        if preference in ("lowest_latency", "fastest"):
            reason = f"{win_m.name} selected as the fastest eligible model ({win_m.avg_latency_ms}ms avg latency) for this {complexity['label'].lower()} prompt."
        elif preference == "highest_capability":
            reason = f"{win_m.name} selected for highest capability rating ({win_m.capability_score}/10) demanded by {complexity['label'].lower()} prompt."
        elif preference == "cheapest":
            reason = f"{win_m.name} selected for lowest cost profile."
        else:
            reason = f"{win_m.name} selected with highest composite score ({winner.score}) balancing latency, cost, and quality."

        return {
            "request_id": request_id,
            "status": "SUCCESS",
            "selected": winner.model_key,
            "selected_name": win_m.name,
            "complexity": complexity,
            "effective_constraints": effective_constraints,
            "candidates": candidate_list,
            "preference_used": preference,
            "explanation": reason,
            "failover_chain": [],
        }
