import React, { useState } from 'react';
import type { Decision, ModelInfo } from '../types';
import ExplainabilityBox from './ExplainabilityBox';
import TokenCapacityChart from './TokenCapacityChart';

interface Props {
  models: ModelInfo[];
  lastDecision: Decision | null;
}

type Section = 'decision' | 'tokens' | 'models';

const SECTIONS: { id: Section; title: string; icon: string }[] = [
  { id: 'decision', title: 'Routing Decision', icon: '🎯' },
  { id: 'tokens', title: 'Token Capacity', icon: '📊' },
  { id: 'models', title: 'Model Status', icon: '⚡' },
];

export default function InspectorPanel({ models, lastDecision }: Props) {
  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set(['decision', 'tokens', 'models'])
  );

  const toggle = (id: Section) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onlineCount = models.filter((m) => m.availability && m.enabled).length;

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <span style={styles.headerTitle}>Inspector</span>
          <div style={styles.headerSub}>Autonomous Model Router</div>
        </div>
        <span style={styles.badge}>
          {onlineCount}/{models.length} Online
        </span>
      </div>

      {/* Sections List */}
      <div style={styles.sections}>
        {SECTIONS.map(({ id, title, icon }) => {
          const isOpen = openSections.has(id);
          return (
            <div key={id} style={styles.section}>
              <button
                type="button"
                style={styles.sectionHeader}
                onClick={() => toggle(id)}
              >
                <div style={styles.sectionHeaderLeft}>
                  <span style={styles.icon}>{icon}</span>
                  <span style={styles.sectionTitle}>{title}</span>
                </div>
                <span
                  style={{
                    ...styles.chevron,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  ▾
                </span>
              </button>

              {isOpen && (
                <div style={styles.sectionBody}>
                  {id === 'decision' && (
                    <ExplainabilityBox decision={lastDecision} />
                  )}

                  {id === 'tokens' && (
                    <TokenCapacityChart models={models} />
                  )}

                  {id === 'models' && (
                    <div style={styles.modelStatusList}>
                      {models.map((m) => {
                        const isOnline = m.availability && m.enabled;
                        return (
                          <div key={m.model_key} style={styles.modelStatusRow}>
                            <div style={styles.modelRowLeft}>
                              <span
                                style={{
                                  ...styles.dot,
                                  background: isOnline ? '#16a34a' : '#dc2626',
                                }}
                              />
                              <div>
                                <div style={styles.name}>{m.name}</div>
                                <div style={styles.role}>{m.role}</div>
                              </div>
                            </div>
                            <div style={styles.modelRowRight}>
                              <div style={styles.lat}>{m.avg_latency_ms}ms</div>
                              <div style={styles.cap}>Cap: {m.capability_score}/10</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Clean Minimal Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>
          Local Inference · Ollama CPU
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#fafafa',
    borderLeft: '1px solid #e5e5e5',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    borderBottom: '1px solid #e5e5e5',
    background: '#ffffff',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1a1a1a',
  },
  headerSub: {
    fontSize: 11,
    color: '#777',
  },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#15803d',
    background: '#dcfce7',
    borderRadius: 6,
    padding: '3px 8px',
  },
  sections: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  section: {
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 14px',
    background: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  sectionHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#333',
  },
  chevron: {
    fontSize: 11,
    color: '#888',
    transition: 'transform 0.2s ease',
  },
  sectionBody: {
    padding: '12px 14px',
    borderTop: '1px solid #f0f0f0',
  },
  modelStatusList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  modelStatusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 9px',
    borderRadius: 6,
    background: '#fcfcfc',
    border: '1px solid #f0f0f0',
  },
  modelRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  name: {
    fontSize: 12,
    fontWeight: 600,
    color: '#1a1a1a',
  },
  role: {
    fontSize: 10,
    color: '#777',
  },
  modelRowRight: {
    textAlign: 'right',
  },
  lat: {
    fontSize: 11,
    fontWeight: 600,
    color: '#2563eb',
  },
  cap: {
    fontSize: 10,
    color: '#666',
  },
  footer: {
    padding: '10px 18px',
    borderTop: '1px solid #eee',
    background: '#fff',
  },
  footerText: {
    fontSize: 10,
    color: '#888',
  },
};
