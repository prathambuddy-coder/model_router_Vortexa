"""
Pydantic schemas for request/response validation.
Defines the strict contracts between frontend, backend, and router gateway.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ─── Enums ─────────────────────────────────────────────────────────────────────

class OptimizationPreference(str, Enum):
    """What to optimize for among valid models."""
    LOWEST_COST = "lowest_cost"
    LOWEST_LATENCY = "lowest_latency"
    HIGHEST_CAPABILITY = "highest_capability"
    BALANCED = "balanced"


class ModelTier(str, Enum):
    ESSENTIAL = "essential"
    OPTIONAL = "optional"
    EXPERIMENTAL = "experimental"


class RequestComplexity(str, Enum):
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"
    VERY_COMPLEX = "very_complex"


class FailureReason(str, Enum):
    TIMEOUT = "timeout"
    MODEL_ERROR = "model_error"
    UNAVAILABLE = "unavailable"
    LATENCY_BREACH = "latency_breach"
    CONSTRAINT_VIOLATION = "constraint_violation"


# ─── Request Schemas ───────────────────────────────────────────────────────────

class InferenceRequest(BaseModel):
    """
    A user request carrying explicit hard constraints.
    The router must never violate any of these.
    """
    prompt: str = Field(..., min_length=1, description="The user query/prompt")

    # Hard constraints - a model that violates any is NOT a valid choice
    max_latency_ms: Optional[int] = Field(
        None,
        ge=50,
        description="Maximum acceptable latency in milliseconds"
    )
    max_cost_per_1k_tokens: Optional[float] = Field(
        None,
        ge=0.0,
        description="Maximum acceptable cost per 1K tokens"
    )
    min_capability_score: Optional[int] = Field(
        None,
        ge=1,
        le=10,
        description="Minimum capability score (1-10)"
    )
    required_context_length: Optional[int] = Field(
        None,
        ge=1,
        description="Required minimum context length in tokens"
    )
    min_output_tokens: Optional[int] = Field(
        None,
        ge=1,
        description="Required minimum output token capacity"
    )

    # Optimization preference among valid models
    optimization: OptimizationPreference = Field(
        OptimizationPreference.BALANCED,
        description="How to choose among valid models"
    )

    # Testing & simulation controls for Judges / Demo
    simulate_failure_model_ids: list[str] = Field(
        default_factory=list,
        description="Model IDs to forcefully fail to test constraint-preserving failover"
    )
    force_timeout: bool = Field(
        False,
        description="Force primary model to exceed latency budget to demonstrate failover"
    )


class ModelConfigUpdate(BaseModel):
    """Schema for updating a model's configuration at runtime."""
    avg_latency_ms: Optional[int] = Field(None, ge=0)
    max_latency_ms: Optional[int] = Field(None, ge=0)
    reliability: Optional[float] = Field(None, ge=0.0, le=1.0)
    enabled: Optional[bool] = None
    available: Optional[bool] = None
    capability_score: Optional[int] = Field(None, ge=1, le=10)
    context_length: Optional[int] = Field(None, ge=1)
    cost_per_1k_tokens: Optional[float] = Field(None, ge=0.0)
    current_load: Optional[int] = Field(None, ge=0)
    output_token_capacity: Optional[int] = Field(None, ge=1)


# ─── Response Schemas ──────────────────────────────────────────────────────────

class ComplexityAnalysis(BaseModel):
    """Deep analysis of query complexity and uncertainty."""
    complexity: RequestComplexity
    confidence_score: float
    uncertainty_applied: bool
    reasoning_indicators: list[str] = Field(default_factory=list)
    recommended_min_capability: int
    suggested_task_types: list[str] = Field(default_factory=list)


class ModelCandidate(BaseModel):
    """A model that was evaluated during routing with full explainability."""
    model_id: str
    model_name: str
    role: str = ""
    download_size: str = ""
    recommendation: str = ""
    eligible: bool
    rejection_reasons: list[str] = Field(default_factory=list)
    constraint_checks: dict[str, bool] = Field(default_factory=dict)
    score: Optional[float] = None
    score_breakdown: Optional[dict[str, float]] = None
    capability_score: int
    avg_latency_ms: int
    max_latency_ms: int
    context_length: int
    cost_per_1k_tokens: float
    reliability: float
    output_token_capacity: int
    current_load: int = 0
    task_suitability: list[str] = Field(default_factory=list)
    tier: ModelTier


class RoutingDecision(BaseModel):
    """
    Full explainable routing decision.
    Shows which models were considered, why some were rejected,
    and why the selected model was chosen.
    """
    request_id: str
    selected_model_id: Optional[str] = None
    selected_model_name: Optional[str] = None
    complexity_analysis: ComplexityAnalysis
    estimated_complexity: RequestComplexity  # Kept for direct backwards compatibility
    candidates: list[ModelCandidate]
    selection_reason: str
    fallback_chain: list[str] = Field(
        default_factory=list,
        description="Ordered list of fallback model IDs that pass all hard constraints"
    )
    no_valid_model: bool = False
    no_valid_model_reason: Optional[str] = None


class FallbackAttempt(BaseModel):
    """Record of a fallback attempt during inference execution."""
    model_id: str
    model_name: str
    reason: FailureReason
    latency_ms: int
    error_message: Optional[str] = None


class InferenceResponse(BaseModel):
    """Response from the inference gateway."""
    request_id: str
    response_text: Optional[str] = None
    model_used: Optional[str] = None
    model_name: Optional[str] = None
    routing_decision: RoutingDecision
    latency_ms: int
    fallback_used: bool = False
    fallback_attempts: list[FallbackAttempt] = Field(default_factory=list)
    error: Optional[str] = None
    success: bool = True
    execution_type: str = "simulated"


class ModelInfo(BaseModel):
    """Public model information."""
    id: str
    name: str
    role: str
    download_size: str
    recommendation: str
    capability_score: int
    context_length: int
    avg_latency_ms: int
    max_latency_ms: int
    cost_per_1k_tokens: float
    reliability: float
    output_token_capacity: int
    current_load: int = 0
    task_suitability: list[str]
    description: str
    tier: ModelTier
    enabled: bool
    available: bool = True


class HealthStatus(BaseModel):
    """Health check response."""
    status: str
    models_loaded: int
    models_available: int
    ollama_connected: bool
    mode: str = "intelligent_hybrid"


class AuditLogEntry(BaseModel):
    """An entry in the routing audit log."""
    request_id: str
    timestamp: str
    prompt_preview: str
    estimated_complexity: RequestComplexity
    constraints: dict
    selected_model: Optional[str]
    fallback_used: bool
    fallback_attempts: int
    latency_ms: int
    success: bool
    error: Optional[str] = None
    routing_decision: RoutingDecision
