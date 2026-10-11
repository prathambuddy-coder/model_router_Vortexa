"""
API Routes - All HTTP endpoints for the ModelRouter gateway.
Implements hard constraint routing, constraint-preserving failover,
judge runtime controls, and complete audit logging.
"""

from __future__ import annotations

import time
from fastapi import APIRouter, Request, HTTPException

from app.schemas import (
    InferenceRequest,
    InferenceResponse,
    ModelInfo,
    ModelConfigUpdate,
    HealthStatus,
    FallbackAttempt,
    FailureReason,
    AuditLogEntry,
)
from app.core.router_engine import (
    route_request,
    get_fallback_decision,
    verify_model_meets_constraints,
)
from app.core.ollama_client import call_model, check_ollama_health
from app.core.audit_logger import audit_logger
from app.core.model_registry import ModelRegistry

router = APIRouter()


def _get_registry(request: Request) -> ModelRegistry:
    return request.app.state.model_registry


# ─── Health ────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthStatus)
async def health_check(request: Request):
    """System health check showing loaded models and runtime status."""
    registry = _get_registry(request)
    ollama_ok = await check_ollama_health()
    return HealthStatus(
        status="healthy" if ollama_ok else "simulated_ready",
        models_loaded=registry.count,
        models_available=registry.available_count,
        ollama_connected=ollama_ok,
        mode="live_ollama" if ollama_ok else "intelligent_simulator",
    )


# ─── Models CRUD & Judge Controls ─────────────────────────────────────────────

@router.get("/models", response_model=list[ModelInfo])
async def list_models(request: Request):
    """List all registered models and their current state."""
    registry = _get_registry(request)
    return [m.to_info() for m in registry.get_all()]


