"""
models.py - Model Registry for A-01 ModelRouter
------------------------------------------------
Manages the shared model registry for both:
  Pipeline A: Model Configuration (Judge parameters, SLA, latency bounds)
  Pipeline B: Runtime Model Routing (Used by router to filter and score candidates)

Features:
- Thread-safe updates
- JSON persistence (atomic write to models_config.json)
- Full parameter validation
- Factory default reset
"""

import os
import json
import tempfile
import copy
from dataclasses import dataclass, asdict
from typing import Optional, Dict, List, Any
from threading import Lock

CONFIG_FILE_PATH = os.path.join(os.path.dirname(__file__), "models_config.json")


@dataclass
class ModelProfile:
    """
    Represents a single registered model and its configuration.

    Parameters:
        model_key           : Unique identifier (e.g. 'liquid-lfm-2.6b')
        name                : Display name (e.g. 'Liquid LFM2.5 2.6B')
        role                : Functional role description
        avg_latency_ms      : Configured estimate of average response latency (used for ranking)
        max_latency_ms      : Configured upper-bound latency estimate (hard deadline constraint)
        measured_latency_ms : Actual latency recorded from the most recent real execution
        capability_score    : Model capability rating (1.0 to 10.0)
        context_length      : Maximum context capacity in tokens
        reliability         : Reliability score (0.0 to 1.0)
        availability        : Whether model is online/offline
        enabled             : Enabled status for routing
        cost_per_1k_tokens  : Cost in USD per 1K tokens (0.0 for free OpenRouter tier)
        provider            : 'openrouter' | 'ollama' | 'gemini' | 'groq'
        model_id            : Provider-specific model tag (e.g. 'liquid/lfm-2.5-2.6b:free')
        description         : Detailed description
    """
    model_key: str
    name: str
    role: str
    avg_latency_ms: int
    max_latency_ms: int
    measured_latency_ms: int
    capability_score: float
    context_length: int
    reliability: float
    availability: bool
    enabled: bool
    cost_per_1k_tokens: float
    provider: str
    model_id: str
    description: str
    tokens_used: int = 0

    # Legacy/compatibility aliases
    @property
    def capability(self) -> float:
        return self.capability_score

    @property
    def latency_ms(self) -> int:
        return self.avg_latency_ms

    @property
    def cost_per_token(self) -> float:
        return self.cost_per_1k_tokens / 1000.0

    @property
    def available(self) -> bool:
        return self.availability and self.enabled

    @property
    def tokens_remaining(self) -> int:
        return max(0, self.context_length - getattr(self, "tokens_used", 0))

    def to_dict(self) -> dict:
        d = asdict(self)
        d["capability"] = self.capability_score
        d["latency_ms"] = self.avg_latency_ms
        d["cost_per_token"] = self.cost_per_token
        d["available"] = self.available
        d["tokens_used"] = getattr(self, "tokens_used", 0)
        d["tokens_remaining"] = self.tokens_remaining
        return d


