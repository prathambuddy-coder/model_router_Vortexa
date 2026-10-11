import { useState, useEffect, useCallback } from 'react';
import './index.css';
import './App.css';
import { getHealth, getModels, getStats } from './api';
import Dashboard from './components/Dashboard';
import InferencePanel from './components/InferencePanel';
import ModelsPanel from './components/ModelsPanel';
import LogsPanel from './components/LogsPanel';

const TABS = [
  { id: 'inference', label: '⚡ Inference Gateway', icon: '⚡' },
  { id: 'models', label: '🤖 Models & Judge Controls', icon: '🤖' },
  { id: 'dashboard', label: '📊 Dashboard & Metrics', icon: '📊' },
  { id: 'logs', label: '📋 Audit Logs & Traces', icon: '📋' },
];

function App() {
  const [activeTab, setActiveTab] = useState('inference');
  const [health, setHealth] = useState(null);
  const [models, setModels] = useState([]);
  const [stats, setStats] = useState(null);

  const refreshData = useCallback(async () => {
    try {
      const [h, m, s] = await Promise.all([getHealth(), getModels(), getStats()]);
      setHealth(h);
      setModels(m);
      setStats(s);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setHealth({ status: 'offline', models_loaded: 0, models_available: 0, ollama_connected: false });
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 8000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const isConnected = health?.ollama_connected;
  const isHealthy = health?.status === 'healthy' || health?.status === 'simulated_ready';
  const statusLabel = isConnected
    ? 'Ollama Live Connected'
    : isHealthy
    ? 'Simulation Ready (Hybrid)'
    : 'Backend Offline';

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">⚡</div>
            <div className="logo-text">
              <span>ModelRouter</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                AI Inference Gateway
              </span>
            </div>
          </div>

          <nav className="nav-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="status-indicator">
            <span className={`status-dot ${isConnected ? 'healthy' : isHealthy ? 'degraded' : 'offline'}`} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{statusLabel}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'inference' && (
          <InferencePanel models={models} onRefresh={refreshData} />
        )}
        {activeTab === 'models' && (
          <ModelsPanel models={models} onRefresh={refreshData} />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard stats={stats} models={models} health={health} onRefresh={refreshData} />
        )}
        {activeTab === 'logs' && (
          <LogsPanel />
        )}
      </main>
    </div>
  );
}

export default App;
