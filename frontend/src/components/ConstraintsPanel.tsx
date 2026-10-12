import React from 'react';

/**
 * Hard routing constraints a judge can set per request.
 * Empty fields are omitted so the backend falls back to its inferred defaults.
 */
export interface ConstraintForm {
  max_latency_ms: string;
  max_cost_per_1k_tokens: string;
  min_capability: string;
  min_context_length: string;
  preference: string;
}

export const EMPTY_CONSTRAINTS: ConstraintForm = {
  max_latency_ms: '',
  max_cost_per_1k_tokens: '',
  min_capability: '',
  min_context_length: '',
  preference: '',
};

const PREFERENCES = [
  { value: '', label: 'Auto (inferred)' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'lowest_latency', label: 'Lowest latency' },
  { value: 'cheapest', label: 'Lowest cost' },
  { value: 'highest_capability', label: 'Highest capability' },
  { value: 'coding_specialist', label: 'Coding specialist' },
  { value: 'multimodal_specialist', label: 'Multimodal specialist' },
];

/** Converts the form into the backend constraint payload, dropping unset fields. */
export function toConstraintPayload(form: ConstraintForm): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  const num = (v: string) => {
    const n = parseFloat(v.trim().replace(/k$/i, ''));
    return Number.isFinite(n) && n > 0 ? n * (/k$/i.test(v.trim()) ? 1000 : 1) : null;
  };
  const lat = num(form.max_latency_ms);
  const cost = num(form.max_cost_per_1k_tokens);
  const cap = num(form.min_capability);
  const ctx = num(form.min_context_length);
  if (lat !== null) out.max_latency_ms = Math.round(lat);
  if (cost !== null) out.max_cost_per_1k_tokens = cost;
  if (cap !== null) out.min_capability = Math.min(10, Math.max(1, cap));
  if (ctx !== null) out.min_context_length = Math.round(ctx);
  if (form.preference) out.preference = form.preference;
  return out;
}

export function activeConstraintCount(form: ConstraintForm): number {
  return Object.keys(toConstraintPayload(form)).length;
}

interface Props {
  value: ConstraintForm;
  onChange: (next: ConstraintForm) => void;
  onClose: () => void;
}

export default function ConstraintsPanel({ value, onChange, onClose }: Props) {
  const set = (k: keyof ConstraintForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });

  const field = (k: keyof ConstraintForm, label: string, placeholder: string, unit: string) => (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <div style={styles.inputWrap}>
        <input
          style={styles.input}
          value={value[k]}
          onChange={set(k)}
          placeholder={placeholder}
          inputMode="decimal"
        />
        <span style={styles.unit}>{unit}</span>
      </div>
    </label>
  );

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Hard constraints</span>
        <span style={styles.hint}>Blank = not enforced</span>
        <div style={{ flex: 1 }} />
        <button style={styles.linkBtn} onClick={() => onChange(EMPTY_CONSTRAINTS)}>Clear</button>
        <button style={styles.linkBtn} onClick={onClose} aria-label="Close constraints">✕</button>
      </div>
      <div style={styles.grid}>
        {field('max_latency_ms', 'Max latency', '3000', 'ms')}
        {field('max_cost_per_1k_tokens', 'Max cost', '0.0005', '$ / 1K tok')}
        {field('min_capability', 'Min capability', '8', '/ 10')}
        {field('min_context_length', 'Min context', '64K', 'tokens')}
        <label style={styles.field}>
          <span style={styles.label}>Preference</span>
          <select style={styles.select} value={value.preference} onChange={set('preference')}>
            {PREFERENCES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: '100%',
    background: 'rgba(30, 31, 36, 0.96)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '12px 14px',
    marginBottom: 8,
    boxSizing: 'border-box',
  },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { color: '#e8eaed', fontSize: 13, fontWeight: 600 },
  hint: { color: '#9aa0a6', fontSize: 11 },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#8ab4f8',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 4px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 10,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  label: { color: '#9aa0a6', fontSize: 11, fontWeight: 500 },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    padding: '0 8px',
  },
  input: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#f5f5f5',
    fontSize: 13,
    padding: '7px 0',
  },
  unit: { color: '#71717a', fontSize: 10, whiteSpace: 'nowrap', marginLeft: 4 },
  select: {
    background: '#27272a',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    color: '#f5f5f5',
    fontSize: 13,
    padding: '7px 6px',
    outline: 'none',
  },
};
