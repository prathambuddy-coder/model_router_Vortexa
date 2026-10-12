import React from 'react';
import type { Decision } from '../types';

/** Classifies a rejection reason into the constraint that eliminated the model. */
function violationTags(reason: string): string[] {
  const r = reason.toLowerCase();
  const tags: string[] = [];
  if (r.startsWith('runtime failure')) {
    if (r.includes('cooling down')) return ['cooldown'];
    if (r.includes('timeout') || r.includes('did not finish')) return ['timeout'];
    if (r.includes('429')) return ['rate-limited'];
    return ['runtime error'];
  }
  if (r.includes('latency')) tags.push('latency');
  if (r.includes('capability')) tags.push('capability');
  if (r.includes('cost')) tags.push('cost');
  if (r.includes('context')) tags.push('context');
  if (r.includes('offline') || r.includes('disabled')) tags.push('unavailable');
  if (r.includes('cannot read images')) tags.push('no vision');
  return tags.length ? tags : ['constraint'];
}

/** Compact per-model pass/fail list showing why the router picked or rejected each model. */
export default function RoutingVerdict({ decision }: { decision?: Decision }) {
  const candidates = decision?.candidates;
  if (!candidates || candidates.length === 0) return null;

  const applied = (decision as any).effective_constraints as Record<string, any> | undefined;
  const chips: string[] = [];
  if (applied) {
    if (applied.max_latency_ms) chips.push(`≤ ${applied.max_latency_ms}ms`);
    if (applied.max_cost_per_1k_tokens) chips.push(`≤ $${applied.max_cost_per_1k_tokens}/1K`);
    else if (applied.max_cost_per_token) chips.push(`≤ $${applied.max_cost_per_token}/tok`);
    if (applied.min_capability) chips.push(`cap ≥ ${applied.min_capability}`);
    if (applied.min_context_length) chips.push(`ctx ≥ ${Number(applied.min_context_length).toLocaleString()}`);
    if (applied.preference) chips.push(String(applied.preference).replace(/_/g, ' '));
  }

  return (
    <div style={styles.box}>
      {chips.length > 0 && (
        <div style={styles.chipRow}>
          {chips.map((c) => (
            <span key={c} style={styles.chip}>{c}</span>
          ))}
        </div>
      )}
      {candidates.map((c) => {
        const rejected = c.status === 'rejected';
        const selected = c.model_key === decision?.selected || c.status === 'selected';
        return (
          <div key={c.model_key} style={styles.row} title={c.rejection_reason || c.decision_reason || ''}>
            <span style={{ width: 18 }}>{rejected ? '❌' : selected ? '✅' : '☑️'}</span>
            <span style={{ ...styles.name, color: selected ? '#8ab4f8' : rejected ? '#9aa0a6' : '#e8eaed' }}>
              {c.name}
            </span>
            {rejected ? (
              <span style={styles.reason}>
                {violationTags(c.rejection_reason || '').map((t) => (
                  <span key={t} style={styles.tag}>{t}</span>
                ))}
                <span style={styles.reasonText}>{c.rejection_reason}</span>
              </span>
            ) : (
              <span style={styles.reasonText}>{selected ? 'selected' : 'passed · lower rank'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    marginTop: 8,
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    maxWidth: '100%',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  chip: {
    fontSize: 10,
    color: '#8ab4f8',
    background: 'rgba(138,180,248,0.1)',
    borderRadius: 6,
    padding: '2px 6px',
  },
  row: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 },
  name: { fontWeight: 500, whiteSpace: 'nowrap' },
  reason: { display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0, flexWrap: 'wrap' },
  tag: {
    fontSize: 10,
    color: '#fca5a5',
    background: 'rgba(239,68,68,0.12)',
    borderRadius: 4,
    padding: '1px 5px',
  },
  reasonText: { color: '#71717a', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' },
};
