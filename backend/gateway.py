"""
gateway.py - Flask API Gateway for A-01 ModelRouter
----------------------------------------------------
Coordinates:
- Pipeline A: Model Configuration (PATCH /api/models/{model_id}, Reset, Get)
- Pipeline B: Runtime Model Routing (POST /api/infer, POST /api/route)
- Observability: GET /api/logs, GET /api/stats, GET /api/health
"""

import os
import time
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from models import registry
from router import ModelRouter
from model_adapter import ModelAdapter
from logger import routing_logger
from constraint_engine import ConstraintEngine

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

_router = ModelRouter()
_adapter = ModelAdapter()
_engine = ConstraintEngine()

MAX_FAILOVER = 3


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

    valid, errs = _engine.validate_constraints(constraints)
    if not valid:
        return _error(f"Invalid constraints: {'; '.join(errs)}")

    request_id = str(uuid.uuid4())[:8]
    all_models = registry.get_all()
    audit_trail = []
    excluded_keys = set()
    failover_count = 0
    final_decision = None
    final_response = None
    final_model = None
    last_error = None
    exec_mode = "SIMULATED"

    # Routing + Failover Loop (respects non-negotiable constraints)
    for attempt in range(1, MAX_FAILOVER + 2):
        candidate_models = {
            k: v for k, v in all_models.items() if k not in excluded_keys
        }

        if not candidate_models:
            last_error = "All eligible models exhausted during failover."
            break

        decision = _router.route(prompt, constraints, candidate_models, request_id)
        selected = decision.get("selected")

        if not selected:
            # NO_VALID_MODEL
            final_decision = decision
            last_error = decision.get("message", "No available model satisfies all hard constraints.")
            break

        if attempt > 1:
            failover_count += 1
            decision["failover_chain"].append(selected)

        profile = all_models[selected]
        timeout_ms = constraints.get("max_latency_ms", profile.max_latency_ms) or profile.max_latency_ms

        result = _adapter.call_model(profile, prompt, int(timeout_ms))

        attempt_record = {
            "attempt": attempt,
            "model_key": selected,
            "model_name": profile.name,
            "success": result["success"],
            "latency_ms": result["latency_ms"],
            "simulated": result.get("simulated", False),
            "execution_mode": result.get("execution_mode", "SIMULATED"),
            "error": result.get("error"),
        }
        audit_trail.append(attempt_record)
        final_decision = decision
        exec_mode = result.get("execution_mode", "SIMULATED")

        if result["success"]:
            final_response = result["text"]
            final_model = selected
            break
        else:
            # Failover: exclude failed candidate and re-run without relaxing constraints
            excluded_keys.add(selected)
            last_error = result.get("error", "Execution failure")

    total_ms = int((time.time() - wall_start) * 1000)
    last_sim = audit_trail[-1].get("simulated", False) if audit_trail else False

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
        model_obj = all_models.get(final_model)
        return _ok({
            "response": final_response,
            "model_used": final_model,
            "model_name": model_obj.name if model_obj else final_model,
            "decision": final_decision,
            "audit_trail": audit_trail,
            "latency_ms": total_ms,
            "failover_count": failover_count,
            "simulated": last_sim,
            "execution_mode": exec_mode,
        })
    else:
        # Explicit NO_VALID_MODEL contract
        return jsonify({
            "success": False,
            "status": "NO_VALID_MODEL",
            "message": "No available model satisfies all hard constraints.",
            "error": last_error or "No available model satisfies all hard constraints.",
            "decision": final_decision,
            "audit_trail": audit_trail,
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
