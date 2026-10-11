import React, { useState } from 'react';

/**
 * 2D Constraint Boundary & Solution Space Chart
 * Plots models on a coordinate plane:
 *   X-axis: Latency (0ms to 10,000ms)
 *   Y-axis: Capability Score (1 to 10)
 *
 * Dynamically renders:
 *   - User's Max Latency SLA boundary line (Red vertical dashed line)
 *   - User's Min Capability requirement line (Purple horizontal dashed line)
 *   - Shaded "Feasible Solution Space" (Valid SLA zone)
 *   - Glowing interactive nodes for all models:
 *       • Green/Gold glowing node: Selected Winner
 *       • Cyan/Blue node: Eligible candidate
 *       • Red/Muted node: Disqualified candidate
 */
export default function ConstraintBoundaryChart({ decision, constraints, models }) {
  const [hoveredModel, setHoveredModel] = useState(null);

  // SVG Dimensions
  const width = 640;
  const height = 300;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 45;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Domain Scales
  const maxLatDomain = 10000; // 0 to 10000ms
  const minCapDomain = 1;
  const maxCapDomain = 10;

  const scaleX = (latency) => {
    const clamped = Math.max(0, Math.min(latency, maxLatDomain));
    return padLeft + (clamped / maxLatDomain) * chartW;
  };

  const scaleY = (capability) => {
    const clamped = Math.max(minCapDomain, Math.min(capability, maxCapDomain));
    const normalized = (clamped - minCapDomain) / (maxCapDomain - minCapDomain);
    return padTop + chartH - normalized * chartH;
  };

  const maxLatConstraint = constraints?.max_latency_ms;
  const minCapConstraint = constraints?.min_capability_score;

  // Feasible region coordinates
  const feasibleX = maxLatConstraint ? scaleX(maxLatConstraint) : padLeft + chartW;
  const feasibleY = minCapConstraint ? scaleY(minCapConstraint) : padTop;
  const feasibleW = Math.max(0, feasibleX - padLeft);
  const feasibleH = Math.max(0, (padTop + chartH) - feasibleY);

  const selectedId = decision?.selected_model_id;

  // Merge candidate status if available
  const candidateStatus = {};
  decision?.candidates?.forEach((c) => {
    candidateStatus[c.model_id] = c;
  });

  return (
    <div style={{ position: 'relative', width: '100%', background: 'rgba(10, 14, 23, 0.7)', borderRadius: '12px', border: '1px solid var(--border-default)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📐 Dynamic Constraint Boundary & Feasible Solution Space</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            Models plotted by Latency vs Capability. Green quadrant indicates SLA-compliant zone.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} />
            Primary Pick
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)', display: 'inline-block' }} />
            Valid Fallback
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-red)', display: 'inline-block' }} />
            Violates Constraint
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id="winnerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="feasibleGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Chart Background Grid Lines */}
        {[2000, 4000, 6000, 8000, 10000].map((lat) => {
          const x = scaleX(lat);
          return (
            <g key={lat}>
              <line x1={x} y1={padTop} x2={x} y2={padTop + chartH} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
              <text x={x} y={padTop + chartH + 18} fill="var(--text-muted)" fontSize="10" textAnchor="middle">
                {lat}ms
              </text>
            </g>
          );
        })}

        {[2, 4, 6, 8, 10].map((cap) => {
          const y = scaleY(cap);
          return (
            <g key={cap}>
              <line x1={padLeft} y1={y} x2={padLeft + chartW} y2={y} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
              <text x={padLeft - 12} y={y + 3} fill="var(--text-muted)" fontSize="10" textAnchor="end">
                {cap}
              </text>
            </g>
          );
        })}

        {/* Feasible Solution Space Quadrant */}
        <rect
          x={padLeft}
          y={feasibleY}
          width={feasibleW}
          height={feasibleH}
          fill="url(#feasibleGrad)"
          stroke="rgba(16, 185, 129, 0.3)"
          strokeDasharray="4 2"
          rx="4"
        />

        {/* Max Latency SLA Boundary Line */}
        {maxLatConstraint && (
          <g>
            <line
              x1={scaleX(maxLatConstraint)}
              y1={padTop - 8}
              x2={scaleX(maxLatConstraint)}
              y2={padTop + chartH}
              stroke="var(--accent-red)"
              strokeWidth="2"
              strokeDasharray="5 3"
            />
            <text
              x={scaleX(maxLatConstraint) - 6}
              y={padTop + 12}
              fill="var(--accent-red)"
              fontSize="9"
              fontWeight="700"
              textAnchor="end"
            >
              MAX LATENCY SLA: {maxLatConstraint}ms
            </text>
          </g>
        )}

        {/* Min Capability Requirement Line */}
        {minCapConstraint && (
          <g>
            <line
              x1={padLeft}
              y1={scaleY(minCapConstraint)}
              x2={padLeft + chartW + 8}
              y2={scaleY(minCapConstraint)}
              stroke="var(--accent-purple)"
              strokeWidth="2"
              strokeDasharray="5 3"
            />
            <text
              x={padLeft + chartW - 6}
              y={scaleY(minCapConstraint) - 6}
              fill="var(--accent-purple)"
              fontSize="9"
              fontWeight="700"
              textAnchor="end"
            >
              MIN CAPABILITY: {minCapConstraint}/10
            </text>
          </g>
        )}

        {/* Axis Labels */}
        <text x={padLeft + chartW / 2} y={height - 6} fill="var(--text-secondary)" fontSize="11" fontWeight="600" textAnchor="middle">
          Latency Budget SLA (Worst-Case Milliseconds) ➔
        </text>
        <text
          x={14}
          y={padTop + chartH / 2}
          fill="var(--text-secondary)"
          fontSize="11"
          fontWeight="600"
          textAnchor="middle"
          transform={`rotate(-90, 14, ${padTop + chartH / 2})`}
        >
          Model Capability Score (1-10) ➔
        </text>

        {/* Plot Model Nodes */}
        {models?.map((m) => {
          const cx = scaleX(m.avg_latency_ms);
          const cy = scaleY(m.capability_score);
          const isWinner = m.id === selectedId;
          const cand = candidateStatus[m.id];
          const isEligible = cand ? cand.eligible : (
            (!maxLatConstraint || m.max_latency_ms <= maxLatConstraint) &&
            (!minCapConstraint || m.capability_score >= minCapConstraint) &&
            m.available !== false && m.enabled !== false
          );

          return (
            <g
              key={m.id}
              style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
              onMouseEnter={() => setHoveredModel(m)}
              onMouseLeave={() => setHoveredModel(null)}
            >
              {/* Winner Pulsing Halo */}
              {isWinner && (
                <>
                  <circle cx={cx} cy={cy} r="22" fill="url(#winnerGlow)" opacity="0.6" />
                  <circle cx={cx} cy={cy} r="14" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeDasharray="3 2" />
                </>
              )}

              {/* Node Circle */}
              <circle
                cx={cx}
                cy={cy}
                r={isWinner ? 9 : 7}
                fill={isWinner ? '#10b981' : isEligible ? '#06b6d4' : '#ef4444'}
                stroke="#0a0e17"
                strokeWidth="2.5"
              />

              {/* Node Icon or Marker */}
              <text
                x={cx}
                y={cy + 3.5}
                fill="#ffffff"
                fontSize={isWinner ? "9" : "8"}
                fontWeight="800"
                textAnchor="middle"
              >
                {isWinner ? "★" : isEligible ? "✓" : "✕"}
              </text>

              {/* Model Label */}
              <text
                x={cx}
                y={cy - 12}
                fill={isWinner ? '#10b981' : isEligible ? '#f1f5f9' : '#64748b'}
                fontSize="10"
                fontWeight={isWinner ? "700" : "500"}
                textAnchor="middle"
              >
                {m.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover Info Tooltip */}
      {hoveredModel && (
        <div style={{ position: 'absolute', bottom: '16px', right: '20px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--border-accent)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
          <strong style={{ color: hoveredModel.id === selectedId ? 'var(--accent-green)' : 'var(--accent-cyan)' }}>
            {hoveredModel.name} {hoveredModel.id === selectedId && '🏆 (Selected Winner)'}
          </strong>
          <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
            Latency: {hoveredModel.avg_latency_ms}ms avg (max {hoveredModel.max_latency_ms}ms)
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            Capability: {hoveredModel.capability_score}/10 • Context: {(hoveredModel.context_length / 1024).toFixed(0)}K
          </div>
        </div>
      )}
    </div>
  );
}
