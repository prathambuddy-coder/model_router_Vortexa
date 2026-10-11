/**
 * API Service — Communicates with the ModelRouter backend gateway.
 */

const API_BASE = 'http://localhost:8000/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Health ─────────────────────────────────────────────────────────────────

export async function getHealth() {
  return request('/health');
}

// ─── Models ─────────────────────────────────────────────────────────────────

export async function getModels() {
  return request('/models');
}

export async function getModel(modelId) {
  return request(`/models/${modelId}`);
}

export async function updateModel(modelId, updates) {
  return request(`/models/${modelId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function resetModels() {
  return request('/models/reset', {
    method: 'POST',
  });
}

// ─── Inference ──────────────────────────────────────────────────────────────

export async function infer(payload) {
  return request('/infer', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function routeOnly(payload) {
  return request('/route', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Logs & Stats ───────────────────────────────────────────────────────────

export async function getLogs(limit = 100) {
  return request(`/logs?limit=${limit}`);
}

export async function getLogEntry(requestId) {
  return request(`/logs/${requestId}`);
}

export async function clearLogs() {
  return request('/logs', {
    method: 'DELETE',
  });
}

export async function getStats() {
  return request('/stats');
}
