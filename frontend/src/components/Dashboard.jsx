import React from 'react';

export default function Dashboard({ stats, models, health, onRefresh }) {
  const totalModels = models?.length || 0;
  const availableModels = models?.filter((m) => m.available !== false && m.enabled).length || 0;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>ModelRouter Analytics & Observability</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            Real-time telemetry tracking routing efficiency, hard constraint compliance, and failover dynamics.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
          🔄 Refresh Metrics
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Requests</div>
          <div className="stat-value">{stats?.total_requests || 0}</div>
          <div className="stat-sub" style={{ color: 'var(--text-tertiary)' }}>Inference & routing queries</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">SLA Success Rate</div>
          <div className="stat-value" style={{ color: (stats?.success_rate || 100) >= 90 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
            {stats?.total_requests ? `${stats.success_rate}%` : '100%'}
          </div>
          <div className="stat-sub">
            {(stats?.success_rate || 100) >= 90 ? '🟢 Constraints Strictly Preserved' : '🟡 Review Violations'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Latency</div>
          <div className="stat-value">{stats?.avg_latency_ms || 0}ms</div>
          <div className="stat-sub" style={{ color: 'var(--accent-cyan)' }}>Across active candidates</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Failover Rate</div>
          <div className="stat-value" style={{ color: (stats?.fallback_rate || 0) > 0 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
            {stats?.fallback_rate || 0}%
          </div>
          <div className="stat-sub" style={{ color: 'var(--text-tertiary)' }}>Zero constraint relaxations</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active Models</div>
          <div className="stat-value">{availableModels} / {totalModels}</div>
          <div className="stat-sub" style={{ color: 'var(--accent-green)' }}>Ready for dispatch</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Inference Engine</div>
          <div className="stat-value" style={{ fontSize: '1.05rem', color: health?.ollama_connected ? 'var(--accent-green)' : 'var(--accent-cyan)' }}>
            {health?.ollama_connected ? '🟢 Ollama Live' : '⚡ Smart Simulator'}
          </div>
          <div className="stat-sub" style={{ color: 'var(--text-tertiary)' }}>
            {health?.ollama_connected ? 'Local daemon connected' : 'Full persona simulation'}
          </div>
        </div>
      </div>

      {/* Visual Pipeline Architecture Card */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px', background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.8), rgba(26, 34, 52, 0.6))' }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🏗️ ModelRouter Dynamic Pipeline Architecture</span>
          <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>Constraint-Preserving Gateway</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '12px 14px', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 700 }}>STEP 1</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>Query Intake & Analysis</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Estimates complexity & uncertainty buffer. Enforces the safer option when unsure.
            </div>
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '12px 14px', borderRadius: '8px', borderLeft: '3px solid var(--accent-red)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--accent-red)', fontWeight: 700 }}>STEP 2</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>Hard Constraint Filtering</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Evaluates Latency, Capability, Context, Cost, Availability. Disqualifies invalid models.
            </div>
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '12px 14px', borderRadius: '8px', borderLeft: '3px solid var(--accent-purple)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--accent-purple)', fontWeight: 700 }}>STEP 3</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>Preference Scoring</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Ranks eligible models by Balanced, Latency, Capability, or Cost. Builds fallback chain.
            </div>
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '12px 14px', borderRadius: '8px', borderLeft: '3px solid var(--accent-green)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--accent-green)', fontWeight: 700 }}>STEP 4</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '2px' }}>Execution & Failover</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Treats endpoints as unreliable. Fails over strictly to remaining valid models. Never relaxes constraints.
            </div>
          </div>
        </div>
      </div>

      {/* Distribution Charts */}
      <div className="dashboard-grid">
        {/* Model Usage Distribution */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">📊 Model Selection Distribution</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>By routing choice</span>
          </div>
          {stats?.model_usage && Object.keys(stats.model_usage).length > 0 ? (
            <div className="chart-bar-container">
              {Object.entries(stats.model_usage)
                .sort(([, a], [, b]) => b - a)
                .map(([modelId, count]) => {
                  const maxCount = Math.max(...Object.values(stats.model_usage));
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  const modelObj = models?.find((m) => m.id === modelId);
                  return (
                    <div key={modelId} className="chart-bar-row">
                      <span className="chart-bar-label" title={modelId}>
                        {modelObj ? modelObj.name : modelId}
                      </span>
                      <div className="chart-bar-track">
                        <div className="chart-bar-fill" style={{ width: `${Math.max(pct, 10)}%` }}>
                          {count}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-state-text">No requests logged yet. Try sending some test queries!</div>
            </div>
          )}
        </div>

        {/* Complexity Distribution */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🧠 Estimated Complexity Breakdown</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>With safety buffers</span>
          </div>
          {stats?.complexity_distribution && Object.keys(stats.complexity_distribution).length > 0 ? (
            <div className="chart-bar-container">
              {['simple', 'moderate', 'complex', 'very_complex'].map((level) => {
                const count = stats.complexity_distribution[level] || 0;
                const total = stats.total_requests || 1;
                const pct = (count / total) * 100;
                const colors = {
                  simple: '#10b981',
                  moderate: '#3b82f6',
                  complex: '#8b5cf6',
                  very_complex: '#f59e0b',
                };
                return (
                  <div key={level} className="chart-bar-row">
                    <span className="chart-bar-label" style={{ textTransform: 'capitalize' }}>
                      {level.replace('_', ' ')}
                    </span>
                    <div className="chart-bar-track">
                      <div
                        className="chart-bar-fill"
                        style={{
                          width: `${Math.max(pct, 8)}%`,
                          background: colors[level] || 'var(--accent-blue)',
                        }}
                      >
                        {count} ({pct.toFixed(0)}%)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-state-text">Complexity distribution will populate as requests are sent.</div>
            </div>
          )}
        </div>
      </div>

      {/* Model Registry Specifications Reference Table */}
      <div className="card" style={{ marginTop: '24px', padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>📋 Model Portfolio Specification (Problem Statement Matrix)</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Comparing model capabilities, latencies, and roles under Ollama local execution
            </div>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Role in ModelRouter</th>
                <th>Download Size</th>
                <th>Capability Score</th>
                <th>Context Length</th>
                <th>Avg / Max Latency</th>
                <th>Reliability</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {models?.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{m.role}</td>
                  <td className="mono" style={{ fontSize: '0.8rem' }}>{m.download_size}</td>
                  <td>
                    <span className="badge badge-purple">{m.capability_score}/10</span>
                  </td>
                  <td className="mono" style={{ fontSize: '0.8rem' }}>{(m.context_length / 1024).toFixed(0)}K tokens</td>
                  <td className="mono" style={{ fontSize: '0.8rem' }}>{m.avg_latency_ms}ms / {m.max_latency_ms}ms</td>
                  <td>
                    <span className="badge badge-green">{(m.reliability * 100).toFixed(0)}%</span>
                  </td>
                  <td>
                    <span className={`badge ${m.tier === 'essential' ? 'badge-green' : m.tier === 'optional' ? 'badge-blue' : 'badge-purple'}`}>
                      {m.recommendation || m.tier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
