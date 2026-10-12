"""
gateway.py - Flask API Gateway for A-01 ModelRouter
----------------------------------------------------
Coordinates:
- Pipeline A: Model Configuration (PATCH /api/models/{model_id}, Reset, Get)
- Pipeline B: Runtime Model Routing (POST /api/infer, POST /api/route)
- Observability: GET /api/logs, GET /api/stats, GET /api/health
"""

import os
import concurrent.futures
import threading
import time
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from models import registry
from router import ModelRouter
from model_adapter import ModelAdapter, transcribe_images
from logger import routing_logger
from constraint_engine import ConstraintEngine, is_vision_capable

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

_router = ModelRouter()
_adapter = ModelAdapter()
_hedge_pool = concurrent.futures.ThreadPoolExecutor(max_workers=16, thread_name_prefix="hedge")


# Circuit breaker: models that just rate-limited, stalled or returned nothing are skipped for a
# while so the next request races healthy models immediately instead of re-learning the failure.
FAILURE_COOLDOWN_S = 180
_cooldown_until: dict = {}
_cooldown_lock = threading.Lock()


def _start_cooldown(model_key: str) -> None:
    with _cooldown_lock:
        _cooldown_until[model_key] = time.time() + FAILURE_COOLDOWN_S


def _cooling_down() -> dict:
    now = time.time()
    with _cooldown_lock:
        return {k: int(t - now) for k, t in _cooldown_until.items() if t > now}


def _attempt_record(attempt: int, key: str, profile, result: dict) -> dict:
    return {
        "attempt": attempt,
        "model_key": key,
        "model_name": profile.name,
        "success": result["success"],
        "latency_ms": result["latency_ms"],
        "tokens_used": result.get("tokens_used", 0),
        "simulated": result.get("simulated", False),
        "execution_mode": result.get("execution_mode", "SIMULATED"),
        "error": result.get("error"),
    }
_engine = ConstraintEngine()

MAX_FAILOVER = 2                 # at most 3 attempts in total
PRIMARY_TIMEOUT_MS = 70000       # first-choice model gets 70s (free models need ~45-60s for long answers)
VISION_TRANSCRIBE_TIMEOUT_MS = 40000  # stage 1: reading the image(s)
TOTAL_BUDGET_MS = 150000         # hard ceiling for the whole /api/infer request
MAX_IMAGES = 4
MAX_IMAGE_CHARS = 8_000_000      # ~6MB decoded per image
HEDGE_WIDTH = int(os.environ.get("HEDGE_WIDTH", 2))  # models raced per round; 1 = sequential (saves quota)
MIN_ATTEMPT_MS = 8000            # adapter's minimum per-call deadline


def _error(message: str, status: int = 400, extra: dict = None) -> tuple:
    payload = {"success": False, "error": message}
    if extra:
        payload.update(extra)
    return jsonify(payload), status


def _ok(data: dict, status: int = 200) -> tuple:
    return jsonify({"success": True, **data}), status


# ===========================================================================
# Pipeline A: Model Configuration API
# ===========================================================================

def _parse_images(body: dict) -> tuple:
    """Validates optional image attachments (data URLs). Returns (images, error)."""
    images = body.get("images") or []
    if not isinstance(images, list) or len(images) > MAX_IMAGES:
        return [], f"'images' must be a list of at most {MAX_IMAGES} data URLs."
    for img in images:
        if not isinstance(img, str) or not img.startswith("data:image/"):
            return [], "Each image must be a 'data:image/...;base64,' URL."
        if len(img) > MAX_IMAGE_CHARS:
            return [], f"Image too large (max ~{MAX_IMAGE_CHARS * 3 // 4 // 1_000_000}MB each)."
    return images, None


def _apply_image_constraints(constraints: dict, images: list) -> dict:
    """Attached images make vision a hard requirement and default the preference to multimodal."""
    if not images:
        return constraints
    constraints = {**constraints, "requires_vision": True}
    constraints.setdefault("preference", "multimodal_specialist")
    return constraints


@app.route("/api/health", methods=["GET"])
def health():
    all_models = registry.get_all()
    available = sum(1 for m in all_models.values() if m.available)
    return _ok({
        "status": "ok",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_count": len(all_models),
        "available_models": available,
        "version": "2.0.0",
    })


@app.route("/api/models", methods=["GET"])
def get_models():
    models = registry.to_list()
    return _ok({"models": models, "count": len(models)})


