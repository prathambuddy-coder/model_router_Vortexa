"""
Router Engine - Core constraint-based model selection logic.

Guiding Principles from Problem Statement:
1. Hard constraints are NEVER violated (latency, cost, capability, context length, availability)
2. Among valid models, choose according to stated preference (balanced, lowest latency, lowest cost, highest capability)
3. Every decision is explainable with candidate evaluation breakdown
4. Failover must NEVER relax a constraint
5. If no model can meet the constraints, say so clearly rather than sending to an invalid model
6. Complexity is estimated with uncertainty buffers, picking the safer option
"""

from __future__ import annotations
import uuid
from typing import Optional

from app.core.model_registry import ModelEntry, ModelRegistry
from app.core.complexity_estimator import analyze_complexity
from app.schemas import (
    InferenceRequest,
    RoutingDecision,
    ModelCandidate,
    OptimizationPreference,
    ComplexityAnalysis,
)


def estimate_required_context(prompt: str) -> int:
    """Estimate required context tokens from prompt length (~4 chars/token + response buffer)."""
    estimated_prompt_tokens = len(prompt) / 4.0
    # Add buffer for system instructions and response generation
    return int(max(512, estimated_prompt_tokens * 3.0))


def compute_model_score(
    model: ModelEntry,
    preference: OptimizationPreference,
    task_types: list[str],
    complexity_analysis: ComplexityAnalysis,
) -> tuple[float, dict[str, float]]:
    """
    Compute explainable score and breakdown for an eligible model.
    Higher score = better choice for the specified preference.
    """
    # 1. Latency score (0 to 100): 100 for 500ms, decreasing with higher latency
    latency_metric = max(100.0 - (model.avg_latency_ms / 100.0), 5.0)

    # 2. Capability score (0 to 100): scale 1-10 to 10-100
    capability_metric = model.capability_score * 10.0

    # 3. Reliability score (0 to 100): scale 0.0-1.0 to 0-100
    reliability_metric = model.reliability * 100.0

    # 4. Task suitability bonus (0 to 100)
    matching_tasks = [t for t in task_types if t in model.task_suitability]
    task_match_ratio = (len(matching_tasks) / max(len(task_types), 1)) if task_types else 0.5
    task_metric = task_match_ratio * 100.0

    # 5. Load penalty
    load_penalty = float(model.current_load * 4.0)

    # 6. Cost metric
    cost_metric = max(100.0 - (model.cost_per_1k_tokens * 1000.0), 0.0)

    # Weights by optimization preference
    if preference == OptimizationPreference.LOWEST_LATENCY:
        w_lat, w_cap, w_rel, w_task, w_cost = 0.60, 0.10, 0.15, 0.10, 0.05
    elif preference == OptimizationPreference.HIGHEST_CAPABILITY:
        w_lat, w_cap, w_rel, w_task, w_cost = 0.10, 0.55, 0.15, 0.15, 0.05
    elif preference == OptimizationPreference.LOWEST_COST:
        # For local zero-cost models, latency acts as primary differentiator
        w_lat, w_cap, w_rel, w_task, w_cost = 0.40, 0.15, 0.15, 0.10, 0.20
    else:  # BALANCED
        w_lat, w_cap, w_rel, w_task, w_cost = 0.25, 0.30, 0.20, 0.20, 0.05

    lat_contrib = latency_metric * w_lat
    cap_contrib = capability_metric * w_cap
    rel_contrib = reliability_metric * w_rel
    task_contrib = task_metric * w_task
    cost_contrib = cost_metric * w_cost

    final_score = lat_contrib + cap_contrib + rel_contrib + task_contrib + cost_contrib - load_penalty

    # Tier adjustments (slight preference for essential/stable models over experimental in balanced)
    if model.tier.value == "experimental" and preference == OptimizationPreference.BALANCED:
        final_score -= 3.0

    breakdown = {
        "latency_contribution": round(lat_contrib, 2),
        "capability_contribution": round(cap_contrib, 2),
        "reliability_contribution": round(rel_contrib, 2),
        "task_suitability_bonus": round(task_contrib, 2),
        "cost_contribution": round(cost_contrib, 2),
        "load_penalty": round(load_penalty, 2),
        "final_score": round(max(final_score, 0.1), 2),
    }

    return round(final_score, 2), breakdown


