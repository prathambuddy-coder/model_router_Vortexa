import React from 'react';
import type { ModelInfo } from '../types';

interface Props {
  models: ModelInfo[];
}

export default function TokenCapacityChart({ models }: Props) {
  if (!models || models.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={{ margin: 0, fontSize: 12, color: '#999' }}>No models available.</p>
      </div>
    );
  }

  // Maximum reference context length for scaling (131,072 tokens = 128K)
  const maxTokensRef = 131072;

  const formatTokens = (num: number) => {
    if (num >= 1000) {
      return `${Math.round(num / 1024)}K`;
    }
    return `${num}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.subhead}>
        <span>Context window token capacity per model</span>
        <span style={styles.subheadMax}>Max: 128K</span>
      </div>

      <div style={styles.chartList}>
        {models.map((m) => {
          const tokens = m.context_length || 32768;
          const percentage = Math.min(100, Math.max(12, (tokens / maxTokensRef) * 100));
          const isOnline = m.availability && m.enabled;

          // Color coded based on capacity tier
          const barColor = !isOnline
            ? '#d1d5db'
            : tokens >= 100000
            ? '#2563eb'
            : tokens >= 60000
            ? '#0891b2'
            : '#4f46e5';

          return (
            <div key={m.model_key} style={styles.row}>
              {/* Top info */}
              <div style={styles.modelHeader}>
                <div style={styles.nameGroup}>
                  <span
                    style={{
                      ...styles.dot,
                      background: isOnline ? '#16a34a' : '#dc2626',
                    }}
                  />
                  <span style={styles.modelName}>{m.name}</span>
                </div>
                <div style={styles.tokenValues}>
                  <strong style={styles.tokenCount}>{tokens.toLocaleString()}</strong>
                  <span style={styles.tokenTag}>({formatTokens(tokens)})</span>
                </div>
              </div>

              {/* Graphical Bar */}
              <div style={styles.barTrack}>
                <div
                  style={{
                    ...styles.barFill,
                    width: `${percentage}%`,
                    background: barColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: '#4f46e5' }} />
          <span>32K (Standard)</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: '#0891b2' }} />
          <span>64K (Extended)</span>
        </div>
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: '#2563eb' }} />
          <span>128K (Ultra-long)</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  empty: {
    padding: '16px 0',
    textAlign: 'center',
  },
  subhead: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#777',
    marginBottom: 2,
  },
  subheadMax: {
    fontWeight: 600,
    color: '#555',
  },
  chartList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    padding: '8px 10px',
    borderRadius: 6,
    background: '#fafafa',
    border: '1px solid #f0f0f0',
  },
  modelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  modelName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#222',
  },
  tokenValues: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  tokenCount: {
    fontSize: 12,
    color: '#1a1a1a',
    fontFamily: 'monospace',
  },
  tokenTag: {
    fontSize: 11,
    color: '#666',
    fontWeight: 500,
  },
  barTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    background: '#e5e7eb',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.4s ease',
  },
  legend: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: '#888',
    paddingTop: 4,
    borderTop: '1px solid #f0f0f0',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 2,
  },
};
