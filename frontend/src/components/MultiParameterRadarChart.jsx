import React, { useState } from 'react';

/**
 * Multi-Parameter Radar & Decision Breakdown Chart
 * Visualizes model selection across ALL parameters from the problem statement:
 *   1. Latency (Execution Speed)
 *   2. Capability (Reasoning / Logic Quality)
 *   3. Context Length (Token Window)
 *   4. Reliability (Uptime / Stability)
 *   5. Task Suitability (Specialization match)
 *   6. Load Headroom (Current queue capacity)
 */
export default function MultiParameterRadarChart({ decision, constraints, models, activeModelId }) {
  const [comparedModelId, setComparedModelId] = useState(null);

  const selectedId = activeModelId || decision?.selected_model_id || (models && models[0]?.id);
  const selectedModel = models?.find((m) => m.id === selectedId) || models?.[0];
  const comparedModel = comparedModelId ? models?.find((m) => m.id === comparedModelId) : null;

  // Parameters defined from Image 3 of Problem Statement
  const axes = [
    { key: 'latency', label: 'Speed (Latency)', maxVal: 100 },
    { key: 'capability', label: 'Reasoning Capability', maxVal: 10 },
    { key: 'context', label: 'Context Length', maxVal: 32768 },
    { key: 'reliability', label: 'System Reliability', maxVal: 1.0 },
    { key: 'task', label: 'Task Suitability', maxVal: 100 },
    { key: 'headroom', label: 'Load Headroom', maxVal: 10 },
  ];

  // Helper to normalize values between 0.1 and 1.0 for radar plotting
  const getNormalized = (model, axisKey) => {
    if (!model) return 0.2;
    switch (axisKey) {
      case 'latency':
        // Faster latency = higher radar value
        return Math.max(0.15, Math.min(1.0, 1.0 - (model.avg_latency_ms / 6000)));
      case 'capability':
        return Math.max(0.15, model.capability_score / 10);
      case 'context':
        return Math.max(0.15, model.context_length / 32768);
      case 'reliability':
        return Math.max(0.15, (model.reliability - 0.8) / 0.2);
      case 'task':
        return model.task_suitability?.length ? Math.min(1.0, model.task_suitability.length / 5) : 0.5;
      case 'headroom':
        return Math.max(0.15, 1.0 - ((model.current_load || 0) / 10));
      default:
        return 0.5;
    }
  };

  // Helper to get raw human-readable string
  const getRawValue = (model, axisKey) => {
    if (!model) return '—';
    switch (axisKey) {
      case 'latency':
        return `${model.avg_latency_ms}ms avg (max ${model.max_latency_ms}ms)`;
      case 'capability':
        return `${model.capability_score}/10`;
      case 'context':
        return `${(model.context_length / 1024).toFixed(0)}K tokens`;
      case 'reliability':
        return `${(model.reliability * 100).toFixed(0)}%`;
      case 'task':
        return `${model.task_suitability?.slice(0, 3).join(', ')}`;
      case 'headroom':
        return `${10 - (model.current_load || 0)}/10 slots free`;
      default:
        return '—';
    }
  };

  // Radar geometry
  const size = 380;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 130;
  const totalAxes = axes.length;
  const angleSlice = (Math.PI * 2) / totalAxes;

  const getCoordinates = (normValue, index) => {
    const angle = angleSlice * index - Math.PI / 2;
    const r = radius * normValue;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  // Build SVG polygon points string
  const buildPolygonPoints = (model) => {
    return axes
      .map((axis, i) => {
        const norm = getNormalized(model, axis.key);
        const { x, y } = getCoordinates(norm, i);
        return `${x},${y}`;
      })
      .join(' ');
  };

  const selectedPoints = buildPolygonPoints(selectedModel);
  const comparedPoints = comparedModel ? buildPolygonPoints(comparedModel) : null;

  // Candidate status lookup
  const candidateStatus = {};
  decision?.candidates?.forEach((c) => {
    candidateStatus[c.model_id] = c;
  });

  return (
    <div style={{ background: 'rgba(10, 14, 23, 0.85)', borderRadius: '14px', border: '1px solid var(--border-default)', padding: '20px' }}>
      {/* Big Obvious Selection Winner Banner */}
      <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))', border: '1px solid var(--accent-green)', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2rem' }}>🏆</span>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-green)', fontWeight: 800 }}>
              Primary Model Selected by Router
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#ffffff' }}>
              {selectedModel?.name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {selectedModel?.role} • {selectedModel?.download_size}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge badge-green" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            ⚡ {selectedModel?.avg_latency_ms}ms Latency
          </span>
          <span className="badge badge-purple" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            🧠 {selectedModel?.capability_score}/10 Capability
          </span>
          <span className="badge badge-cyan" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            📄 {((selectedModel?.context_length || 4096) / 1024).toFixed(0)}K Context
          </span>
        </div>
      </div>

      {/* Main Grid: Radar on Left, Multi-Parameter Table on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'center' }}>
        {/* Left: 6-Axis Radar / Spider Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', textAlign: 'center' }}>
            🕸️ 6-Parameter Decision Radar (Speed vs Quality vs Capacity)
          </div>

          <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: '360px', height: 'auto', overflow: 'visible' }}>
            <defs>
              <radialGradient id="winnerRadarGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
              </radialGradient>
            </defs>

            {/* Concentric Grid Rings (20%, 40%, 60%, 80%, 100%) */}
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((level) => {
              const r = radius * level;
              const points = axes
                .map((_, i) => {
                  const angle = angleSlice * i - Math.PI / 2;
                  return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
                })
                .join(' ');
              return (
                <polygon
                  key={level}
                  points={points}
                  fill={level === 1.0 ? 'rgba(255, 255, 255, 0.02)' : 'none'}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="1"
                />
              );
            })}

            {/* Axis Spokes from center to edge */}
            {axes.map((axis, i) => {
              const { x, y } = getCoordinates(1.0, i);
              const labelCoord = getCoordinates(1.18, i);
              return (
                <g key={axis.key}>
                  <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1" />
                  <text
                    x={labelCoord.x}
                    y={labelCoord.y + 4}
                    fill="var(--text-secondary)"
                    fontSize="9.5"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}

            {/* Selected Winner Polygon */}
            <polygon
              points={selectedPoints}
              fill="url(#winnerRadarGlow)"
              stroke="var(--accent-green)"
              strokeWidth="2.5"
            />

            {/* Compared Model Polygon (if user toggles comparison) */}
            {comparedPoints && (
              <polygon
                points={comparedPoints}
                fill="rgba(59, 130, 246, 0.15)"
                stroke="var(--accent-blue)"
                strokeWidth="2"
                strokeDasharray="4 2"
              />
            )}

            {/* Plot Vertex Dots on Winner */}
            {axes.map((axis, i) => {
              const norm = getNormalized(selectedModel, axis.key);
              const { x, y } = getCoordinates(norm, i);
              return (
                <circle
                  key={axis.key}
                  cx={x}
                  cy={y}
                  r="4.5"
                  fill="var(--accent-green)"
                  stroke="#0a0e17"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>

          {/* Interactive Model Comparison Switcher */}
          <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', alignSelf: 'center', marginRight: '4px' }}>
              Compare with:
            </span>
            {models?.filter((m) => m.id !== selectedId).map((m) => {
              const isComparing = comparedModelId === m.id;
              return (
                <button
                  key={m.id}
                  className={`btn btn-sm ${isComparing ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.68rem', padding: '3px 8px' }}
                  onClick={() => setComparedModelId(isComparing ? null : m.id)}
                >
                  {isComparing ? `✓ ${m.name}` : `+ ${m.name}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Multi-Parameter Scorecard Table */}
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📋 Parameter-by-Parameter Selection Rationale</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
            Comparing constraints against model capabilities across all prioritized dimensions
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {axes.map((axis) => {
              const selectedVal = getRawValue(selectedModel, axis.key);
              const comparedVal = comparedModel ? getRawValue(comparedModel, axis.key) : null;
              let constraintText = 'None specified';
              let isPassing = true;

              if (axis.key === 'latency' && constraints?.max_latency_ms) {
                constraintText = `Max <= ${constraints.max_latency_ms}ms`;
                isPassing = selectedModel?.max_latency_ms <= constraints.max_latency_ms;
              } else if (axis.key === 'capability' && constraints?.min_capability_score) {
                constraintText = `Min >= ${constraints.min_capability_score}/10`;
                isPassing = selectedModel?.capability_score >= constraints.min_capability_score;
              } else if (axis.key === 'context' && constraints?.required_context_length) {
                constraintText = `Min >= ${constraints.required_context_length} tokens`;
                isPassing = selectedModel?.context_length >= constraints.required_context_length;
              }

              return (
                <div
                  key={axis.key}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>{axis.label}</strong>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      Requirement: <span style={{ color: 'var(--accent-purple)' }}>{constraintText}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: isPassing ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {selectedVal} {isPassing ? '✓' : '✗'}
                    </div>
                    {comparedVal && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--accent-blue)', marginTop: '1px' }}>
                        vs. {comparedModel.name}: {comparedVal}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
