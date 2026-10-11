"""
ModelRouter Backend - Main Application Entry Point
Cost-, Latency- & Quality-Aware AI Inference Gateway
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router
from app.core.model_registry import ModelRegistry

model_registry = ModelRegistry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load registered models from configuration
    await model_registry.load_models()
    app.state.model_registry = model_registry
    yield
    # Shutdown logic if needed


app = FastAPI(
    title="ModelRouter Gateway",
    description="Cost-, Latency- & Quality-Aware Dynamic AI Inference Gateway",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
