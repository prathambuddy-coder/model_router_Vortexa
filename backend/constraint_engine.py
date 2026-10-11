"""
constraint_engine.py - Hard & Soft Constraint Evaluation for A-01 ModelRouter
------------------------------------------------------------------------------
Handles:
1. Hard constraint checking (Bouncer):
   - Availability and enabled status
   - Max latency deadline budget (model.max_latency_ms <= request.max_latency_ms)
   - Capability score floor (model.capability_score >= request.min_capability)
   - Context length capacity (model.context_length >= request.min_context_length)
   - Cost ceiling (model.cost_per_token <= request.max_cost_per_token)
2. Soft scoring & ranking:
   - lowest_latency / fastest: Ranks by model.avg_latency_ms
   - cheapest: Ranks by cost_per_1k_tokens
   - highest_capability: Ranks by model.capability_score
   - balanced: Weighted scoring incorporating latency, cost, and capability
"""

from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
from models import ModelProfile


@dataclass
class CheckResult:
    """Result of evaluating a single model against hard constraints."""
    passes: bool
    violations: List[str]


@dataclass
class RankedModel:
    """A model paired with its computed preference score."""
    model_key: str
    profile: ModelProfile
    score: float
    score_breakdown: Dict[str, float]


class ConstraintEngine:
    """
    Evaluates model profiles against user/judge constraints.
    """

    _MAX_LATENCY_REF = 10000.0  # ms normalisation ceiling
    _MAX_COST_REF = 0.001       # normalisation ceiling

    _PREFERENCE_WEIGHTS = {
        "cheapest": {"cost": 0.70, "latency": 0.20, "quality": 0.10},
        "fastest": {"cost": 0.05, "latency": 0.85, "quality": 0.10},
        "lowest_latency": {"cost": 0.05, "latency": 0.85, "quality": 0.10},
        "highest_capability": {"cost": 0.05, "latency": 0.10, "quality": 0.85},
        "quality": {"cost": 0.05, "latency": 0.10, "quality": 0.85},
        "balanced": {"cost": 0.20, "latency": 0.45, "quality": 0.35},
    }
    _DEFAULT_PREFERENCE = "balanced"

    def check_model(self, model: ModelProfile, constraints: dict) -> CheckResult:
        """
        Evaluate a model against hard non-negotiable constraints.
        Violating even one constraint causes immediate rejection.
        """
        violations: List[str] = []

        # 1. Availability & Enabled status
        if not model.availability or not model.enabled:
            status_desc = []
            if not model.availability:
                status_desc.append("offline/unavailable")
            if not model.enabled:
                status_desc.append("disabled")
            violations.append(f"Model is {' and '.join(status_desc)}")

        # 2. Hard Latency Deadline:
        # Check against model's configured max_latency_ms (or avg_latency_ms)
        max_lat_budget = constraints.get("max_latency_ms")
        if max_lat_budget is not None and max_lat_budget > 0:
            # If model's configured upper-bound latency exceeds request deadline
            effective_model_latency = getattr(model, "max_latency_ms", model.avg_latency_ms)
            if effective_model_latency > max_lat_budget:
                violations.append(
                    f"Configured latency bound ({effective_model_latency}ms) exceeds request deadline ({max_lat_budget}ms)"
                )

        # 3. Capability floor
        min_cap = constraints.get("min_capability")
        if min_cap is None:
            min_cap = constraints.get("min_capability_score")
        if min_cap is not None and min_cap > 0:
            if model.capability_score < min_cap:
                violations.append(
                    f"Capability score ({model.capability_score:.1f}) is below minimum required ({min_cap})"
                )

        # 4. Context window floor
        min_ctx = constraints.get("min_context_length")
        if min_ctx is None:
            min_ctx = constraints.get("required_context_length")
        if min_ctx is not None and min_ctx > 0:
            if model.context_length < min_ctx:
                violations.append(
                    f"Context capacity ({model.context_length}) is below required ({min_ctx})"
                )

        # 5. Cost ceiling
        max_cost = constraints.get("max_cost_per_token")
        if max_cost is None and "max_cost_per_1k_tokens" in constraints:
            max_cost = constraints["max_cost_per_1k_tokens"] / 1000.0
        if max_cost is not None and max_cost > 0:
            if model.cost_per_token > max_cost:
                violations.append(
                    f"Cost (${model.cost_per_token:.6f}/tok) exceeds max budget (${max_cost:.6f}/tok)"
                )

        return CheckResult(passes=len(violations) == 0, violations=violations)

    def rank_models(
        self,
        models: List[ModelProfile],
        preference: Optional[str] = None,
    ) -> List[RankedModel]:
        """
        Rank eligible candidates according to user preference.
        """
        pref = (preference or self._DEFAULT_PREFERENCE).lower()

        # Direct single-criterion optimizations
        if pref in ("fastest", "lowest_latency"):
            # Sort ascending by avg_latency_ms (lowest latency first)
            sorted_models = sorted(models, key=lambda m: (m.avg_latency_ms, -m.capability_score))
            ranked = []
            for idx, m in enumerate(sorted_models):
                score = round(max(0.1, 1.0 - (m.avg_latency_ms / self._MAX_LATENCY_REF)), 3)
                ranked.append(RankedModel(
                    model_key=m.model_key,
                    profile=m,
                    score=score,
                    score_breakdown={
                        "latency_rank": idx + 1,
                        "avg_latency_ms": m.avg_latency_ms,
                        "capability_score": m.capability_score,
                    }
                ))
            return ranked

        elif pref == "highest_capability":
            sorted_models = sorted(models, key=lambda m: (-m.capability_score, m.avg_latency_ms))
            ranked = []
            for idx, m in enumerate(sorted_models):
                score = round(m.capability_score / 10.0, 3)
                ranked.append(RankedModel(
                    model_key=m.model_key,
                    profile=m,
                    score=score,
                    score_breakdown={
                        "capability_rank": idx + 1,
                        "capability_score": m.capability_score,
                        "avg_latency_ms": m.avg_latency_ms,
                    }
                ))
            return ranked

        elif pref == "cheapest":
            sorted_models = sorted(models, key=lambda m: (m.cost_per_1k_tokens, m.avg_latency_ms))
            ranked = []
            for idx, m in enumerate(sorted_models):
                score = round(max(0.1, 1.0 - (m.cost_per_token / self._MAX_COST_REF)), 3)
                ranked.append(RankedModel(
                    model_key=m.model_key,
                    profile=m,
                    score=score,
                    score_breakdown={
                        "cost_rank": idx + 1,
                        "cost_per_1k_tokens": m.cost_per_1k_tokens,
                        "avg_latency_ms": m.avg_latency_ms,
                    }
                ))
            return ranked

        # Balanced weighted scoring
        weights = self._PREFERENCE_WEIGHTS.get(pref, self._PREFERENCE_WEIGHTS["balanced"])
        ranked = []
        for m in models:
            scores = self._compute_scores(m)
            total = (
                weights["cost"] * scores["cost_score"]
                + weights["latency"] * scores["latency_score"]
                + weights["quality"] * scores["quality_score"]
            )
            ranked.append(RankedModel(
                model_key=m.model_key,
                profile=m,
                score=round(total, 3),
                score_breakdown={
                    **scores,
                    "avg_latency_ms": m.avg_latency_ms,
                    "weights": weights,
                }
            ))

        ranked.sort(key=lambda r: r.score, reverse=True)
        return ranked

    def _compute_scores(self, model: ModelProfile) -> Dict[str, float]:
        norm_cost = min(1.0, model.cost_per_token / self._MAX_COST_REF)
        norm_lat = min(1.0, model.avg_latency_ms / self._MAX_LATENCY_REF)
        quality_score = min(1.0, max(0.1, model.capability_score / 10.0))

        return {
            "cost_score": round(1.0 - norm_cost, 3),
            "latency_score": round(1.0 - norm_lat, 3),
            "quality_score": round(quality_score, 3),
        }

    def validate_constraints(self, constraints: dict) -> Tuple[bool, List[str]]:
        errors: List[str] = []
        if not isinstance(constraints, dict):
            return False, ["constraints must be a JSON object"]

        for key in ("max_latency_ms", "min_context_length", "required_context_length"):
            if key in constraints and constraints[key] is not None:
                if not isinstance(constraints[key], (int, float)) or constraints[key] <= 0:
                    errors.append(f"'{key}' must be positive")

        for key in ("min_capability", "min_capability_score"):
            if key in constraints and constraints[key] is not None:
                val = constraints[key]
                if not isinstance(val, (int, float)) or not (1 <= val <= 10):
                    errors.append(f"'{key}' must be between 1 and 10")

        return len(errors) == 0, errors
