import React, { useState } from 'react';

/**
 * Historical Query Performance & SLA Compliance Timeline Chart
 * Dynamically plots queries in order of arrival, showing:
 *   - Actual Latency (colored bars by model)
 *   - User Max Latency Budget (dashed line / ceiling)
 *   - Failover and Fallback Recovery tags
 */
export default function QueryTimelineChart({ timeline }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!timeline || timeline.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
        No historical query telemetry yet. Send requests through the Inference Gateway to generate dynamic timeline points.
      </div>
    );
  }

  const width = 640;
  const height = 240;
  const padLeft = 55;
  const padRight = 20;
  const padTop = 30;
  const padBottom = 45;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = Math.max(
    ...timeline.map((t) => Math.max(t.latency_ms || 0, t.max_latency_constraint || 0, 3000)),
    5000
  );

  const scaleY = (val) => {
    const clamped = Math.max(0, Math.min(val, maxVal));
    return padTop + chartH - (clamped / maxVal) * chartH;
  };

  const barCount = timeline.length;
  const barSlotW = chartW / barCount;
  const barWidth = Math.min(24, Math.max(12, barSlotW * 0.6));

  const modelColors = {
    'qwen3.5-2b': '#06b6d4',
    'qwen3.5-4b': '#3b82f6',
    'deepseek-r1-7b': '#8b5cf6',
    'phi-4-mini-3.8b': '#10b981',
    'qwen3.5-9b': '#f59e0b',
  };

  return (
    <div style={{ position: 'relative', width: '100%', background: 'rgba(10, 14, 23, 0.7)', borderRadius: '12px', border: '1px solid var(--border-default)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📈 Query Sequence Performance & SLA Compliance Trend</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            Telemetry of consecutive requests. Bars represent actual response time vs user SLA limit.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', fontSize: '0.7rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#06b6d4' }}>● Qwen 2B</span>
          <span style={{ color: '#3b82f6' }}>● Qwen 4B</span>
          <span style={{ color: '#8b5cf6' }}>● DeepSeek-R1</span>
          <span style={{ color: '#10b981' }}>● Phi-4-mini</span>
          <span style={{ color: '#f59e0b' }}>● Qwen 9B</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {/* Horizontal Grid lines */}
        {[1000, 3000, 6000, 9000].filter((v) => v <= maxVal).map((v) => {
          const y = scaleY(v);
          return (
            <g key={v}>
              <line x1={padLeft} y1={y} x2={padLeft + chartW} y2={y} stroke="rgba(255, 255, 255, 0.05)" strokeDasharray="3 3" />
              <text x={padLeft - 8} y={y + 3} fill="var(--text-muted)" fontSize="9" textAnchor="end">
                {v}ms
              </text>
            </g>
          );
        })}

        {/* Render Bars and Constraint Markers */}
        {timeline.map((item, idx) => {
          const slotCenter = padLeft + idx * barSlotW + barSlotW / 2;
          const barH = (item.latency_ms / maxVal) * chartH;
          const barY = padTop + chartH - barH;
          const barX = slotCenter - barWidth / 2;
          const color = modelColors[item.model] || 'var(--accent-blue)';
          const isHovered = hoveredIndex === idx;

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Highlight Column on Hover */}
              {isHovered && (
                <rect
                  x={slotCenter - barSlotW / 2}
                  y={padTop}
                  width={barSlotW}
                  height={chartH}
                  fill="rgba(255, 255, 255, 0.04)"
                  rx="4"
                />
              )}

              {/* Latency Bar */}
              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={Math.max(2, barH)}
                fill={item.success ? color : '#ef4444'}
                rx="4"
                opacity={isHovered ? 1 : 0.85}
              />

              {/* SLA Ceiling marker if constraint was specified */}
              {item.max_latency_constraint && (
                <line
                  x1={barX - 4}
                  y1={scaleY(item.max_latency_constraint)}
                  x2={barX + barWidth + 4}
                  y2={scaleY(item.max_latency_constraint)}
                  stroke="#ef4444"
                  strokeWidth="2.5"
                  strokeDasharray="2 1"
                />
              )}

              {/* Fallback recovery badge indicator */}
              {item.fallback_used && (
                <text
                  x={slotCenter}
                  y={barY - 6}
                  fill="var(--accent-amber)"
                  fontSize="10"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  🔄
                </text>
              )}

              {/* X-axis Label */}
              <text
                x={slotCenter}
                y={padTop + chartH + 16}
                fill={isHovered ? 'var(--text-primary)' : 'var(--text-tertiary)'}
                fontSize="9"
                textAnchor="middle"
                fontWeight={isHovered ? '700' : '400'}
              >
                #{item.request_id}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover Info Tooltip */}
      {hoveredIndex !== null && timeline[hoveredIndex] && (
        <div style={{ position: 'absolute', top: '16px', right: '20px', background: 'rgba(15, 23, 42, 0.96)', border: '1px solid var(--border-accent)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>
          <strong style={{ color: modelColors[timeline[hoveredIndex].model] || 'var(--text-primary)' }}>
            #{timeline[hoveredIndex].request_id} ➔ {timeline[hoveredIndex].model}
          </strong>
          <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
            Latency: <strong>{timeline[hoveredIndex].latency_ms}ms</strong>
            {timeline[hoveredIndex].max_latency_constraint && ` (Budget SLA: ${timeline[hoveredIndex].max_latency_constraint}ms)`}
          </div>
          <div style={{ color: 'var(--text-tertiary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{timeline[hoveredIndex].prompt}"
          </div>
          {timeline[hoveredIndex].fallback_used && (
            <div style={{ color: 'var(--accent-amber)', marginTop: '2px', fontWeight: 600 }}>
              🔄 Constraint-preserving fallback engaged
            </div>
          )}
        </div>
      )}
    </div>
  );
}