# ---------------------------------------------------------------------------
# Default 5 OpenRouter Model Profiles
# ---------------------------------------------------------------------------
_DEFAULT_PROFILES: List[dict] = [
    {
        "model_key": "liquid-lfm-2.6b",
        "name": "Liquid LFM2.5 2.6B",
        "role": "Fast: Simple questions, extraction, basic RAG",
        "avg_latency_ms": 550,
        "max_latency_ms": 1600,
        "measured_latency_ms": 510,
        "capability_score": 4.2,
        "context_length": 32768,
        "reliability": 0.98,
        "availability": True,
        "enabled": True,
        "cost_per_1k_tokens": 0.0,
        "provider": "openrouter",
        "model_id": "liquid/lfm-2.5-2.6b:free",
        "description": "Lightweight edge model delivering ultra-fast responses for simple queries, text extraction, and basic RAG.",
    },
    {
        "model_key": "nemotron-3.5-lightning",
        "name": "NVIDIA Nemotron 3.5 Lightning",
        "role": "Balanced: General tasks and agentic workflows",
        "avg_latency_ms": 1150,
        "max_latency_ms": 2900,
        "measured_latency_ms": 1080,
        "capability_score": 7.0,
        "context_length": 65536,
        "reliability": 0.96,
        "availability": True,
        "enabled": True,
        "cost_per_1k_tokens": 0.0,
        "provider": "openrouter",
        "model_id": "nvidia/nemotron-3.5-lightning:free",
        "description": "High-throughput balanced model optimized for daily requests, agentic execution, and versatile general tasks.",
    },
    {
        "model_key": "nemotron-3-super",
        "name": "NVIDIA Nemotron 3 Super",
        "role": "Advanced Reasoning: Complex reasoning and multistep analysis",
        "avg_latency_ms": 2700,
        "max_latency_ms": 7200,
        "measured_latency_ms": 2600,
        "capability_score": 9.5,
        "context_length": 131072,
        "reliability": 0.93,
        "availability": True,
        "enabled": True,
        "cost_per_1k_tokens": 0.0,
        "provider": "openrouter",
        "model_id": "nvidia/nemotron-3-super-120b-a12b:free",
        "description": "Massive 120B parameter MoE reasoning engine for deep chain-of-thought proofs, formal logic, and complex multi-step analysis.",
    },
    {
        "model_key": "north-mini-code",
        "name": "Cohere North Mini Code",
        "role": "Coding Specialist: Coding and software engineering tasks",
        "avg_latency_ms": 1650,
        "max_latency_ms": 4200,
        "measured_latency_ms": 1580,
        "capability_score": 8.7,
        "context_length": 65536,
        "reliability": 0.95,
        "availability": True,
        "enabled": True,
        "cost_per_1k_tokens": 0.0,
        "provider": "openrouter",
        "model_id": "cohere/north-mini-code:free",
        "description": "Specialized coding model optimized for syntax generation, refactoring, algorithms, and software engineering.",
    },
    {
        "model_key": "gemma-4-26b",
        "name": "Google Gemma 4 26B A4B",
        "role": "Multimodal: Images, charts, video and visual-document analysis",
        "avg_latency_ms": 2300,
        "max_latency_ms": 6000,
        "measured_latency_ms": 2220,
        "capability_score": 8.4,
        "context_length": 131072,
        "reliability": 0.94,
        "availability": True,
        "enabled": True,
        "cost_per_1k_tokens": 0.0,
        "provider": "openrouter",
        "model_id": "google/gemma-4-26b-a4b-it:free",
        "description": "Multimodal foundation model excelling at visual document analysis, chart comprehension, OCR, and structured data synthesis.",
    },
]


