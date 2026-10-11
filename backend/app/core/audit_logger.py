"""
Audit Logger - Tracks cost, latency, failures, and routing decisions
so that behaviour can be reviewed by judges.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.schemas import (
    AuditLogEntry,
    RoutingDecision,
    RequestComplexity,
)


class AuditLogger:
    """
    In-memory + file-based audit logger.
    Stores all routing decisions for review.
    """

    def __init__(self, max_memory_entries: int = 1000):
        self._entries: list[AuditLogEntry] = []
        self._max_entries = max_memory_entries
        self._log_dir = Path(__file__).parent.parent.parent / "logs"
        self._log_dir.mkdir(exist_ok=True)

    def log(
        self,
        request_id: str,
        prompt: str,
        constraints: dict,
        routing_decision: RoutingDecision,
        latency_ms: int,
        success: bool,
        fallback_used: bool = False,
        fallback_attempts: int = 0,
        error: Optional[str] = None,
    ):
        """Log a routing decision for audit purposes."""
        entry = AuditLogEntry(
            request_id=request_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            prompt_preview=prompt[:100] + ("..." if len(prompt) > 100 else ""),
            estimated_complexity=routing_decision.estimated_complexity,
            constraints=constraints,
            selected_model=routing_decision.selected_model_id,
            fallback_used=fallback_used,
            fallback_attempts=fallback_attempts,
            latency_ms=latency_ms,
            success=success,
            error=error,
            routing_decision=routing_decision,
        )

        # In-memory (ring buffer)
        if len(self._entries) >= self._max_entries:
            self._entries.pop(0)
        self._entries.append(entry)

        # File-based (append to daily log)
        self._write_to_file(entry)

    def _write_to_file(self, entry: AuditLogEntry):
        """Append entry to a daily log file."""
        date_str = datetime.now().strftime("%Y-%m-%d")
        log_file = self._log_dir / f"audit_{date_str}.jsonl"
        try:
            with open(log_file, "a") as f:
                f.write(entry.model_dump_json() + "\n")
        except Exception as e:
            print(f"[AuditLogger] Failed to write log: {e}")

    def get_recent(self, limit: int = 50) -> list[AuditLogEntry]:
        """Get the most recent audit entries."""
        return list(reversed(self._entries[-limit:]))

    def get_by_request_id(self, request_id: str) -> Optional[AuditLogEntry]:
        """Find a specific audit entry by request ID."""
        for entry in reversed(self._entries):
            if entry.request_id == request_id:
                return entry
        return None

    def get_stats(self) -> dict:
        """Get aggregate statistics and time-series telemetry for dashboard graphs."""
        if not self._entries:
            return {
                "total_requests": 0,
                "success_rate": 0.0,
                "avg_latency_ms": 0,
                "fallback_rate": 0.0,
                "model_usage": {},
                "complexity_distribution": {},
                "recent_timeline": [],
                "latency_saved_ms": 0,
                "latest_entry": None,
            }

        total = len(self._entries)
        successes = sum(1 for e in self._entries if e.success)
        fallbacks = sum(1 for e in self._entries if e.fallback_used)
        total_latency = sum(e.latency_ms for e in self._entries)

        # Model usage distribution
        model_usage: dict[str, int] = {}
        for e in self._entries:
            if e.selected_model:
                model_usage[e.selected_model] = model_usage.get(e.selected_model, 0) + 1

        # Complexity distribution
        complexity_dist: dict[str, int] = {}
        for e in self._entries:
            key = e.estimated_complexity.value
            complexity_dist[key] = complexity_dist.get(key, 0) + 1

        # Latency savings compared to default static routing to largest model (4600ms baseline)
        baseline_latency = 4600
        latency_saved = sum(max(0, baseline_latency - e.latency_ms) for e in self._entries if e.success)

        # Dynamic query timeline points (last 15 requests)
        timeline = []
        for e in self._entries[-15:]:
            timeline.append({
                "request_id": e.request_id,
                "timestamp": e.timestamp,
                "prompt": e.prompt_preview,
                "latency_ms": e.latency_ms,
                "model": e.selected_model or "Rejected",
                "complexity": e.estimated_complexity.value,
                "success": e.success,
                "fallback_used": e.fallback_used,
                "max_latency_constraint": e.constraints.get("max_latency_ms"),
                "min_capability_constraint": e.constraints.get("min_capability_score"),
            })

        latest_entry = self._entries[-1].model_dump() if self._entries else None

        return {
            "total_requests": total,
            "success_rate": round(successes / total * 100, 1),
            "avg_latency_ms": round(total_latency / total),
            "fallback_rate": round(fallbacks / total * 100, 1),
            "model_usage": model_usage,
            "complexity_distribution": complexity_dist,
            "recent_timeline": timeline,
            "latency_saved_ms": latency_saved,
            "latest_entry": latest_entry,
        }


# Global singleton
audit_logger = AuditLogger()
