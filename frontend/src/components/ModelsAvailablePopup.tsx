import React, { useState } from 'react';
import type { ModelInfo } from '../types';
import ModelConfigModal from './ModelConfigModal';

interface Props {
  models: ModelInfo[];
  onModelsChange: (models: ModelInfo[]) => void;
}

export default function ModelsAvailablePopup({ models, onModelsChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelInfo | null>(null);

  const handleModelSaved = (updated: ModelInfo) => {
    onModelsChange(
      models.map((m) => (m.model_key === updated.model_key ? updated : m))
    );
  };

  return (
    <div style={styles.container}>
      {/* Trigger Button on Prompt Bar */}
      <button
        type="button"
        style={{
          ...styles.triggerBtn,
          borderColor: isOpen ? '#1a1a1a' : '#e0e0e0',
          background: isOpen ? '#f5f5f5' : '#ffffff',
        }}
        onClick={() => setIsOpen((v) => !v)}
        title="View and configure available local Ollama AI models"
      >
        <span style={styles.icon}>⚡</span>
        <span style={styles.btnText}>Models available</span>
        <span style={styles.badge}>{models.length}</span>
        <span style={{ fontSize: 9, color: '#666' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Popup Menu (Minimalist - only model names) */}
      {isOpen && (
        <>
          <div style={styles.backdrop} onClick={() => setIsOpen(false)} />
          <div style={styles.popup}>
            <div style={styles.list}>
              {models.map((m) => {
                const isOnline = m.availability && m.enabled;
                return (
                  <button
                    key={m.model_key}
                    type="button"
                    style={styles.modelItem}
                    onClick={() => {
                      setIsOpen(false);
                      setEditingModel(m);
                    }}
                  >
                    <span
                      style={{
                        ...styles.statusDot,
                        background: isOnline ? '#16a34a' : '#dc2626',
                      }}
                    />
                    <span style={styles.modelName}>{m.name}</span>
                    {!isOnline && <span style={styles.offlineTag}>Offline</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Model Edit Modal */}
      {editingModel && (
        <ModelConfigModal
          model={editingModel}
          onClose={() => setEditingModel(null)}
          onSaveSuccess={handleModelSaved}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  triggerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid #e0e0e0',
    fontSize: 13,
    fontWeight: 600,
    color: '#1a1a1a',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  icon: {
    fontSize: 13,
  },
  btnText: {
    letterSpacing: '-0.01em',
  },
  badge: {
    background: '#1a1a1a',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 10,
  },
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 900,
  },
  popup: {
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    left: 0,
    minWidth: 220,
    background: '#ffffff',
    borderRadius: 10,
    border: '1px solid #e5e5e5',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12)',
    zIndex: 950,
    overflow: 'hidden',
    padding: '6px 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
  },
  modelItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '9px 16px',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 13,
    color: '#1a1a1a',
    transition: 'background 0.1s ease',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
  },
  modelName: {
    flex: 1,
    fontWeight: 500,
  },
  offlineTag: {
    fontSize: 10,
    color: '#b91c1c',
    background: '#fee2e2',
    padding: '1px 5px',
    borderRadius: 4,
    fontWeight: 600,
  },
};