class ModelRegistry:
    """
    Shared model registry supporting atomic persistence, thread safety,
    and validation for Judge Model Configuration & Routing.
    """

    ALLOWED_UPDATE_FIELDS = {
        "avg_latency_ms": (int, float),
        "max_latency_ms": (int, float),
        "capability_score": (int, float),
        "context_length": (int, float),
        "reliability": (int, float),
        "availability": bool,
        "enabled": bool,
        "cost_per_1k_tokens": (int, float),
        "tokens_used": (int, float),
        "measured_latency_ms": (int, float),
        # Legacy/UI alias support
        "latency_ms": (int, float),
        "capability": (int, float),
        "available": bool,
    }

    def __init__(self, persistence_path: str = CONFIG_FILE_PATH):
        self._persistence_path = persistence_path
        self._lock = Lock()
        self._store: Dict[str, ModelProfile] = {}
        self._init_store()

    def _init_store(self):
        """Load from persistent JSON file if exists and valid, otherwise load defaults."""
        if os.path.exists(self._persistence_path):
            try:
                with open(self._persistence_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    self._store = {}
                    for item in data:
                        # Normalize aliases
                        if "capability_score" not in item and "capability" in item:
                            item["capability_score"] = item["capability"]
                        if "avg_latency_ms" not in item and "latency_ms" in item:
                            item["avg_latency_ms"] = item["latency_ms"]
                        if "max_latency_ms" not in item:
                            item["max_latency_ms"] = item.get("avg_latency_ms", 3000) * 2
                        if "measured_latency_ms" not in item:
                            item["measured_latency_ms"] = item.get("avg_latency_ms", 1000)
                        if "reliability" not in item:
                            item["reliability"] = 0.95
                        if "cost_per_1k_tokens" not in item:
                            item["cost_per_1k_tokens"] = 0.0
                        if "enabled" not in item:
                            item["enabled"] = True
                        if "role" not in item:
                            item["role"] = "General task"
                        if "tokens_used" not in item:
                            item["tokens_used"] = 0

                        # Strip non-dataclass keys if any
                        clean_item = {
                            k: v for k, v in item.items()
                            if k in ModelProfile.__annotations__
                        }
                        self._store[clean_item["model_key"]] = ModelProfile(**clean_item)
                    return
            except Exception as e:
                print(f"[ModelRegistry] Error reading {self._persistence_path}: {e}. Falling back to defaults.")

        self._load_defaults_locked()

    def _load_defaults_locked(self):
        self._store = {}
        for spec in _DEFAULT_PROFILES:
            self._store[spec["model_key"]] = ModelProfile(**spec)
        self._save_to_disk_locked()

    def _save_to_disk_locked(self):
        """Atomically persist configuration to disk."""
        try:
            abs_path = os.path.abspath(self._persistence_path)
            dir_name = os.path.dirname(abs_path)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            data = [asdict(p) for p in self._store.values()]
            with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as tf:
                json.dump(data, tf, indent=2)
                temp_name = tf.name
            os.replace(temp_name, abs_path)
        except Exception as e:
            print(f"[ModelRegistry] Failed to persist config to disk: {e}")

    def get_all(self) -> Dict[str, ModelProfile]:
        with self._lock:
            return {k: copy.deepcopy(v) for k, v in self._store.items()}

    def get(self, model_key: str) -> Optional[ModelProfile]:
        with self._lock:
            profile = self._store.get(model_key)
            return copy.deepcopy(profile) if profile else None

    def exists(self, model_key: str) -> bool:
        with self._lock:
            return model_key in self._store

    def validate_patch(self, updates: dict) -> Tuple[bool, Optional[str]]:
        """Validate candidate patch fields and value bounds."""
        for key, val in updates.items():
            if key not in self.ALLOWED_UPDATE_FIELDS:
                return False, f"Unknown configuration field: '{key}'"

            expected_type = self.ALLOWED_UPDATE_FIELDS[key]
            if not isinstance(val, expected_type):
                return False, f"Invalid type for field '{key}': expected {expected_type}, got {type(val)}"

            # Value range validations
            if key in ("avg_latency_ms", "max_latency_ms", "latency_ms") and val <= 0:
                return False, f"'{key}' must be positive integer (> 0)"
            if key in ("capability_score", "capability") and not (1.0 <= val <= 10.0):
                return False, f"'{key}' must be between 1.0 and 10.0"
            if key == "reliability" and not (0.0 <= val <= 1.0):
                return False, "'reliability' must be between 0.0 and 1.0"
            if key == "cost_per_1k_tokens" and val < 0:
                return False, "'cost_per_1k_tokens' cannot be negative"
            if key == "context_length" and val < 128:
                return False, "'context_length' must be at least 128 tokens"
            if key == "tokens_used" and val < 0:
                return False, "'tokens_used' cannot be negative"
            if key == "measured_latency_ms" and val < 0:
                return False, "'measured_latency_ms' cannot be negative"

        return True, None

    def update(self, model_key: str, updates: dict) -> Tuple[Optional[ModelProfile], Optional[str]]:
        """
        Validate and update model configuration. Persists atomically.
        Returns (updated_profile, error_message).
        """
        with self._lock:
            profile = self._store.get(model_key)
            if not profile:
                return None, f"Model '{model_key}' not found."

            valid, err = self.validate_patch(updates)
            if not valid:
                return None, err

            for key, val in updates.items():
                if key in ("latency_ms", "avg_latency_ms"):
                    profile.avg_latency_ms = int(val)
                    if profile.max_latency_ms < profile.avg_latency_ms:
                        profile.max_latency_ms = profile.avg_latency_ms * 2
                elif key == "max_latency_ms":
                    profile.max_latency_ms = int(val)
                elif key in ("capability_score", "capability"):
                    profile.capability_score = float(val)
                elif key == "context_length":
                    profile.context_length = int(val)
                elif key == "reliability":
                    profile.reliability = float(val)
                elif key == "availability":
                    profile.availability = bool(val)
                elif key == "available":
                    profile.availability = bool(val)
                    profile.enabled = bool(val)
                elif key == "enabled":
                    profile.enabled = bool(val)
                elif key == "cost_per_1k_tokens":
                    profile.cost_per_1k_tokens = float(val)
                elif key == "tokens_used":
                    profile.tokens_used = int(val)
                elif key == "measured_latency_ms":
                    profile.measured_latency_ms = int(val)

            self._save_to_disk_locked()
            return copy.deepcopy(profile), None

    def record_measured_latency(self, model_key: str, measured_ms: int):
        """Update actual measured execution latency without changing judge configuration."""
        with self._lock:
            profile = self._store.get(model_key)
            if profile:
                profile.measured_latency_ms = measured_ms
                self._save_to_disk_locked()

    def record_token_usage(self, model_key: str, tokens: int, measured_ms: Optional[int] = None):
        """Accumulate tokens used and update measured latency for a model."""
        with self._lock:
            profile = self._store.get(model_key)
            if profile:
                profile.tokens_used = getattr(profile, "tokens_used", 0) + max(0, int(tokens))
                if measured_ms is not None:
                    profile.measured_latency_ms = int(measured_ms)
                self._save_to_disk_locked()

    def reset(self) -> List[dict]:
        """Reset all model profiles to canonical defaults."""
        with self._lock:
            self._load_defaults_locked()
            return [p.to_dict() for p in self._store.values()]

    def to_list(self) -> List[dict]:
        with self._lock:
            return [p.to_dict() for p in self._store.values()]


# Module singleton
registry = ModelRegistry()