def route_request(
    request: InferenceRequest,
    registry: ModelRegistry,
) -> RoutingDecision:
    """
    Main routing gateway algorithm.

    Step 1: Content analysis and safe complexity estimation.
    Step 2: Hard constraint filter (Strict - zero violations tolerated).
    Step 3: Multi-parameter scoring among valid models.
    Step 4: Primary model selection & fallback chain formation.
    Step 5: Full explainability payload assembly.
    """
    request_id = str(uuid.uuid4())[:8]

    # Step 1: Query complexity analysis with uncertainty safety buffer
    complexity_analysis = analyze_complexity(request.prompt)

    # Determine required context
    required_context = request.required_context_length
    if required_context is None:
        required_context = estimate_required_context(request.prompt)

    # Effective minimum capability: explicit user constraint has highest priority;
    # if omitted, use the safe recommended capability derived from query complexity
    effective_min_cap = request.min_capability_score
    if effective_min_cap is None and complexity_analysis.complexity.value in ["complex", "very_complex"]:
        effective_min_cap = complexity_analysis.recommended_min_capability

    # Step 2: Evaluate every candidate model against hard constraints
    candidates: list[ModelCandidate] = []
    eligible_models: list[tuple[ModelEntry, float, dict[str, float]]] = []

    for model in registry.get_all():
        rejection_reasons: list[str] = []
        checks: dict[str, bool] = {}

        # Check 1: Enabled
        if not model.enabled:
            rejection_reasons.append("Model is disabled in system configuration")
            checks["enabled"] = False
        else:
            checks["enabled"] = True

        # Check 2: Available
        if not model.available:
            rejection_reasons.append("Model is currently offline / unavailable")
            checks["availability"] = False
        else:
            checks["availability"] = True

        # Check 3: Max Latency Constraint (Hard condition: model's max latency must be within budget)
        if request.max_latency_ms is not None:
            if model.max_latency_ms > request.max_latency_ms:
                rejection_reasons.append(
                    f"Worst-case latency ({model.max_latency_ms}ms) breaches budget ({request.max_latency_ms}ms)"
                )
                checks["latency"] = False
            else:
                checks["latency"] = True
        else:
            checks["latency"] = True

        # Check 4: Max Cost Constraint
        if request.max_cost_per_1k_tokens is not None:
            if model.cost_per_1k_tokens > request.max_cost_per_1k_tokens:
                rejection_reasons.append(
                    f"Cost (${model.cost_per_1k_tokens}/1K tokens) exceeds limit (${request.max_cost_per_1k_tokens})"
                )
                checks["cost"] = False
            else:
                checks["cost"] = True
        else:
            checks["cost"] = True

        # Check 5: Capability Constraint
        if effective_min_cap is not None:
            if model.capability_score < effective_min_cap:
                rule_src = "explicit constraint" if request.min_capability_score else "safe query complexity requirement"
                rejection_reasons.append(
                    f"Capability score {model.capability_score}/10 is below required {effective_min_cap} ({rule_src})"
                )
                checks["capability"] = False
            else:
                checks["capability"] = True
        else:
            checks["capability"] = True

        # Check 6: Required Context Length
        if required_context is not None:
            if model.context_length < required_context:
                rejection_reasons.append(
                    f"Context length {model.context_length} tokens insufficient for required {required_context} tokens"
                )
                checks["context"] = False
            else:
                checks["context"] = True
        else:
            checks["context"] = True

        # Check 7: Output token capacity
        if request.min_output_tokens is not None:
            if model.output_token_capacity < request.min_output_tokens:
                rejection_reasons.append(
                    f"Output capacity {model.output_token_capacity} tokens below requested {request.min_output_tokens}"
                )
                checks["output_tokens"] = False
            else:
                checks["output_tokens"] = True
        else:
            checks["output_tokens"] = True

        eligible = len(rejection_reasons) == 0

        # Calculate score and breakdown if eligible
        score: Optional[float] = None
        breakdown: Optional[dict[str, float]] = None
        if eligible:
            score, breakdown = compute_model_score(
                model=model,
                preference=request.optimization,
                task_types=complexity_analysis.suggested_task_types,
                complexity_analysis=complexity_analysis,
            )
            eligible_models.append((model, score, breakdown))

        candidates.append(
            ModelCandidate(
                model_id=model.id,
                model_name=model.name,
                role=model.role,
                download_size=model.download_size,
                recommendation=model.recommendation,
                eligible=eligible,
                rejection_reasons=rejection_reasons,
                constraint_checks=checks,
                score=score,
                score_breakdown=breakdown,
                capability_score=model.capability_score,
                avg_latency_ms=model.avg_latency_ms,
                max_latency_ms=model.max_latency_ms,
                context_length=model.context_length,
                cost_per_1k_tokens=model.cost_per_1k_tokens,
                reliability=model.reliability,
                output_token_capacity=model.output_token_capacity,
                current_load=model.current_load,
                task_suitability=model.task_suitability,
                tier=model.tier,
            )
        )

    # Step 3: Handle scenario where NO model satisfies constraints
    if not eligible_models:
        constraint_summaries: list[str] = []
        if request.max_latency_ms is not None:
            constraint_summaries.append(f"Max Latency <= {request.max_latency_ms}ms")
        if request.max_cost_per_1k_tokens is not None:
            constraint_summaries.append(f"Max Cost <= ${request.max_cost_per_1k_tokens}")
        if effective_min_cap is not None:
            constraint_summaries.append(f"Min Capability >= {effective_min_cap}")
        if required_context is not None:
            constraint_summaries.append(f"Min Context >= {required_context} tokens")
        if request.min_output_tokens is not None:
            constraint_summaries.append(f"Min Output Tokens >= {request.min_output_tokens}")

        constraints_str = "; ".join(constraint_summaries) if constraint_summaries else "All models currently offline"
        reason = (
            f"No candidate model satisfies all hard constraints [{constraints_str}]. "
            f"All {len(candidates)} models were evaluated and rejected. "
            f"To protect reliability and SLA agreements, the request was NOT dispatched to an invalid model."
        )

        return RoutingDecision(
            request_id=request_id,
            selected_model_id=None,
            selected_model_name=None,
            complexity_analysis=complexity_analysis,
            estimated_complexity=complexity_analysis.complexity,
            candidates=candidates,
            selection_reason="Constraint violation: No model meets all hard conditions.",
            fallback_chain=[],
            no_valid_model=True,
            no_valid_model_reason=reason,
        )

    # Step 4: Sort eligible models descending by score
    eligible_models.sort(key=lambda item: item[1], reverse=True)
    best_model, best_score, _ = eligible_models[0]

    # Pre-computed fallback chain of all other valid models in priority order
    fallback_chain = [m.id for m, _, _ in eligible_models[1:]]

    # Build human-readable selection explanation
    pref_label = request.optimization.value.replace("_", " ").title()
    selection_reason = (
        f"Selected '{best_model.name}' with top composite score of {best_score:.2f} "
        f"optimizing for {pref_label}. "
        f"{len(eligible_models)} of {len(candidates)} models met all hard constraints. "
        f"Query estimated as '{complexity_analysis.complexity.value.upper()}' "
        f"({complexity_analysis.confidence_score * 100:.0f}% confidence"
        f"{', safer tier applied' if complexity_analysis.uncertainty_applied else ''})."
    )

    return RoutingDecision(
        request_id=request_id,
        selected_model_id=best_model.id,
        selected_model_name=best_model.name,
        complexity_analysis=complexity_analysis,
        estimated_complexity=complexity_analysis.complexity,
        candidates=candidates,
        selection_reason=selection_reason,
        fallback_chain=fallback_chain,
        no_valid_model=False,
        no_valid_model_reason=None,
    )


