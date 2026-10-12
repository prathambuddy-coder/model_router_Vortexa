"""
logger.py - Structured In-Memory Routing Logger for A-01 ModelRouter
---------------------------------------------------------------------
Keeps a rolling log of routing decisions and aggregates stats.
No database or file I/O required — all state lives in Python memory.
"""

import time
import uuid
from collections import defaultdict
from typing import List, Optional, Dict
from threading import Lock


class RoutingLogger:
    """
    Thread-safe, in-memory store for routing log entries.

    Log entry schema:
    {
        log_id          : str   — unique ID for this log entry
        request_id      : str   — ID propagated from the routing decision
        timestamp       : float — Unix epoch at time of logging
        timestamp_iso   : str   — ISO-8601 formatted timestamp
        prompt_preview  : str   — first 120 chars of the prompt (privacy-safe)
        prompt_length   : int   — full prompt character count
        constraints     : dict  — the constraint object used for routing
        decision        : dict  — full routing decision from ModelRouter.route()
        model_used      : str|None — model_key of the model that responded
        response_time_ms: int   — total wall-clock time including inference
        success         : bool  — True if a response was delivered
        error           : str|None — error message if failed
        simulated       : bool  — True if inference was simulated
        failover_count  : int   — number of failover attempts made
    }
    """

    MAX_ENTRIES = 200  # rolling window cap

    def __init__(self):
        self._logs: List[dict] = []
        self._lock = Lock()

        # Cumulative counters for fast stats (avoid re-scanning full log)
        self._total_requests   = 0
        self._total_success    = 0
        self._total_latency_ms = 0
        self._model_usage: Dict[str, int] = defaultdict(int)
        self._failover_total   = 0

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def log_request(
        self,
        request_id: str,
        prompt: str,
        constraints: dict,
        decision: dict,
        response_time_ms: int,
        success: bool,
        error: Optional[str] = None,
        model_used: Optional[str] = None,
        simulated: bool = False,
        failover_count: int = 0,
    ) -> str:
        """
        Append a routing event to the log.

        Args:
            request_id       : Trace ID from the routing decision.
            prompt           : Full user prompt (only a preview is stored).
            constraints      : Constraint dict that was applied.
            decision         : Full routing decision object.
            response_time_ms : Total end-to-end time including inference.
            success          : Whether inference succeeded.
            error            : Error message if failed.
            model_used       : The model_key that actually responded.
            simulated        : Whether inference was simulated.
            failover_count   : Number of failover hops taken.

        Returns:
            log_id : The unique ID assigned to this entry.
        """
        now    = time.time()
        log_id = str(uuid.uuid4())[:12]

        entry = {
            "log_id":           log_id,
            "request_id":       request_id,
            "timestamp":        now,
            "timestamp_iso":    _iso(now),
            "prompt_preview":   prompt[:120].replace("\n", " "),
            "prompt_length":    len(prompt),
            "constraints":      constraints,
            "decision":         decision,
            "model_used":       model_used,
            "response_time_ms": response_time_ms,
            "success":          success,
            "error":            error,
            "simulated":        simulated,
            "failover_count":   failover_count,
        }

        with self._lock:
            # Rolling window: drop oldest if over cap
            if len(self._logs) >= self.MAX_ENTRIES:
                self._logs.pop(0)
            self._logs.append(entry)

            # Config edits are audit-only; they are not inferences and must not skew stats
            if (decision or {}).get("type") == "CONFIG_UPDATE":
                return log_id

            # Update fast counters
            self._total_requests   += 1
            self._total_latency_ms += response_time_ms
            if success:
                self._total_success += 1
            if model_used:
                self._model_usage[model_used] += 1
            self._failover_total += failover_count

        return log_id

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_logs(self, limit: int = 100) -> List[dict]:
        """
        Return recent log entries, newest first.

        Args:
            limit : Maximum number of entries to return (capped at MAX_ENTRIES).
        """
        limit = min(limit, self.MAX_ENTRIES)
        with self._lock:
            return list(reversed(self._logs[-limit:]))

    def get_stats(self) -> dict:
        """
        Return aggregated statistics across all logged requests.

        Returns:
        {
            total_requests : int
            success_rate   : float  (0.0 - 1.0)
            avg_latency_ms : float
            model_usage    : {model_key: count}
            failover_count : int   — total failover hops across all requests
            simulated_count: int   — how many requests used simulation
        }
        """
        with self._lock:
            total      = self._total_requests
            successes  = self._total_success
            total_lat  = self._total_latency_ms
            usage_snap = dict(self._model_usage)
            failovers  = self._failover_total
            sim_count  = sum(1 for e in self._logs if e.get("simulated"))

        success_rate = round(successes / total, 4) if total > 0 else 0.0
        avg_latency  = round(total_lat / total, 1) if total > 0 else 0.0

        return {
            "total_requests":  total,
            "success_rate":    success_rate,
            "avg_latency_ms":  avg_latency,
            "model_usage":     usage_snap,
            "failover_count":  failovers,
            "simulated_count": sim_count,
        }

    def clear(self):
        """Wipe all logs (useful in tests or on reset)."""
        with self._lock:
            self._logs.clear()
            self._total_requests   = 0
            self._total_success    = 0
            self._total_latency_ms = 0
            self._model_usage.clear()
            self._failover_total   = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _iso(epoch: float) -> str:
    """Convert Unix epoch to a simple ISO-8601 UTC string."""
    import datetime
    dt = datetime.datetime.utcfromtimestamp(epoch)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
routing_logger = RoutingLogger()
