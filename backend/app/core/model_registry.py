"""
Model Registry - Loads and manages model configurations.
Models are loaded from config/models.json and can be dynamically updated at runtime.
Judges can alter any model parameter (latency, availability, reliability) to see dynamic routing.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from app.schemas import ModelInfo, ModelTier


class ModelEntry:
    """Internal representation of a model with mutable runtime state."""

    def __init__(self, data: dict):
        self._initial_data = dict(data)
        self.id: str = data["id"]
        self.name: str = data["name"]
        self.ollama_tag: str = data["ollama_tag"]
        self.role: str = data.get("role", "General purpose model")
        self.download_size: str = data.get("download_size", "~3 GB")
        self.recommendation: str = data.get("recommendation", "Essential")
        self.capability_score: int = data["capability_score"]
        self.context_length: int = data["context_length"]
        self.avg_latency_ms: int = data["avg_latency_ms"]
        self.max_latency_ms: int = data["max_latency_ms"]
        self.cost_per_1k_tokens: float = data["cost_per_1k_tokens"]
        self.reliability: float = data["reliability"]
        self.output_token_capacity: int = data.get("output_token_capacity", 2048)
        self.task_suitability: list[str] = data.get("task_suitability", [])
        self.description: str = data["description"]
        self.tier: ModelTier = ModelTier(data["tier"])
        self.enabled: bool = data.get("enabled", True)

        # Runtime state
        self.available: bool = True
        self.current_load: int = 0
        self.total_requests: int = 0
        self.total_failures: int = 0

    def to_info(self) -> ModelInfo:
        return ModelInfo(
            id=self.id,
            name=self.name,
            role=self.role,
            download_size=self.download_size,
            recommendation=self.recommendation,
            capability_score=self.capability_score,
            context_length=self.context_length,
            avg_latency_ms=self.avg_latency_ms,
            max_latency_ms=self.max_latency_ms,
            cost_per_1k_tokens=self.cost_per_1k_tokens,
            reliability=self.reliability,
            output_token_capacity=self.output_token_capacity,
            current_load=self.current_load,
            task_suitability=self.task_suitability,
            description=self.description,
            tier=self.tier,
            enabled=self.enabled,
            available=self.available,
        )

    def update(self, **kwargs):
        """Update mutable fields at runtime."""
        for key, value in kwargs.items():
            if value is not None and hasattr(self, key):
                setattr(self, key, value)

    def reset(self):
        """Reset mutable fields back to default configuration."""
        for key in [
            "avg_latency_ms", "max_latency_ms", "capability_score",
            "context_length", "cost_per_1k_tokens", "reliability",
            "output_token_capacity", "enabled"
        ]:
            if key in self._initial_data:
                setattr(self, key, self._initial_data[key])
        self.available = True
        self.current_load = 0


class ModelRegistry:
    """
    Manages all registered models.
    Models are loaded from a JSON config and their state can be updated at runtime.
    """

    def __init__(self):
        self._models: dict[str, ModelEntry] = {}
        self._config_path = Path(__file__).parent.parent.parent / "config" / "models.json"

    async def load_models(self):
        """Load models from config/models.json."""
        with open(self._config_path, "r") as f:
            data = json.load(f)

        self._models = {}
        for model_data in data["models"]:
            entry = ModelEntry(model_data)
            self._models[entry.id] = entry

        print(f"[ModelRegistry] Loaded {len(self._models)} models")

    def get_all(self) -> list[ModelEntry]:
        """Return all registered models."""
        return list(self._models.values())

    def get_enabled(self) -> list[ModelEntry]:
        """Return only enabled models."""
        return [m for m in self._models.values() if m.enabled]

    def get_available(self) -> list[ModelEntry]:
        """Return models that are both enabled and available."""
        return [m for m in self._models.values() if m.enabled and m.available]

    def get(self, model_id: str) -> Optional[ModelEntry]:
        """Get a specific model by ID."""
        return self._models.get(model_id)

    def update_model(self, model_id: str, **kwargs) -> Optional[ModelEntry]:
        """Update a model's configuration at runtime."""
        model = self._models.get(model_id)
        if model:
            model.update(**kwargs)
        return model

    def reset_all(self):
        """Reset all models to initial defaults."""
        for model in self._models.values():
            model.reset()

    @property
    def count(self) -> int:
        return len(self._models)

    @property
    def available_count(self) -> int:
        return len(self.get_available())
