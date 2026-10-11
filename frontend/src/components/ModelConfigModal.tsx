import React, { useState } from 'react';
import type { ModelInfo } from '../types';
import { patchModel } from '../api';

interface Props {
  model: ModelInfo;
  onClose: () => void;
  onSaveSuccess: (updated: ModelInfo) => void;
}

export default function ModelConfigModal({ model, onClose, onSaveSuccess }: Props) {
  const [avgLatency, setAvgLatency] = useState(model.avg_latency_ms);
  const [maxLatency, setMaxLatency] = useState(model.max_latency_ms);
  const [capability, setCapability] = useState(model.capability_score);
  const [contextLength, setContextLength] = useState(model.context_length);
  const [reliability, setReliability] = useState(model.reliability);
  const [availability, setAvailability] = useState(model.availability);
  const [enabled, setEnabled] = useState(model.enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await patchModel(model.model_key, {
        avg_latency_ms: Number(avgLatency),
        max_latency_ms: Number(maxLatency),
        capability_score: Number(capability),
        context_length: Number(contextLength),
        reliability: Number(reliability),
        availability: Boolean(availability),
        enabled: Boolean(enabled),
      });
      onSaveSuccess(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update model configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={styles.titleRow}>
              <span style={styles.title}>{model.name}</span>
              <span style={{
                ...styles.badge,
                background: (availability && enabled) ? '#e6f4ea' : '#fce8e6',
                color: (availability && enabled) ? '#137333' : '#c5221f',
              }}>
                {(availability && enabled) ? 'ACTIVE' : 'OFFLINE/DISABLED'}
              </span>
            </div>
            <div style={styles.roleText}>{model.role}</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Content Body */}
        <div style={styles.body}>
          {/* Latency Comparison Info Box */}
          <div style={styles.infoBox}>
            <div style={styles.infoRow}>
              <span>Actual Measured Latency:</span>
              <strong style={{ color: '#1a1a1a' }}>{model.measured_latency_ms}ms</strong>
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>
              * Measured from latest inference execution. The parameters below are judge-configurable estimates.
            </div>
          </div>

          {/* Form Fields */}
          <div style={styles.formGrid}>
            <div style={styles.field}>
              <label style={styles.label}>
                Configured Average Latency (avg_latency_ms)
                <span style={styles.hint}>Used to rank candidates</span>
              </label>
              <div style={styles.inputGroup}>
                <input
                  type="number"
                  min="50"
                  max="20000"
                  step="50"
                  value={avgLatency}
                  onChange={(e) => setAvgLatency(Number(e.target.value))}
                  style={styles.input}
                />
                <span style={styles.unit}>ms</span>
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Max Latency Deadline Bound (max_latency_ms)
                <span style={styles.hint}>Rejects candidate if request budget is exceeded</span>
              </label>
              <div style={styles.inputGroup}>
                <input
                  type="number"
                  min="100"
                  max="30000"
                  step="100"
                  value={maxLatency}
                  onChange={(e) => setMaxLatency(Number(e.target.value))}
                  style={styles.input}
                />
                <span style={styles.unit}>ms</span>
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Capability Rating (1.0 - 10.0)
                <span style={styles.hint}>Score used for quality and reasoning matching</span>
              </label>
              <input
                type="number"
                min="1.0"
                max="10.0"
                step="0.1"
                value={capability}
                onChange={(e) => setCapability(Number(e.target.value))}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Context Length Capacity
                <span style={styles.hint}>Total context window tokens</span>
              </label>
              <input
                type="number"
                min="1024"
                max="262144"
                step="1024"
                value={contextLength}
                onChange={(e) => setContextLength(Number(e.target.value))}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Reliability Score (0.0 - 1.0)
                <span style={styles.hint}>Historical stability factor</span>
              </label>
              <input
                type="number"
                min="0.0"
                max="1.0"
                step="0.01"
                value={reliability}
                onChange={(e) => setReliability(Number(e.target.value))}
                style={styles.input}
              />
            </div>

            <div style={styles.togglesRow}>
              <label style={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={availability}
                  onChange={(e) => setAvailability(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>Online Availability (Online/Offline)</span>
              </label>

              <label style={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>Routing Enabled</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Persisting...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)',
  },
  modal: {
    background: '#ffffff',
    width: '90%',
    maxWidth: 540,
    borderRadius: 12,
    boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid #e0e0e0',
  },
  header: {
    padding: '18px 24px',
    borderBottom: '1px solid #eee',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    color: '#1a1a1a',
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    letterSpacing: '0.04em',
  },
  roleText: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 16,
    color: '#999',
    cursor: 'pointer',
    padding: 4,
  },
  errorBox: {
    background: '#fce8e6',
    color: '#c5221f',
    padding: '10px 24px',
    fontSize: 13,
    borderBottom: '1px solid #f5c2c0',
  },
  body: {
    padding: '20px 24px',
    maxHeight: '65vh',
    overflowY: 'auto',
  },
  infoBox: {
    background: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: 8,
    padding: '12px 14px',
    marginBottom: 16,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#555',
  },
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#333',
    display: 'flex',
    flexDirection: 'column',
  },
  hint: {
    fontSize: 11,
    color: '#888',
    fontWeight: 400,
    marginTop: 2,
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 14,
    color: '#1a1a1a',
    width: '100%',
    outline: 'none',
  },
  unit: {
    fontSize: 13,
    color: '#777',
    fontWeight: 500,
  },
  togglesRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingTop: 8,
    borderTop: '1px solid #eee',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
    color: '#333',
    cursor: 'pointer',
  },
  checkbox: {
    width: 16,
    height: 16,
    cursor: 'pointer',
  },
  footer: {
    padding: '14px 24px',
    borderTop: '1px solid #eee',
    background: '#fcfcfc',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid #ccc',
    background: '#fff',
    color: '#444',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 18px',
    borderRadius: 6,
    border: 'none',
    background: '#1a1a1a',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
