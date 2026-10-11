import React from 'react';
import type { ModelInfo } from '../types';
import { patchModel } from '../api';

interface Props {
  models: ModelInfo[];
  onModelsChange: (models: ModelInfo[]) => void;
}

export default function ModelToggles({ models, onModelsChange }: Props) {
  const handleToggle = async (model: ModelInfo) => {
    const next = !model.availability;
    onModelsChange(models.map((m) => (m.model_key === model.model_key ? { ...m, availability: next, available: next } : m)));
    try {
      await patchModel(model.model_key, { availability: next });
    } catch {
      onModelsChange(models);
    }
  };

  return (
    <div style={styles.list}>
      {models.map((m) => (
        <div key={m.model_key} style={styles.item}>
          <span style={{
            ...styles.dot,
            background: (m.availability && m.enabled) ? '#16a34a' : '#dc2626',
          }} />
          <span style={styles.name}>{m.name}</span>
          <button
            type="button"
            onClick={() => handleToggle(m)}
            style={styles.btn}
          >
            {(m.availability && m.enabled) ? 'Active' : 'Offline'}
          </button>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  name: {
    flex: 1,
    color: '#333',
  },
  btn: {
    padding: '3px 8px',
    borderRadius: 4,
    border: '1px solid #ddd',
    background: '#fff',
    fontSize: 11,
    cursor: 'pointer',
  },
};
