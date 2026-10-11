import { useState } from 'react';
import { infer, routeOnly } from '../api';
import ConstraintBoundaryChart from './ConstraintBoundaryChart';
import ScoreBreakdownChart from './ScoreBreakdownChart';

const OPTIMIZATION_OPTIONS = [
  { value: 'balanced', label: '⚖️ Balanced (Multi-Objective)', desc: 'Optimizes across capability, latency, reliability, and load' },
  { value: 'lowest_latency', label: '🚀 Lowest Latency', desc: 'Prioritizes maximum execution speed within constraints' },
  { value: 'highest_capability', label: '🧠 Highest Capability', desc: 'Prioritizes maximum reasoning quality and task depth' },
  { value: 'lowest_cost', label: '💰 Lowest Cost', desc: 'Prefers lowest token pricing with latency tie-breaker' },
];

export default function InferencePanel({ models, onRefresh }) {
  const [prompt, setPrompt] = useState('');
  const [maxLatency, setMaxLatency] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [minCapability, setMinCapability] = useState('');
  const [contextLength, setContextLength] = useState('');
  const [minOutputTokens, setMinOutputTokens] = useState('');
  const [optimization, setOptimization] = useState('balanced');
  const [simulateFailModel, setSimulateFailModel] = useState('');
  const [forceTimeout, setForceTimeout] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('infer'); // 'infer' or 'route'
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const payload = {
      prompt: prompt.trim(),
      optimization,
    };
    if (maxLatency) payload.max_latency_ms = parseInt(maxLatency, 10);
    if (maxCost) payload.max_cost_per_1k_tokens = parseFloat(maxCost);
    if (minCapability) payload.min_capability_score = parseInt(minCapability, 10);
    if (contextLength) payload.required_context_length = parseInt(contextLength, 10);
    if (minOutputTokens) payload.min_output_tokens = parseInt(minOutputTokens, 10);
    if (simulateFailModel) payload.simulate_failure_model_ids = [simulateFailModel];
    if (forceTimeout) payload.force_timeout = true;

    try {
      let res;
      if (mode === 'infer') {
        res = await infer(payload);
      } else {
        const routeRes = await routeOnly(payload);
        res = {
          routing_decision: routeRes.routing_decision,
          success: !routeRes.routing_decision.no_valid_model,
          response_text: null,
          model_used: routeRes.routing_decision.selected_model_id,
          model_name: routeRes.routing_decision.selected_model_name,
          latency_ms: 0,
          fallback_used: false,
          fallback_attempts: [],
          request_id: routeRes.routing_decision.request_id,
          execution_type: 'route_only',
        };
      }
      setResult(res);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const PRESETS = [
    {
      label: '⚡ 1. Simple Fact QA',
      badge: 'Qwen 2B Target',
      prompt: 'What is the boiling point of water at sea level in Celsius and Fahrenheit?',
      maxLatency: '2000',
      maxCost: '',
      minCapability: '2',
      contextLength: '1000',
      minOutputTokens: '',
      optimization: 'lowest_latency',
      simulateFail: '',
      forceTimeout: false,
    },
    {
      label: '⚖️ 2. Everyday Request',
      badge: 'Qwen 4B Target',
      prompt: 'Summarize the core trade-offs between monolithic architectures and microservices into 3 actionable bullet points.',
      maxLatency: '3500',
      maxCost: '',
      minCapability: '4',
      contextLength: '4000',
      minOutputTokens: '',
      optimization: 'balanced',
      simulateFail: '',
      forceTimeout: false,
    },
    {
      label: '🧠 3. Deep Reasoning & Logic',
      badge: 'DeepSeek-R1 Target',
      prompt: 'Solve step-by-step: A boat travels 60 miles upstream in 5 hours and returns downstream in 3 hours. Calculate the speed of the boat in still water and the speed of the current. Provide formal mathematical proof.',
      maxLatency: '8000',
      maxCost: '',
      minCapability: '7',
      contextLength: '8000',
      minOutputTokens: '',
      optimization: 'highest_capability',
      simulateFail: '',
      forceTimeout: false,
    },
    {
      label: '📐 4. Math & Verification',
      badge: 'Phi-4-mini Target',
      prompt: 'Prove that the sum of angles in a Euclidean planar triangle equals 180 degrees using alternate interior angles theorem.',
      maxLatency: '4500',
      maxCost: '',
      minCapability: '6',
      contextLength: '4000',
      minOutputTokens: '',
      optimization: 'balanced',
      simulateFail: '',
      forceTimeout: false,
    },
    {
      label: '🚀 5. High Capability / Long Context',
      badge: 'Qwen 9B Target',
      prompt: 'Synthesize a multi-region distributed disaster recovery strategy for a mission-critical transactional banking database with strict RPO=0 and RTO<30s requirements.',
      maxLatency: '12000',
      maxCost: '',
      minCapability: '9',
      contextLength: '20000',
      minOutputTokens: '',
      optimization: 'highest_capability',
      simulateFail: '',
      forceTimeout: false,
    },
    {
      label: '🚫 6. Impossible SLA (No Violation)',
      badge: 'Proof of Strictness',
      prompt: 'Provide an exhaustive legal contract audit of a 200-page arbitration treaty.',
      maxLatency: '400',
      maxCost: '',
      minCapability: '9',
      contextLength: '16000',
      minOutputTokens: '',
      optimization: 'lowest_latency',
      simulateFail: '',
      forceTimeout: false,
    },
    {
      label: '💥 7. Outage Failover Demo',
      badge: 'Constraint Preserved',
      prompt: 'Explain what happens during a TCP 3-way handshake in network protocols.',
      maxLatency: '4000',
      maxCost: '',
      minCapability: '3',
      contextLength: '',
      minOutputTokens: '',
      optimization: 'balanced',
      simulateFail: 'qwen3.5-2b',
      forceTimeout: false,
    },
    {
      label: '⏳ 8. Latency Breach Failover',
      badge: 'Timeout Failover',
      prompt: 'Explain the principles of event-driven architectures with message brokers.',
      maxLatency: '3500',
      maxCost: '',
      minCapability: '4',
      contextLength: '',
      minOutputTokens: '',
      optimization: 'balanced',
      simulateFail: '',
      forceTimeout: true,
    },
  ];

  const applyPreset = (p) => {
    setPrompt(p.prompt);
    setMaxLatency(p.maxLatency);
    setMaxCost(p.maxCost);
    setMinCapability(p.minCapability);
    setContextLength(p.contextLength);
    setMinOutputTokens(p.minOutputTokens);
    setOptimization(p.optimization);
    setSimulateFailModel(p.simulateFail || '');
    setForceTimeout(Boolean(p.forceTimeout));
  };

  const handleCopy = () => {
    if (result?.response_text) {
      navigator.clipboard.writeText(result.response_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Helper to parse <think>...</think> from reasoning models
  const renderResponseContent = (text) => {
    if (!text) return null;
    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      const thinkText = thinkMatch[1].trim();
      const afterText = text.replace(/<think>[\s\S]*?<\/think>/, '').trim();
      return (
        <div>
          <details style={{ marginBottom: '14px', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px', padding: '10px 14px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--accent-purple)', fontSize: '0.85rem' }}>
              🧠 DeepSeek-R1 Chain-of-Thought Reasoning Trace (Click to inspect)
            </summary>
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {thinkText}
            </div>
          </details>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {afterText}
          </div>
        </div>
      );
    }
    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{text}</div>;
  };

  return (
    <div className="animate-fade-in">
      {/* Top Banner / Problem Overview */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>⚡</span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                ModelRouter Inference Gateway
              </h2>
              <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>Domain 2: AI Infrastructure</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Hard conditions enforced: Latency, Cost, Capability, and Context Length are strictly non-negotiable.
              Failover <strong style={{ color: 'var(--accent-green)' }}>never relaxes a constraint</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn btn-sm ${mode === 'infer' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('infer')}
            >
              🚀 Live Inference
            </button>
            <button
              className={`btn btn-sm ${mode === 'route' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('route')}
            >
              🔀 Route-Only Simulation
            </button>
          </div>
        </div>
      </div>

      <div className="inference-layout">
        {/* Left Column: Form & Presets */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">📝 Query & Constraints Specification</div>
              <div className="card-subtitle">Every request carries explicit hard boundaries</div>
            </div>
          </div>

          {/* Preset Buttons */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🎯 Challenge Benchmark Presets:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '8px 10px',
                    textAlign: 'left',
                    borderRadius: '8px',
                    borderColor: 'var(--border-subtle)',
                  }}
                  onClick={() => applyPreset(p)}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>{p.label}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', marginTop: '2px' }}>
                    {p.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form className="inference-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">User Query / Prompt</label>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                  {prompt.length} chars (~{Math.round(prompt.length / 4)} tokens)
                </span>
              </div>
              <textarea
                className="form-textarea"
                placeholder="Enter question, reasoning challenge, coding task, or analysis query..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Optimization Preference (Among Valid Models)</label>
              <select
                className="form-select"
                value={optimization}
                onChange={(e) => setOptimization(e.target.value)}
              >
                {OPTIMIZATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                {OPTIMIZATION_OPTIONS.find((o) => o.value === optimization)?.desc}
              </div>
            </div>

            {/* Hard Constraints Box */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🔒 Hard Constraints <span style={{ fontSize: '0.7rem', color: 'var(--accent-amber)', fontWeight: 400 }}>(Never violated)</span>
                </span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '0.72rem', cursor: 'pointer' }}
                  onClick={() => {
                    setMaxLatency('');
                    setMaxCost('');
                    setMinCapability('');
                    setContextLength('');
                    setMinOutputTokens('');
                  }}
                >
                  Clear Constraints
                </button>
              </div>

              <div className="constraints-grid">
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.72rem' }}>
                    ⏱️ Max Latency (ms)
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 3500"
                    value={maxLatency}
                    onChange={(e) => setMaxLatency(e.target.value)}
                    min="50"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.72rem' }}>
                    🧠 Min Capability (1-10)
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 6"
                    value={minCapability}
                    onChange={(e) => setMinCapability(e.target.value)}
                    min="1"
                    max="10"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.72rem' }}>
                    📄 Min Context Length
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 8192"
                    value={contextLength}
                    onChange={(e) => setContextLength(e.target.value)}
                    min="1"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.72rem' }}>
                    💰 Max Cost ($/1K tokens)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    className="form-input"
                    placeholder="e.g. 0.05"
                    value={maxCost}
                    onChange={(e) => setMaxCost(e.target.value)}
                    min="0"
                  />
                </div>
              </div>

              {/* Advanced / Simulation Options Toggle */}
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-subtle)' }}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  {showAdvanced ? '▼ Hide Failover & Simulation Testing Controls' : '▶ Show Failover & Simulation Testing Controls'}
                </button>

                {showAdvanced && (
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.7rem', color: 'var(--accent-red)' }}>
                        💥 Simulate Failure on Model (Failover Test)
                      </label>
                      <select
                        className="form-select"
                        value={simulateFailModel}
                        onChange={(e) => setSimulateFailModel(e.target.value)}
                        style={{ fontSize: '0.75rem' }}
                      >
                        <option value="">None (Normal execution)</option>
                        {models?.map((m) => (
                          <option key={m.id} value={m.id}>
                            Force fail on {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '18px' }}>
                      <input
                        type="checkbox"
                        id="forceTimeout"
                        checked={forceTimeout}
                        onChange={(e) => setForceTimeout(e.target.checked)}
                      />
                      <label htmlFor="forceTimeout" style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', cursor: 'pointer' }}>
                        ⏳ Force Latency Budget Breach on primary
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading || !prompt.trim()}
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  <span>{mode === 'infer' ? 'Routing & Executing...' : 'Evaluating Hard Constraints...'}</span>
                </>
              ) : mode === 'infer' ? (
                <>
                  <span>⚡ Dispatch Inference Request</span>
                </>
              ) : (
                <>
                  <span>🔀 Run Route-Only Evaluation</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Decisions, Response, and Dynamic Graphs */}
        <div className="response-panel">
          {error && (
            <div className="error-banner animate-fade-in" style={{ padding: '14px 18px', borderRadius: '10px' }}>
              <strong>❌ Error:</strong> {error}
            </div>
          )}

          {loading && (
            <div className="card">
              <div className="loading-overlay" style={{ padding: '40px 20px' }}>
                <div className="spinner spinner-lg" />
                <div className="loading-text" style={{ marginTop: '14px', fontWeight: 600 }}>
                  Evaluating constraints across model registry...
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Checking Latency, Capability, Context, Cost, Availability & Safety Buffers
                </div>
              </div>
            </div>
          )}

          {result && !loading && (
            <>
              {/* Status Header Banner */}
              {result.routing_decision?.no_valid_model ? (
                <div className="no-model-warning animate-slide-up" style={{ padding: '18px 22px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.6rem' }}>🚫</span>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-red)' }}>
                        Request Rejected: No Model Meets Hard Constraints
                      </h3>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                        {result.routing_decision.no_valid_model_reason}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card animate-slide-up" style={{ padding: '16px 20px', borderLeft: '4px solid var(--accent-green)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>✅</span>
                        <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                          Routed to {result.model_name || result.routing_decision?.selected_model_name}
                        </span>
                        {result.fallback_used && (
                          <span className="badge badge-amber">Constraint-Preserving Fallback Used</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        {result.routing_decision?.selection_reason}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="badge badge-cyan">Latency: {result.latency_ms}ms</span>
                      <span className="badge badge-purple">
                        Complexity: {result.routing_decision?.estimated_complexity?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Failover Attempt Alerts */}
              {result.fallback_attempts?.length > 0 && (
                <div className="card animate-slide-up" style={{ border: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '1.1rem' }}>🔄</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent-amber)', fontSize: '0.9rem' }}>
                      Failover Events Tracked ({result.fallback_attempts.length}) — Hard Constraints Preserved
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {result.fallback_attempts.map((fa, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.3)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--accent-red)' }}>✕ {fa.model_name}</span>
                          <span className="badge badge-red" style={{ fontSize: '0.7rem' }}>{fa.reason}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{fa.error_message}</span>
                        </div>
                        <span className="mono" style={{ color: 'var(--text-tertiary)' }}>{fa.latency_ms}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Model Output (if infer mode) */}
              {result.response_text && (
                <div className="card animate-slide-up">
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="card-title">💬 Generated Model Response</div>
                      <span className="badge badge-blue">{result.model_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopy}
                        style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                      >
                        {copied ? '✓ Copied' : '📋 Copy'}
                      </button>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        Execution: {result.execution_type}
                      </span>
                    </div>
                  </div>
                  <div
                    className="response-text"
                    style={{
                      maxHeight: '400px',
                      overflowY: 'auto',
                      background: 'rgba(10, 14, 23, 0.8)',
                      padding: '16px',
                      borderRadius: '8px',
                      fontFamily: 'inherit',
                      lineHeight: 1.6,
                    }}
                  >
                    {renderResponseContent(result.response_text)}
                  </div>
                </div>
              )}

              {/* DYNAMIC GRAPH 1: 2D Constraint Boundary Solution Space Map */}
              {result.routing_decision && (
                <div className="animate-slide-up" style={{ marginBottom: '16px' }}>
                  <ConstraintBoundaryChart
                    decision={result.routing_decision}
                    constraints={{
                      max_latency_ms: maxLatency ? parseInt(maxLatency, 10) : undefined,
                      min_capability_score: minCapability ? parseInt(minCapability, 10) : undefined,
                    }}
                    models={models}
                  />
                </div>
              )}

              {/* DYNAMIC GRAPH 2: Mathematical Scoring Breakdown */}
              {result.routing_decision?.candidates && (
                <div className="animate-slide-up" style={{ marginBottom: '16px' }}>
                  <ScoreBreakdownChart
                    candidates={result.routing_decision.candidates}
                    selectedModelId={result.routing_decision.selected_model_id}
                  />
                </div>
              )}

              {/* Complexity Analysis with Uncertainty Protection Card */}
              {result.routing_decision?.complexity_analysis && (
                <div className="card animate-slide-up" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1rem' }}>🧠</span>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                        Query Complexity & Uncertainty Protection
                      </span>
                    </div>
                    <span className="badge badge-purple">
                      Confidence: {(result.routing_decision.complexity_analysis.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    {result.routing_decision.complexity_analysis.reasoning_indicators?.map((ind, i) => (
                      <span key={i} className="badge badge-blue" style={{ fontSize: '0.72rem' }}>
                        ✓ {ind}
                      </span>
                    ))}
                    {result.routing_decision.complexity_analysis.uncertainty_applied && (
                      <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                        🛡️ Safer Option Applied (Safety Buffer)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Model Candidates Matrix (Core Explainability) */}
              {result.routing_decision && (
                <div className="card animate-slide-up">
                  <div className="card-header">
                    <div>
                      <div className="card-title">
                        📊 Candidate Evaluation Matrix ({result.routing_decision.candidates?.length} models)
                      </div>
                      <div className="card-subtitle">
                        Every model evaluated against hard constraints and scored by stated preference
                      </div>
                    </div>
                  </div>

                  <div className="candidate-list">
                    {result.routing_decision.candidates?.map((c) => {
                      const isSelected = c.model_id === result.routing_decision.selected_model_id;
                      return (
                        <div
                          key={c.model_id}
                          className={`candidate-row ${c.eligible ? (isSelected ? 'selected' : '') : 'rejected'}`}
                          style={{
                            padding: '12px 14px',
                            marginBottom: '8px',
                            borderRadius: '10px',
                            border: isSelected
                              ? '2px solid var(--accent-green)'
                              : c.eligible
                              ? '1px solid rgba(59, 130, 246, 0.3)'
                              : '1px solid rgba(239, 68, 68, 0.2)',
                            background: isSelected
                              ? 'rgba(16, 185, 129, 0.08)'
                              : c.eligible
                              ? 'rgba(17, 24, 39, 0.5)'
                              : 'rgba(239, 68, 68, 0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '1.2rem' }}>
                                {isSelected ? '🏆' : c.eligible ? '✅' : '❌'}
                              </span>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <strong style={{ fontSize: '0.92rem' }}>{c.model_name}</strong>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                                    ({c.download_size})
                                  </span>
                                  <span className={`badge ${c.tier === 'essential' ? 'badge-green' : c.tier === 'optional' ? 'badge-blue' : 'badge-purple'}`} style={{ fontSize: '0.65rem' }}>
                                    {c.recommendation || c.tier}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  {c.role}
                                </div>
                              </div>
                            </div>

                            <div>
                              {c.eligible ? (
                                <div style={{ textAlign: 'right' }}>
                                  <span className="candidate-score" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                                    Score: {c.score?.toFixed(2)}
                                  </span>
                                  {isSelected && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-green)', fontWeight: 600 }}>
                                      Primary Pick
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="badge badge-red" style={{ fontSize: '0.72rem' }}>
                                  Disqualified
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Constraint Checks Pill Grid */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', fontSize: '0.72rem' }}>
                            <span style={{ color: c.constraint_checks?.latency ? 'var(--accent-green)' : 'var(--accent-red)', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                              ⏱️ Latency: {c.avg_latency_ms}ms (max {c.max_latency_ms}ms) {c.constraint_checks?.latency ? '✓' : '✗'}
                            </span>
                            <span style={{ color: c.constraint_checks?.capability ? 'var(--accent-green)' : 'var(--accent-red)', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                              🧠 Capability: {c.capability_score}/10 {c.constraint_checks?.capability ? '✓' : '✗'}
                            </span>
                            <span style={{ color: c.constraint_checks?.context ? 'var(--accent-green)' : 'var(--accent-red)', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                              📄 Context: {c.context_length.toLocaleString()} {c.constraint_checks?.context ? '✓' : '✗'}
                            </span>
                            <span style={{ color: c.constraint_checks?.availability ? 'var(--accent-green)' : 'var(--accent-red)', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                              🟢 Reliability: {(c.reliability * 100).toFixed(0)}% {c.constraint_checks?.availability ? '✓' : '✗'}
                            </span>
                          </div>

                          {/* Rejection reasons */}
                          {!c.eligible && c.rejection_reasons?.length > 0 && (
                            <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--accent-red)' }}>
                              <strong>Rejection reason:</strong> {c.rejection_reasons.join('; ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Fallback chain visualizer */}
                  {result.routing_decision.fallback_chain?.length > 0 && (
                    <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🔄 Verified Fallback Chain</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-green)', fontWeight: 400 }}>
                          (All candidates meet 100% of hard constraints)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="badge badge-green">
                          1. Primary: {result.routing_decision.selected_model_name}
                        </span>
                        {result.routing_decision.fallback_chain.map((fbId, i) => {
                          const fbModel = models?.find((m) => m.id === fbId);
                          return (
                            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>➔</span>
                              <span className="badge badge-blue">
                                {i + 2}. {fbModel ? fbModel.name : fbId}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Initial Blank State */}
          {!result && !loading && !error && (
            <div className="card" style={{ padding: '36px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>⚡</div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Inference Gateway Ready</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '420px', margin: '8px auto 20px', lineHeight: 1.5 }}>
                Select a benchmark preset above or enter a prompt with explicit constraints.
                The router dynamically selects the optimal model, renders 2D boundary solution maps, and handles failovers.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => applyPreset(PRESETS[0])}>
                  ⚡ Test Simple QA (Qwen 2B)
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => applyPreset(PRESETS[2])}>
                  🧠 Test Reasoning (DeepSeek-R1)
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => applyPreset(PRESETS[5])}>
                  🚫 Test Strict SLA Rejection
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
