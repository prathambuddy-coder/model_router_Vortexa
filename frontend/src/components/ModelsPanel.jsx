import { useState, useEffect } from 'react';
import { updateModel, resetModels, routeOnly } from '../api';

const TIER_BADGES = {
  essential: 'badge-green',
  optional: 'badge-blue',
  experimental: 'badge-purple',
};

export default function ModelsPanel({ models, onRefresh }) {
  const [editingModel, setEditingModel] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [scenarioStatus, setScenarioStatus] = useState('');
  const [liveTestPrompt, setLiveTestPrompt] = useState('What is the capital of France?');
  const [liveTestMaxLatency, setLiveTestMaxLatency] = useState(3000);
  const [liveRouteResult, setLiveRouteResult] = useState(null);

  const openEdit = (model) => {
    setEditingModel(model);
    setEditForm({
      avg_latency_ms: model.avg_latency_ms,
      max_latency_ms: model.max_latency_ms,
      capability_score: model.capability_score,
      reliability: model.reliability,
      enabled: model.enabled,
      available: model.available !== false,
      cost_per_1k_tokens: model.cost_per_1k_tokens,
      current_load: model.current_load || 0,
      context_length: model.context_length,
      output_token_capacity: model.output_token_capacity,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateModel(editingModel.id, editForm);
      setEditingModel(null);
      if (onRefresh) await onRefresh();
      triggerLiveTest();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleModelAvailable = async (model) => {
    try {
      const nextState = !(model.available !== false);
      await updateModel(model.id, { available: nextState });
      if (onRefresh) await onRefresh();
      triggerLiveTest();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleModelEnabled = async (model) => {
    try {
      await updateModel(model.id, { enabled: !model.enabled });
      if (onRefresh) await onRefresh();
      triggerLiveTest();
    } catch (err) {
      console.error(err);
    }
  };

  // Run live route verification
  const triggerLiveTest = async () => {
    try {
      const res = await routeOnly({
        prompt: liveTestPrompt,
        max_latency_ms: liveTestMaxLatency ? parseInt(liveTestMaxLatency, 10) : undefined,
        optimization: 'balanced',
      });
      setLiveRouteResult(res.routing_decision);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    triggerLiveTest();
  }, [models, liveTestPrompt, liveTestMaxLatency]);

  // Pre-configured Judge Scenarios
  const runScenario = async (type) => {
    setScenarioStatus('Applying scenario...');
    try {
      if (type === 'outage-qwen2b') {
        await updateModel('qwen3.5-2b', { available: false });
        setScenarioStatus('Simulated outage on Qwen3.5 2B (marked Offline). Router will dynamically reroute simple requests to Qwen3.5 4B.');
      } else if (type === 'spike-deepseek') {
        await updateModel('deepseek-r1-7b', { avg_latency_ms: 7500, max_latency_ms: 12000 });
        setScenarioStatus('Spiked DeepSeek-R1 latency to 7500ms avg / 12000ms max. Gateway will reject it for tighter SLAs and use Phi-4-mini.');
      } else if (type === 'degrade-reliability') {
        await updateModel('qwen3.5-4b', { reliability: 0.60 });
        setScenarioStatus('Degraded Qwen3.5 4B reliability to 60%. Scoring penalty reduces its selection priority.');
      } else if (type === 'high-load-qwen4b') {
        await updateModel('qwen3.5-4b', { current_load: 8 });
        setScenarioStatus('Simulated high concurrent load (8 requests) on Qwen3.5 4B. Router load balancing penalty applied.');
      } else if (type === 'reset-all') {
        await resetModels();
        setScenarioStatus('Reset all models to baseline parameters and 100% online state.');
      }
      if (onRefresh) await onRefresh();
      setTimeout(() => setScenarioStatus(''), 5000);
    } catch (err) {
      setScenarioStatus('Error applying scenario: ' + err.message);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🤖</span>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Model Registry & Judge Control Center</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            Judges can modify any model's latency or availability at runtime to see the gateway immediately re-route requests without restarting.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => runScenario('reset-all')}>
            🔄 Reset All to Baseline
          </button>
          <button className="btn btn-primary btn-sm" onClick={onRefresh}>
            ⚡ Refresh Status
          </button>
        </div>
      </div>

      {/* Judge Benchmark Scenarios Deck */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.7))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚖️ 1-Click Judge Challenge Scenarios:
          </span>
          {scenarioStatus && (
            <span className="badge badge-amber animate-fade-in" style={{ fontSize: '0.75rem' }}>
              {scenarioStatus}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => runScenario('outage-qwen2b')}
            style={{ fontSize: '0.78rem', borderColor: 'rgba(239, 68, 68, 0.4)' }}
          >
            🔴 Outage on Qwen 2B (Trigger Failover)
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => runScenario('spike-deepseek')}
            style={{ fontSize: '0.78rem', borderColor: 'rgba(245, 158, 11, 0.4)' }}
          >
            ⏱️ Spike DeepSeek Latency (Breach SLA)
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => runScenario('degrade-reliability')}
            style={{ fontSize: '0.78rem', borderColor: 'rgba(139, 92, 246, 0.4)' }}
          >
            📉 Degrade Qwen 4B Reliability (60%)
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => runScenario('high-load-qwen4b')}
            style={{ fontSize: '0.78rem', borderColor: 'rgba(6, 182, 212, 0.4)' }}
          >
            🚦 High Load on Qwen 4B (Load Penalty)
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => runScenario('reset-all')}
            style={{ fontSize: '0.78rem', borderColor: 'rgba(16, 185, 129, 0.4)' }}
          >
            ✅ Restore Factory Defaults
          </button>
        </div>
      </div>

      {/* Live Route Verification Widget */}
      <div className="card" style={{ marginBottom: '24px', padding: '14px 18px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            🧪 Live Interactive Route Inspector (Updates dynamically as you edit models below):
          </span>
          {liveRouteResult && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Live Winner:</span>
              {liveRouteResult.no_valid_model ? (
                <span className="badge badge-red">🚫 No Valid Model</span>
              ) : (
                <span className="badge badge-green" style={{ fontWeight: 700 }}>
                  🏆 {liveRouteResult.selected_model_name}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            value={liveTestPrompt}
            onChange={(e) => setLiveTestPrompt(e.target.value)}
            placeholder="Sample test prompt..."
            style={{ flex: 1, minWidth: '220px', padding: '6px 12px', fontSize: '0.8rem' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Max Latency:</span>
            <input
              type="number"
              className="form-input"
              value={liveTestMaxLatency}
              onChange={(e) => setLiveTestMaxLatency(e.target.value)}
              placeholder="Budget ms"
              style={{ width: '100px', padding: '6px 8px', fontSize: '0.8rem' }}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={triggerLiveTest} style={{ padding: '6px 12px' }}>
            Inspect Route
          </button>
        </div>
      </div>

      {/* Model Cards Grid */}
      <div className="models-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
        {models?.map((model) => {
          const isOnline = model.available !== false;
          const isEnabled = model.enabled !== false;
          return (
            <div
              key={model.id}
              className="card"
              style={{
                position: 'relative',
                padding: '20px',
                border: isOnline && isEnabled ? '1px solid var(--border-default)' : '1px solid rgba(239, 68, 68, 0.3)',
                background: isOnline ? 'var(--bg-card)' : 'rgba(239, 68, 68, 0.04)',
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{model.name}</h3>
                    <span className={`badge ${TIER_BADGES[model.tier] || 'badge-blue'}`} style={{ fontSize: '0.68rem' }}>
                      {model.recommendation || model.tier}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: '2px', fontWeight: 600 }}>
                    {model.role} • {model.download_size}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className={`btn btn-sm ${isOnline ? 'btn-secondary' : 'btn-danger'}`}
                    onClick={() => toggleModelAvailable(model)}
                    style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                    title={isOnline ? 'Simulate outage' : 'Bring back online'}
                  >
                    {isOnline ? '🟢 Online' : '🔴 Offline'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEdit(model)}
                    style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                  >
                    ✏️ Edit
                  </button>
                </div>
              </div>

              {/* Description */}
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '14px', lineHeight: 1.4 }}>
                {model.description}
              </p>

              {/* Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>AVG LATENCY</div>
                  <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {model.avg_latency_ms}ms
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>max {model.max_latency_ms}ms</div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>CAPABILITY</div>
                  <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-purple)' }}>
                    {model.capability_score}/10
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Context: {(model.context_length / 1024).toFixed(0)}K</div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>RELIABILITY</div>
                  <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                    {(model.reliability * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Load: {model.current_load || 0} req</div>
                </div>
              </div>

              {/* Task Suitability Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {model.task_suitability?.map((task) => (
                  <span key={task} className="badge badge-gray" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                    {task.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Model Modal */}
      {editingModel && (
        <div className="modal-overlay" onClick={() => setEditingModel(null)}>
          <div className="modal-card animate-scale-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                ✏️ Runtime Config: {editingModel.name}
              </h3>
              <button className="modal-close" onClick={() => setEditingModel(null)}>
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Modifying these values immediately alters the router constraint checks and scoring formulas.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Average Latency (ms)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editForm.avg_latency_ms}
                  onChange={(e) => setEditForm({ ...editForm, avg_latency_ms: parseInt(e.target.value, 10) })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Worst-Case Max Latency (ms)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editForm.max_latency_ms}
                  onChange={(e) => setEditForm({ ...editForm, max_latency_ms: parseInt(e.target.value, 10) })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Capability Score (1-10)</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  max="10"
                  value={editForm.capability_score}
                  onChange={(e) => setEditForm({ ...editForm, capability_score: parseInt(e.target.value, 10) })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Reliability (0.0 - 1.0)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  className="form-input"
                  value={editForm.reliability}
                  onChange={(e) => setEditForm({ ...editForm, reliability: parseFloat(e.target.value) })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Current Active Load (reqs)</label>
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  value={editForm.current_load}
                  onChange={(e) => setEditForm({ ...editForm, current_load: parseInt(e.target.value, 10) })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Context Length (tokens)</label>
                <input
                  type="number"
                  min="512"
                  className="form-input"
                  value={editForm.context_length}
                  onChange={(e) => setEditForm({ ...editForm, context_length: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '12px', padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editForm.available}
                  onChange={(e) => setEditForm({ ...editForm, available: e.target.checked })}
                />
                Available (Endpoint reachable)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editForm.enabled}
                  onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })}
                />
                Enabled in Registry
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingModel(null)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : '💾 Apply Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
