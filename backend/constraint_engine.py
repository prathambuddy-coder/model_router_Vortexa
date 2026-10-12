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


def is_vision_capable(model: ModelProfile) -> bool:
    return "multimodal" in model.role.lower() or "vision" in model.role.lower()


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

        # 6. Vision support (set by the gateway when images are attached)
        if constraints.get("requires_vision") and not is_vision_capable(model):
            violations.append("Model cannot read images (vision required for attached image)")

        return CheckResult(passes=len(violations) == 0, violations=violations)

    # Every preference scores ALL judge-editable parameters, so changing any of
    # them on a model (latency, cost, capability, context, reliability) can move
    # the routing decision. Preferences only change how much each one counts.
    _RANK_WEIGHTS = {
        "lowest_latency":     {"latency": 0.80, "cost": 0.10, "quality": 0.05, "context": 0.03, "reliability": 0.02},
        "cheapest":           {"cost": 0.70, "latency": 0.20, "quality": 0.05, "context": 0.03, "reliability": 0.02},
        "highest_capability": {"quality": 0.65, "latency": 0.20, "reliability": 0.10, "cost": 0.03, "context": 0.02},
        "coding_specialist":  {"specialty": 0.30, "quality": 0.30, "latency": 0.32, "cost": 0.05, "context": 0.03},
        "multimodal_specialist": {"specialty": 0.30, "quality": 0.30, "latency": 0.32, "cost": 0.05, "context": 0.03},
        "balanced":           {"latency": 0.40, "quality": 0.32, "cost": 0.18, "context": 0.05, "reliability": 0.05},
    }
    _PREFERENCE_ALIASES = {
        "fastest": "lowest_latency",
        "quality": "highest_capability",
        "coding": "coding_specialist",
        "multimodal": "multimodal_specialist",
    }

    def rank_models(
        self,
        models: List[ModelProfile],
        preference: Optional[str] = None,
    ) -> List[RankedModel]:
        """
        Rank eligible candidates by a weighted score over every model parameter.
        """
        pref = (preference or self._DEFAULT_PREFERENCE).lower()
        pref = self._PREFERENCE_ALIASES.get(pref, pref)
        weights = self._RANK_WEIGHTS.get(pref, self._RANK_WEIGHTS[self._DEFAULT_PREFERENCE])

        # Context is scored relative to the largest window among the candidates
        max_ctx = max((m.context_length for m in models), default=1) or 1

        ranked = []
        for m in models:
            scores = self._compute_scores(m, max_ctx)
            scores["specialty_score"] = self._specialty_score(m, pref)
            total = sum(w * scores[f"{dim}_score"] for dim, w in weights.items())
            # When preference is balanced/general, give balanced generalist models higher affinity
            if pref == "balanced":
                if "balanced" in m.role.lower():
                    total += 0.12
                elif "coding" in m.role.lower():
                    total -= 0.05
            elif pref == "highest_capability":
                if "reasoning" in m.role.lower():
                    total += 0.08
                elif "coding" in m.role.lower():
                    total -= 0.05
            ranked.append(RankedModel(
                model_key=m.model_key,
                profile=m,
                score=round(total, 3),
                score_breakdown={
                    **scores,
                    "avg_latency_ms": m.avg_latency_ms,
                    "capability_score": m.capability_score,
                    "cost_per_1k_tokens": m.cost_per_1k_tokens,
                    "context_length": m.context_length,
                    "weights": weights,
                }
            ))

        ranked.sort(key=lambda r: (r.score, -r.profile.avg_latency_ms), reverse=True)
        for idx, r in enumerate(ranked):
            r.score_breakdown["rank"] = idx + 1
        return ranked

    @staticmethod
    def _specialty_score(model: ModelProfile, pref: str) -> float:
        role = model.role.lower()
        if pref == "coding_specialist":
            return 1.0 if ("coding" in role or "code" in model.model_key.lower()) else 0.4
        if pref == "multimodal_specialist":
            return 1.0 if ("multimodal" in role or "gemma" in model.model_key.lower()) else 0.4
        return 0.0

    def _compute_scores(self, model: ModelProfile, max_ctx: int = 0) -> Dict[str, float]:
        norm_cost = min(1.0, model.cost_per_token / self._MAX_COST_REF)
        norm_lat = min(1.0, model.avg_latency_ms / self._MAX_LATENCY_REF)
        quality_score = min(1.0, max(0.1, model.capability_score / 10.0))
        context_score = min(1.0, model.context_length / max_ctx) if max_ctx else 1.0

        return {
            "cost_score": round(1.0 - norm_cost, 3),
            "latency_score": round(1.0 - norm_lat, 3),
            "quality_score": round(quality_score, 3),
            "context_score": round(context_score, 3),
            "reliability_score": round(min(1.0, max(0.0, model.reliability)), 3),
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