def verify_model_meets_constraints(
    model: ModelEntry,
    request: InferenceRequest,
) -> bool:
    """
    Strictly verify that a model satisfies all hard constraints.
    Used before executing ANY fallback model to mathematically ensure
    that failover NEVER relaxes a constraint!
    """
    if not model.enabled or not model.available:
        return False
    if request.max_latency_ms is not None and model.max_latency_ms > request.max_latency_ms:
        return False
    if request.max_cost_per_1k_tokens is not None and model.cost_per_1k_tokens > request.max_cost_per_1k_tokens:
        return False
    if request.min_capability_score is not None and model.capability_score < request.min_capability_score:
        return False
    if request.required_context_length is not None and model.context_length < request.required_context_length:
        return False
    if request.min_output_tokens is not None and model.output_token_capacity < request.min_output_tokens:
        return False
    return True


def get_fallback_decision(
    original_decision: RoutingDecision,
    failed_model_id: str,
    registry: ModelRegistry,
    request: InferenceRequest,
) -> Optional[str]:
    """
    Fetch the next fallback model from the pre-computed chain.
    Double-checks hard constraints against current state so failover NEVER relaxes constraints.
    """
    if failed_model_id in original_decision.fallback_chain:
        original_decision.fallback_chain.remove(failed_model_id)

    while original_decision.fallback_chain:
        next_model_id = original_decision.fallback_chain[0]
        model = registry.get(next_model_id)
        if model and verify_model_meets_constraints(model, request):
            return next_model_id
        else:
            # If runtime condition changed (e.g. model became unavailable), discard and try next
            original_decision.fallback_chain.pop(0)

    return None