@router.get("/models/{model_id}", response_model=ModelInfo)
async def get_model(model_id: str, request: Request):
    """Get a specific model's info."""
    registry = _get_registry(request)
    model = registry.get(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return model.to_info()


@router.patch("/models/{model_id}", response_model=ModelInfo)
async def update_model(model_id: str, update: ModelConfigUpdate, request: Request):
    """
    Update a model's configuration at runtime.
    Judges use this to change latency, availability, reliability, or load
    and see the router immediately adapt its decisions.
    """
    registry = _get_registry(request)
    model = registry.get(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")

    update_data = update.model_dump(exclude_none=True)
    model.update(**update_data)
    return model.to_info()


@router.post("/models/reset", response_model=list[ModelInfo])
async def reset_models(request: Request):
    """Reset all models back to initial default configuration (for Judges)."""
    registry = _get_registry(request)
    registry.reset_all()
    return [m.to_info() for m in registry.get_all()]


# ─── Inference Gateway (Core with Constraint-Preserving Failover) ───────────────

@router.post("/infer", response_model=InferenceResponse)
async def infer(req: InferenceRequest, request: Request):
    """
    Main inference endpoint with strict constraint enforcement and failover.

    1. Evaluates all hard constraints (latency, cost, capability, context, availability)
    2. If no model satisfies constraints, rejects request without dispatching to invalid models
    3. If valid model selected, dispatches request
    4. If model fails or breaches latency budget, fails over ONLY to remaining valid models
    5. Failover NEVER relaxes any constraint
    6. Logs entire execution path to audit logger
    """
    registry = _get_registry(request)
    start_time = time.time()

    # Step 1: Route the request based on hard constraints
    decision = route_request(req, registry)

    # Step 2: If no model meets hard constraints, return clear explanation immediately
    if decision.no_valid_model:
        elapsed = int((time.time() - start_time) * 1000)
        audit_logger.log(
            request_id=decision.request_id,
            prompt=req.prompt,
            constraints=_extract_constraints(req),
            routing_decision=decision,
            latency_ms=elapsed,
            success=False,
            error=decision.no_valid_model_reason,
        )
        return InferenceResponse(
            request_id=decision.request_id,
            response_text=None,
            model_used=None,
            model_name=None,
            routing_decision=decision,
            latency_ms=elapsed,
            success=False,
            error=decision.no_valid_model_reason,
            execution_type="rejected_by_constraints",
        )

    # Step 3: Attempt inference with primary model, then failover if necessary
    selected_model = registry.get(decision.selected_model_id)
    fallback_attempts: list[FallbackAttempt] = []
    fallback_used = False
    current_model = selected_model

    # The effective timeout cannot exceed the user's hard constraint
    effective_timeout_ms = req.max_latency_ms if req.max_latency_ms else current_model.max_latency_ms

    while current_model is not None:
        # Constraint-Preserving Invariant Check:
        # Ensure current candidate still satisfies every constraint before invoking
        if not verify_model_meets_constraints(current_model, req):
            # Model became invalid mid-process, skip to next
            next_model_id = get_fallback_decision(decision, current_model.id, registry, req)
            current_model = registry.get(next_model_id) if next_model_id else None
            continue

        current_model.total_requests += 1
        current_model.current_load += 1

        # Check for simulated failure flags requested by caller/judge
        simulate_fail = current_model.id in req.simulate_failure_model_ids
        simulate_timeout = req.force_timeout and not fallback_used

        result = await call_model(
            ollama_tag=current_model.ollama_tag,
            prompt=req.prompt,
            timeout_ms=effective_timeout_ms,
            model_id=current_model.id,
            model_name=current_model.name,
            avg_latency_ms=current_model.avg_latency_ms,
            is_available=current_model.available,
            force_failure=simulate_fail,
            force_timeout=simulate_timeout,
        )

        current_model.current_load = max(0, current_model.current_load - 1)

        # Check for Latency Budget Breach (Hard constraint!)
        latency_breach = False
        if req.max_latency_ms and result["latency_ms"] > req.max_latency_ms:
            latency_breach = True

        if result["success"] and not latency_breach:
            # Inference succeeded within hard constraints!
            elapsed = int((time.time() - start_time) * 1000)
            audit_logger.log(
                request_id=decision.request_id,
                prompt=req.prompt,
                constraints=_extract_constraints(req),
                routing_decision=decision,
                latency_ms=elapsed,
                success=True,
                fallback_used=fallback_used,
                fallback_attempts=len(fallback_attempts),
            )
            return InferenceResponse(
                request_id=decision.request_id,
                response_text=result["response_text"],
                model_used=current_model.id,
                model_name=current_model.name,
                routing_decision=decision,
                latency_ms=elapsed,
                fallback_used=fallback_used,
                fallback_attempts=fallback_attempts,
                success=True,
                execution_type=result.get("execution_type", "simulated"),
            )
        else:
            # Model execution failed or breached hard latency constraint
            current_model.total_failures += 1

            if latency_breach:
                reason = FailureReason.LATENCY_BREACH
                err_msg = f"Response took {result['latency_ms']}ms, breaching hard budget of {req.max_latency_ms}ms"
            elif "timeout" in (result["error"] or "").lower():
                reason = FailureReason.TIMEOUT
                err_msg = result["error"]
            elif "unavailable" in (result["error"] or "").lower() or not current_model.available:
                reason = FailureReason.UNAVAILABLE
                err_msg = result["error"]
            else:
                reason = FailureReason.MODEL_ERROR
                err_msg = result["error"]

            fallback_attempts.append(
                FallbackAttempt(
                    model_id=current_model.id,
                    model_name=current_model.name,
                    reason=reason,
                    latency_ms=result["latency_ms"],
                    error_message=err_msg,
                )
            )

            # Step 4: Fallover to next model in pre-computed valid chain
            # (get_fallback_decision enforces verify_model_meets_constraints)
            next_model_id = get_fallback_decision(decision, current_model.id, registry, req)
            if next_model_id:
                current_model = registry.get(next_model_id)
                fallback_used = True
                # Timeout for next model adapts to remaining or model's max budget
                effective_timeout_ms = req.max_latency_ms if req.max_latency_ms else (current_model.max_latency_ms if current_model else 30000)
            else:
                current_model = None

    # Step 5: If all valid models failed, abort cleanly without relaxing constraints
    elapsed = int((time.time() - start_time) * 1000)
    failover_summary = "; ".join(f"{fa.model_name} ({fa.reason.value}: {fa.error_message})" for fa in fallback_attempts)
    failure_err = f"All eligible models failed or exceeded latency budget without relaxing constraints. Attempts: {failover_summary}"

    audit_logger.log(
        request_id=decision.request_id,
        prompt=req.prompt,
        constraints=_extract_constraints(req),
        routing_decision=decision,
        latency_ms=elapsed,
        success=False,
        fallback_used=fallback_used,
        fallback_attempts=len(fallback_attempts),
        error=failure_err,
    )

    return InferenceResponse(
        request_id=decision.request_id,
        response_text=None,
        model_used=None,
        model_name=None,
        routing_decision=decision,
        latency_ms=elapsed,
        fallback_used=fallback_used,
        fallback_attempts=fallback_attempts,
        success=False,
        error=failure_err,
        execution_type="failover_exhausted",
    )


# ─── Route-Only Endpoint ──────────────────────────────────────────────────────

@router.post("/route", response_model=dict)
async def route_only(req: InferenceRequest, request: Request):
    """
    Route a request without running model execution.
    Useful for testing routing decisions, constraint filtering, and explainability.
    """
    registry = _get_registry(request)
    decision = route_request(req, registry)
    return {
        "routing_decision": decision.model_dump(),
    }


# ─── Audit Logs & Stats ───────────────────────────────────────────────────────

@router.get("/logs", response_model=list[AuditLogEntry])
async def get_logs(limit: int = 100):
    """Get recent audit log entries."""
    return audit_logger.get_recent(limit)


@router.get("/logs/{request_id}", response_model=AuditLogEntry)
async def get_log_entry(request_id: str):
    """Get a specific audit log entry by request ID."""
    entry = audit_logger.get_by_request_id(request_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Log entry '{request_id}' not found")
    return entry


@router.delete("/logs")
async def clear_logs():
    """Clear memory audit logs for fresh test runs."""
    audit_logger._entries.clear()
    return {"status": "cleared"}


@router.get("/stats")
async def get_stats():
    """Get aggregate statistics for the dashboard."""
    return audit_logger.get_stats()


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _extract_constraints(req: InferenceRequest) -> dict:
    """Extract constraint parameters from request for audit tracking."""
    return {
        "max_latency_ms": req.max_latency_ms,
        "max_cost_per_1k_tokens": req.max_cost_per_1k_tokens,
        "min_capability_score": req.min_capability_score,
        "required_context_length": req.required_context_length,
        "min_output_tokens": req.min_output_tokens,
        "optimization": req.optimization.value,
    }
