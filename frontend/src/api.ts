// ── All API calls to the ModelRouter backend ─────────────────
import type { Constraints, InferResponse, ModelInfo, AuditEntry } from './types';

const BASE = 'http://localhost:5000/api';

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw new Error(`fetchModels failed: ${res.status}`);
  const data = await res.json();
  return data.models || [];
}

export async function patchModel(
  modelKey: string,
  patch: Partial<Record<string, any>>
): Promise<ModelInfo> {
  const res = await fetch(`${BASE}/models/${modelKey}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `patchModel failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.model;
}

export async function resetModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`resetModels failed: ${res.status}`);
  const data = await res.json();
  return data.models || [];
}

export async function postInfer(
  prompt: string,
  constraints: Constraints,
  images: string[] = []
): Promise<InferResponse> {
  // Backend caps a request at 150s (incl. failover); abort slightly later as a safety net.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 160000);
  try {
    const res = await fetch(`${BASE}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(images.length ? { prompt, constraints, images } : { prompt, constraints }),
      signal: controller.signal,
    });
    return await res.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out after 160s. No model responded in time.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLogs(): Promise<AuditEntry[]> {
  const res = await fetch(`${BASE}/logs?limit=200`);
  if (!res.ok) throw new Error(`fetchLogs failed: ${res.status}`);
  const data = await res.json();
  return data.logs || [];
}
