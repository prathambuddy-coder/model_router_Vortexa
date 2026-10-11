import React, { useState } from 'react';
import ConstraintBoundaryChart from './ConstraintBoundaryChart';
import QueryTimelineChart from './QueryTimelineChart';
import ScoreBreakdownChart from './ScoreBreakdownChart';

export default function Dashboard({ stats, models, health, onRefresh }) {
  const totalModels = models?.length || 0;
  const availableModels = models?.filter((m) => m.available !== false && m.enabled).length || 0;

  // Selected query for dynamic graph inspection
  const timeline = stats?.recent_timeline || [];
  const [selectedTimelineIdx, setSelectedTimelineIdx] = useState(null);

  // If user selected a specific past query, use its data; otherwise use latest
  const activeTimelineItem = (selectedTimelineIdx !== null && timeline[selectedTimelineIdx])
    ? timeline[selectedTimelineIdx]
    : (timeline.length > 0 ? timeline[timeline.length - 1] : null);

  // Build constraints object for boundary plot
  const activeConstraints = activeTimelineItem ? {
    max_latency_ms: activeTimelineItem.max_latency_constraint,
    min_capability_score: activeTimelineItem.min_capability_constraint,
  } : null;

  // Mock or latest routing decision structure for boundary plot
  const activeDecision = stats?.latest_entry?.routing_decision || {
    selected_model_id: activeTimelineItem?.model,
    candidates: models?.map((m) => ({
      model_id: m.id,
      model_name: m.name,
      capability_score: m.capability_score,
      avg_latency_ms: m.avg_latency_ms,
      max_latency_ms: m.max_latency_ms,
      eligible: activeConstraints?.max_latency_ms ? m.max_latency_ms <= activeConstraints.max_latency_ms : true,
    })),
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>ModelRouter Analytics & Dynamic Graphs</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            Live telemetry tracking routing decisions, dynamic 2D constraint solution spaces, and performance trends.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
          🔄 Refresh Metrics
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Requests</div>
          <div className="stat-value">{stats?.total_requests || 0}</div>
          <div className="stat-sub" style={{ color: 'var(--text-tertiary)' }}>Live & simulated traffic</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">SLA Compliance</div>
          <div className="stat-value" style={{ color: (stats?.success_rate || 100) >= 90 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
            {stats?.total_requests ? `${stats.success_rate}%` : '100%'}
          </div>
          <div className="stat-sub">
            {(stats?.success_rate || 100) >= 90 ? '🟢 Constraints Strictly Preserved' : '🟡 Review Violations'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Response Latency</div>
          <div className="stat-value">{stats?.avg_latency_ms || 0}ms</div>
          <div className="stat-sub" style={{ color: 'var(--accent-cyan)' }}>Optimal speed matching</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Latency Saved</div>
          <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
            {((stats?.latency_saved_ms || 0) / 1000).toFixed(1)}s
          </div>
          <div className="stat-sub" style={{ color: 'var(--text-tertiary)' }}>vs. always routing to largest model</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Failover Rate</div>
          <div className="stat-value" style={{ color: (stats?.fallback_rate || 0) > 0 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
            {stats?.fallback_rate || 0}%
          </div>
          <div className="stat-sub" style={{ color: 'var(--text-tertiary)' }}>Zero constraint relaxations</div>
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

      {/* Dynamic Graph 1 & 2 Section: Active Query Constraint Boundary & Score Breakdown */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📐 Dynamic Constraint Boundary & Decision Map</span>
              <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>Real-Time Parameter Plot</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Visualizes the exact SLA boundary and why the winner was chosen for this specific query
            </div>
          </div>

          {/* Dynamic Query Selector */}
          {timeline.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Inspect Query:</span>
              <select
                className="form-select"
                style={{ padding: '6px 12px', fontSize: '0.75rem', minWidth: '220px' }}
                value={selectedTimelineIdx !== null ? selectedTimelineIdx : (timeline.length - 1)}
                onChange={(e) => setSelectedTimelineIdx(parseInt(e.target.value, 10))}
              >
                {timeline.map((item, idx) => (
                  <option key={idx} value={idx}>
                    #{item.request_id} — {item.model} ({item.complexity})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Selected Query Details Bar */}
        {activeTimelineItem && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
            <span><strong>Prompt:</strong> "{activeTimelineItem.prompt}"</span>
            <span className="badge badge-blue">Model: {activeTimelineItem.model}</span>
            <span className="badge badge-cyan">Latency: {activeTimelineItem.latency_ms}ms</span>
            {activeTimelineItem.max_latency_constraint && (
              <span className="badge badge-red">SLA Budget: {activeTimelineItem.max_latency_constraint}ms</span>
            )}
            <span className="badge badge-purple">Complexity: {activeTimelineItem.complexity}</span>
          </div>
        )}

        {/* 2D Solution Space Chart */}
        <ConstraintBoundaryChart
          decision={activeDecision}
          constraints={activeConstraints}
          models={models}
        />

        {/* Candidate Scoring Breakdown */}
        {activeDecision?.candidates && (
          <ScoreBreakdownChart
            candidates={activeDecision.candidates}
            selectedModelId={activeDecision.selected_model_id}
          />
        )}
      </div>

      {/* Dynamic Graph 3: Historical Query Timeline Chart */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
        <QueryTimelineChart timeline={timeline} />
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
    </div>
  );
}