@app.route("/api/models/<model_id>", methods=["PATCH"])
def update_model(model_id: str):
    """
    Judge edits model parameters:
      - avg_latency_ms
      - max_latency_ms
      - capability_score
      - context_length
      - reliability
      - availability
      - enabled
      - cost_per_1k_tokens
    """
    if not registry.exists(model_id):
        return _error(f"Model '{model_id}' not found.", 404)

    body = request.get_json(silent=True) or {}
    if not body:
        return _error("Request body must be a non-empty JSON object.")

    updated_profile, err = registry.update(model_id, body)
    if err:
        return _error(err, 400)

    # Log configuration update in audit logs
    routing_logger.log_request(
        request_id=f"cfg-{str(uuid.uuid4())[:6]}",
        prompt=f"[CONFIG_UPDATE] Model '{model_id}' updated",
        constraints=body,
        decision={"type": "CONFIG_UPDATE", "model_id": model_id, "changes": body},
        response_time_ms=0,
        success=True,
        model_used=model_id,
        simulated=False,
    )

    return _ok({
        "message": f"Configuration for model '{model_id}' updated and persisted.",
        "model": updated_profile.to_dict(),
    })


@app.route("/api/models/reset", methods=["POST"])
def reset_models():
    """Reset all models to defaults."""
    restored = registry.reset()
    return _ok({
        "message": "All models restored to factory defaults.",
        "models": restored,
    })


# ===========================================================================
# Pipeline B: Runtime Inference & Routing API
# ===========================================================================

@app.route("/api/route", methods=["POST"])
def dry_run_route():
    body = request.get_json(silent=True) or {}
    prompt = body.get("prompt", "").strip()
    constraints = body.get("constraints", {})

    if not prompt:
        return _error("'prompt' is required and must not be empty.")

    images, img_err = _parse_images(body)
    if img_err:
        return _error(img_err)
    constraints = _apply_image_constraints(constraints, images)

    valid, errs = _engine.validate_constraints(constraints)
    if not valid:
        return _error(f"Invalid constraints: {'; '.join(errs)}")

    request_id = str(uuid.uuid4())[:8]
    all_models = registry.get_all()
    decision = _router.route(prompt, constraints, all_models, request_id)

    return _ok({"decision": decision})


