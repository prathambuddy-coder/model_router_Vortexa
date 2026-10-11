import React from 'react';
import type { Decision } from '../types';

interface Props {
  decision: Decision | null;
}

export default function ExplainabilityBox({ decision }: Props) {
  if (!decision) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>🔍</div>
        <p style={styles.emptyText}>Send a prompt to see the model decision and reason.</p>
      </div>
    );
  }

  const { complexity, candidates = [], selected, explanation, status, message } = decision;
  const isNoValid = status === 'NO_VALID_MODEL' || !selected;

  return (
    <div style={styles.container}>
      {/* 1. Winner / Outcome Banner */}
      {isNoValid ? (
        <div style={styles.noValidBanner}>
          <div style={styles.bannerHeader}>
            <span style={styles.statusEmoji}>❌</span>
            <strong>NO VALID MODEL</strong>
          </div>
          <div style={styles.bannerText}>
            {message || 'No model satisfied prompt constraints.'}
          </div>
        </div>
      ) : (
        <div style={styles.winnerBanner}>
          <div style={styles.bannerHeader}>
            <span style={styles.statusEmoji}>✅</span>
            <strong>Selected: {decision.selected_name || selected}</strong>
          </div>
          <div style={styles.bannerText}>{explanation}</div>
        </div>
      )}

      {/* 2. Prompt Complexity Indicator */}
      {complexity && (
        <div style={styles.complexityCard}>
          <div style={styles.complexityRow}>
            <span style={styles.cardLabel}>Prompt Complexity:</span>
            <span style={{
              ...styles.badge,
              background: complexity.score >= 8 ? '#fee2e2' : complexity.score >= 5 ? '#fef3c7' : '#dcfce7',
              color: complexity.score >= 8 ? '#b91c1c' : complexity.score >= 5 ? '#b45309' : '#15803d',
            }}>
              {complexity.label} ({complexity.score}/10)
            </span>
          </div>
          {complexity.matched_keywords && complexity.matched_keywords.length > 0 && (
            <div style={styles.kwRow}>
              <span>Key factors:</span>
              <span style={styles.kwTags}>{complexity.matched_keywords.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* 3. Models Comparison List */}
      <div style={styles.modelsSection}>
        <div style={styles.modelsHeader}>
          <span>Model Evaluation ({candidates.length})</span>
        </div>

        <div style={styles.modelsList}>
          {candidates.map((c) => {
            const isWinner = c.status === 'selected' || c.model_key === selected;
            const isRejected = c.status === 'rejected';

            return (
              <div
                key={c.model_key || c.name}
                style={{
                  ...styles.modelCard,
                  borderColor: isWinner ? '#86efac' : isRejected ? '#fecaca' : '#e5e7eb',
                  background: isWinner ? '#f0fdf4' : isRejected ? '#fffafa' : '#ffffff',
                }}
              >
                <div style={styles.cardTop}>
                  <div style={styles.modelTitleRow}>
                    <span style={styles.modelStatusIcon}>
                      {isWinner ? '✅' : isRejected ? '❌' : '⚪'}
                    </span>
                    <strong style={styles.modelTitle}>{c.name}</strong>
                  </div>

                  <span
                    style={{
                      ...styles.pill,
                      background: isWinner ? '#dcfce7' : isRejected ? '#fee2e2' : '#f3f4f6',
                      color: isWinner ? '#15803d' : isRejected ? '#b91c1c' : '#4b5563',
                    }}
                  >
                    {isWinner ? 'Selected' : isRejected ? 'Rejected' : 'Passed'}
                  </span>
                </div>

                {/* Compact Spec Metrics */}
                <div style={styles.metricRow}>
                  <span>Est: <strong>{c.avg_latency_ms}ms</strong></span>
                  <span>Cap: <strong>{c.capability_score}/10</strong></span>
                  <span>Limit: <strong>{c.max_latency_ms}ms</strong></span>
                </div>

                {/* Reason */}
                {isRejected && c.rejection_reason && (
                  <div style={styles.rejectionBox}>
                    {c.rejection_reason}
                  </div>
                )}
              </div>
            );
          })}
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
    padding: '24px 0',
    textAlign: 'center',
    color: '#888',
  },
  emptyIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
  },
  winnerBanner: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    padding: '10px 12px',
  },
  noValidBanner: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '10px 12px',
  },
  bannerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: '#1a1a1a',
    marginBottom: 3,
  },
  statusEmoji: {
    fontSize: 13,
  },
  bannerText: {
    fontSize: 12,
    color: '#444',
    lineHeight: 1.4,
  },
  complexityCard: {
    background: '#fafafa',
    border: '1px solid #eee',
    borderRadius: 6,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  complexityRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 12,
    color: '#555',
    fontWeight: 500,
  },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 4,
  },
  kwRow: {
    display: 'flex',
    gap: 6,
    fontSize: 11,
    color: '#777',
  },
  kwTags: {
    color: '#333',
    fontWeight: 500,
  },
  modelsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  modelsHeader: {
    fontSize: 12,
    fontWeight: 700,
    color: '#444',
  },
  modelsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
  modelCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  modelStatusIcon: {
    fontSize: 12,
  },
  modelTitle: {
    fontSize: 12,
    color: '#1a1a1a',
  },
  pill: {
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 4,
  },
  metricRow: {
    display: 'flex',
    gap: 12,
    fontSize: 11,
    color: '#666',
  },
  rejectionBox: {
    fontSize: 11,
    color: '#b91c1c',
    background: '#fef2f2',
    padding: '4px 7px',
    borderRadius: 4,
    border: '1px solid #fee2e2',
    lineHeight: 1.3,
  },
};
