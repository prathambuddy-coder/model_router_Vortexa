import React, { useState, useEffect, useCallback } from 'react';
import type { ModelInfo, Decision } from './types';
import { fetchModels } from './api';
import ChatPanel from './components/ChatPanel';
import InspectorPanel from './components/InspectorPanel';

const POLL_INTERVAL_MS = 6000;

export default function App() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [lastDecision, setLastDecision] = useState<Decision | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Load models from backend registry on startup
  const loadModels = useCallback(() => {
    fetchModels()
      .then(setModels)
      .catch((err) => {
        console.warn('Backend not responding yet:', err);
      });
  }, []);

  useEffect(() => {
    loadModels();
    const id = setInterval(loadModels, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadModels]);

  // Handle new decision (from chat)
  const handleDecision = useCallback((decision: Decision) => {
    setLastDecision(decision);
    loadModels();
  }, [loadModels]);

  return (
    <div style={styles.root}>
      {/* Left Chat Panel (Prompt bar with Models available popup) */}
      <div
        style={{
          ...styles.chatPane,
          flex: inspectorOpen ? '0 0 62%' : '1',
          transition: 'flex 0.2s ease',
        }}
      >
        <ChatPanel
          models={models}
          onModelsChange={setModels}
          onDecision={handleDecision}
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen((v) => !v)}
        />
      </div>

      {/* Right Inspector Panel (Decision & Tokens Available Graphical Chart) */}
      <div
        style={{
          ...styles.inspectorPane,
          width: inspectorOpen ? '38%' : '0',
          overflow: inspectorOpen ? 'visible' : 'hidden',
          opacity: inspectorOpen ? 1 : 0,
          transition: 'width 0.2s ease, opacity 0.15s ease',
          flexShrink: 0,
        }}
      >
        <InspectorPanel
          models={models}
          lastDecision={lastDecision}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: '#ffffff',
  },
  chatPane: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    position: 'relative',
  },
  inspectorPane: {
    height: '100%',
    minHeight: 0,
  },
};