@app.route("/api/infer", methods=["POST"])
def infer():
    wall_start = time.time()
    body = request.get_json(silent=True) or {}

    prompt = body.get("prompt", "").strip()
    constraints = body.get("constraints", {})

    if not prompt:
        return _error("'prompt' is required and must not be empty.")

    images, img_err = _parse_images(body)
    if img_err:
        return _error(img_err)
    # Two-stage image handling: a vision model reads the image(s), then the extracted text is
    # routed like any other prompt so the best text model (not just the vision model) answers.
    vision_stage = None
    if images:
        vision_ids = [m.model_id for m in registry.get_all().values()
                      if is_vision_capable(m) and m.enabled and m.availability and m.model_id]
        vision_stage = transcribe_images(images, vision_ids, VISION_TRANSCRIBE_TIMEOUT_MS / 1000)
        if not vision_stage["success"]:
            routing_logger.log_request(
                request_id=str(uuid.uuid4())[:8],
                prompt=prompt,
                constraints=constraints,
                decision={"type": "VISION_STAGE_FAILED"},
                response_time_ms=vision_stage["latency_ms"],
                success=False,
                error=vision_stage["error"],
                model_used=None,
                simulated=False,
            )
            return jsonify({
                "success": False,
                "status": "QUOTA_EXHAUSTED" if vision_stage.get("quota_exhausted") else "ALL_MODELS_FAILED",
                "message": vision_stage["error"],
                "error": vision_stage["error"],
                "decision": None,
                "audit_trail": [],
                "latency_ms": vision_stage["latency_ms"],
            }), 200
        prompt = (
            f"{prompt}\n\n[Content of the attached image(s), transcribed]\n"
            f"{vision_stage['text']}"
        )
        images = []

    valid, errs = _engine.validate_constraints(constraints)
    if not valid:
        return _error(f"Invalid constraints: {'; '.join(errs)}")

    request_id = str(uuid.uuid4())[:8]
    all_models = registry.get_all()
    audit_trail = []
    vision_record = None
    if vision_stage:
        vision_record = ({
            "attempt": 0,
            "model_key": "vision-transcribe",
            "model_name": f"Image reader ({vision_stage['served_by'] or 'vision model'})",
            "success": True,
            "latency_ms": vision_stage["latency_ms"],
            "tokens_used": 0,
            "simulated": False,
            "execution_mode": "VISION_TRANSCRIBE",
            "error": None,
        })
    vision_prefix = [vision_record] if vision_record else []
    cooling = _cooling_down()
    excluded_keys = set(cooling)
    if not _router.route(prompt, constraints,
                         {k: v for k, v in all_models.items() if k not in excluded_keys},
                         request_id).get("selected"):
        excluded_keys = set()  # every eligible model is cooling down: try them anyway
        cooling = {}
    failover_count = 0
    quota_exhausted = False
    final_decision = None
    final_response = None
    final_model = None
    final_result = {}
    last_error = None
    exec_mode = "SIMULATED"

    # Routing + hedged failover (respects non-negotiable constraints). Free-tier models can stall
    # for a minute or return nothing, so each round races the top choice against the next-best
    # eligible model and keeps the first non-empty answer instead of trying them one at a time.
    for attempt in range(1, MAX_FAILOVER + 2):
        candidate_models = {
            k: v for k, v in all_models.items() if k not in excluded_keys
        }

        remaining_ms = TOTAL_BUDGET_MS - int((time.time() - wall_start) * 1000)
        if attempt > 1 and remaining_ms < MIN_ATTEMPT_MS:
            last_error = f"Request budget of {TOTAL_BUDGET_MS // 1000}s exhausted during failover."
            break

        if not candidate_models:
            last_error = "All eligible models exhausted during failover."
            break

        decision = _router.route(prompt, constraints, candidate_models, request_id)
        selected = decision.get("selected")

        if not selected:
            # NO_VALID_MODEL. After runtime failures, keep the last real routing decision so
            # the failed model stays visible instead of vanishing from the candidate list.
            if final_decision is None:
                final_decision = decision
            # Keep the runtime failure from an earlier attempt; it explains more than "no model left".
            if not audit_trail:
                last_error = decision.get("message", "No available model satisfies all hard constraints.")
            break

        if attempt > 1:
            failover_count += 1
            decision["failover_chain"].append(selected)

        # A preferred (manually chosen) model runs alone; otherwise add the best-scoring backup.
        racers = [selected]
        if HEDGE_WIDTH > 1 and not constraints.get("preferred_model"):
            backups = sorted(
                (c for c in decision.get("candidates", [])
                 if c.get("status") == "passed" and c.get("model_key") != selected),
                key=lambda c: c.get("score") or 0,
                reverse=True,
            )
            racers += [c["model_key"] for c in backups[: HEDGE_WIDTH - 1]]

        # profile.max_latency_ms is a routing estimate, not a generation deadline; only an
        # explicit user latency constraint should tighten the per-attempt timeout.
        timeout_ms = constraints.get("max_latency_ms") or PRIMARY_TIMEOUT_MS
        timeout_ms = int(min(int(timeout_ms), PRIMARY_TIMEOUT_MS, max(remaining_ms, MIN_ATTEMPT_MS)))

        futures = {
            _hedge_pool.submit(_adapter.call_model, all_models[k], prompt, timeout_ms, images=images): k
            for k in racers
        }
        final_decision = decision
        winner = None
        pending = set(futures)
        try:
            for fut in concurrent.futures.as_completed(futures, timeout=timeout_ms / 1000 + 5):
                pending.discard(fut)
                key = futures[fut]
                result = fut.result()
                audit_trail.append(_attempt_record(attempt, key, all_models[key], result))
                exec_mode = result.get("execution_mode", "SIMULATED")
                if result["success"]:
                    winner = (key, result)
                    break
                if result.get("execution_mode") == "QUOTA_EXHAUSTED":
                    quota_exhausted = True
                    last_error = result["error"]
                    break
                excluded_keys.add(key)
                _start_cooldown(key)
                last_error = result.get("error", "Execution failure")
        except concurrent.futures.TimeoutError:
            pass

        # Racers still running lost the race (or overran); record them without counting a failure.
        for fut in pending:
            key = futures[fut]
            if winner is None and not quota_exhausted:
                excluded_keys.add(key)
                _start_cooldown(key)
            audit_trail.append({
                "attempt": attempt, "model_key": key, "model_name": all_models[key].name,
                "success": False, "latency_ms": int((time.time() - wall_start) * 1000),
                "tokens_used": 0, "simulated": False,
                "execution_mode": "SUPERSEDED" if winner else "TIMEOUT_FAILOVER",
                "error": None if winner else f"'{all_models[key].name}' did not finish in time.",
            })

        if quota_exhausted:
            break  # every free model shares the daily quota; further attempts only fail

        if winner:
            final_model, final_result = winner
            final_response = final_result["text"]
            exec_mode = final_result.get("execution_mode", exec_mode)
            if final_model != selected:
                decision["selected"] = final_model
                decision["selected_name"] = all_models[final_model].name
                decision["explanation"] = (
                    f"{all_models[final_model].name} answered first in a parallel race against "
                    f"{all_models[selected].name} (the top-ranked pick). " + (decision.get("explanation") or "")
                )
            break

    total_ms = int((time.time() - wall_start) * 1000)
    last_sim = audit_trail[-1].get("simulated", False) if audit_trail else False

    # Models that passed routing but failed at runtime are excluded from later routing
    # passes; mark them in the final decision so the UI shows why they were skipped.
    if final_decision:
        cands = final_decision.setdefault("candidates", [])
        for rec in audit_trail:
            if rec["success"] or rec.get("execution_mode") == "SUPERSEDED":
                continue
            reason = f"Runtime failure: {rec.get('error') or 'execution error'}"
            match = next((c for c in cands if c.get("model_key") == rec["model_key"]), None)
            if match is None:
                cands.append({"model_key": rec["model_key"], "name": rec["model_name"],
                              "status": "rejected", "rejection_reason": reason})
            else:
                match["status"] = "rejected"
                match["rejection_reason"] = reason
        for key, secs in cooling.items():
            if not any(c.get("model_key") == key for c in cands) and key in all_models:
                cands.append({"model_key": key, "name": all_models[key].name, "status": "rejected",
                              "rejection_reason": f"Runtime failure: cooling down after a recent failure ({secs}s left)"})
        if final_model is None:
            final_decision["selected"] = None

    # Attach live response parameters to final_decision for frontend Inspector
    if final_decision:
        final_decision["tokens_used"] = final_result.get("tokens_used", 0)
        final_decision["prompt_tokens"] = final_result.get("prompt_tokens", 0)
        final_decision["completion_tokens"] = final_result.get("completion_tokens", 0)
        final_decision["usage"] = final_result.get("usage", {})
        final_decision["measured_latency_ms"] = final_result.get("latency_ms", total_ms)
        final_decision["execution_mode"] = exec_mode

    if final_model:
        used_tokens = final_result.get("tokens_used", 0)
        if used_tokens == 0 and final_response:
            used_tokens = max(1, (len(prompt) + len(final_response)) // 4)
        measured_lat = final_result.get("latency_ms", total_ms)
        registry.record_token_usage(final_model, used_tokens, measured_lat)

    # Log request audit
    routing_logger.log_request(
        request_id=request_id,
        prompt=prompt,
        constraints=constraints,
        decision=final_decision or {},
        response_time_ms=total_ms,
        success=final_model is not None,
        error=last_error if final_model is None else None,
        model_used=final_model,
        simulated=last_sim,
        failover_count=failover_count,
    )

    if final_model is not None:
        model_obj = registry.get(final_model) or all_models.get(final_model)
        return _ok({
            "response": final_response,
            "model_used": final_model,
            "model_name": model_obj.name if model_obj else final_model,
            "decision": final_decision,
            "audit_trail": vision_prefix + audit_trail,
            "latency_ms": total_ms,
            "failover_count": failover_count,
            "simulated": last_sim,
            "execution_mode": exec_mode,
            "tokens_used": final_result.get("tokens_used", 0),
            "prompt_tokens": final_result.get("prompt_tokens", 0),
            "completion_tokens": final_result.get("completion_tokens", 0),
            "usage": final_result.get("usage", {}),
            "served_by": final_result.get("served_by"),
            "image_read_by": vision_stage["served_by"] if vision_stage else None,
        })
    else:
        # Explicit NO_VALID_MODEL contract
        return jsonify({
            "success": False,
            "status": "QUOTA_EXHAUSTED" if quota_exhausted else ("ALL_MODELS_FAILED" if audit_trail else "NO_VALID_MODEL"),
            "message": last_error if quota_exhausted else (
                f"All {len({r['model_key'] for r in audit_trail})} eligible model(s) failed. Last error: {last_error}"
                if audit_trail else (last_error or "No available model satisfies all hard constraints.")
            ),
            "error": last_error or "No available model satisfies all hard constraints.",
            "decision": final_decision,
            "audit_trail": vision_prefix + audit_trail,
            "latency_ms": total_ms,
        }), 200  # Return 200 with NO_VALID_MODEL so frontend parses clean decision explanation


@app.route("/api/logs", methods=["GET"])
def get_logs():
    try:
        limit = int(request.args.get("limit", 100))
    except Exception:
        limit = 100
    logs = routing_logger.get_logs(limit=limit)
    return _ok({"logs": logs, "count": len(logs)})


@app.route("/api/stats", methods=["GET"])
def get_stats():
    return _ok({"stats": routing_logger.get_stats()})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[ModelRouter] Gateway running on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
