import React from 'react';
import type { Constraints } from '../types';

interface Props {
  constraints: Constraints;
  onChange: (c: Constraints) => void;
}

const PREFERENCE_OPTIONS: { value: Constraints['preference']; label: string }[] = [
  { value: 'lowest_latency', label: 'Lowest Latency / Fastest' },
  { value: 'highest_capability', label: 'Highest Capability' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'cheapest', label: 'Cheapest' },
];

export default function ConstraintSliders({ constraints, onChange }: Props) {
  const set = <K extends keyof Constraints>(key: K, val: Constraints[K]) =>
    onChange({ ...constraints, [key]: val });

  return (
    <div style={styles.wrapper}>
      <div style={styles.field}>
        <label style={styles.label}>Max Latency: {constraints.max_latency_ms}ms</label>
        <input
          type="range"
          min={100}
          max={10000}
          step={100}
          value={constraints.max_latency_ms}
          onChange={(e) => set('max_latency_ms', Number(e.target.value))}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Min Capability: {constraints.min_capability} / 10</label>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={constraints.min_capability}
          onChange={(e) => set('min_capability', Number(e.target.value))}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Preference:</label>
        <select
          value={constraints.preference}
          onChange={(e) => set('preference', e.target.value as any)}
          style={styles.select}
        >
          {PREFERENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: '#444',
  },
  select: {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 12,
  },
};
