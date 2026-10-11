import { useState, useEffect } from 'react';
import { getLogs, clearLogs } from '../api';

export default function LogsPanel() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [filterModel, setFilterModel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getLogs(100);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (window.confirm('Clear all audit logs from memory?')) {
      await clearLogs();
      await refresh();
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (filterModel && log.selected_model !== filterModel) return false;
    if (filterStatus === 'success' && !log.success) return false;
    if (filterStatus === 'fallback' && !log.fallback_used) return false;
    if (filterStatus === 'rejected' && (log.success || log.selected_model)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = log.request_id?.toLowerCase().includes(q);
      const matchPrompt = log.prompt_preview?.toLowerCase().includes(q);
      const matchModel = log.selected_model?.toLowerCase().includes(q);
      if (!matchId && !matchPrompt && !matchModel) return false;
    }
    return true;
  });

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📋</span>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Audit Logs & Decision Traces</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
            Every inference and routing decision is preserved with full explainability, candidate evaluations, and failover history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleClear}>
            🗑️ Clear Logs
          </button>
          <button className="btn btn-primary btn-sm" onClick={refresh}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '14px 18px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          className="form-input"
          placeholder="🔍 Search prompt, model, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '8px 12px', fontSize: '0.82rem' }}
        />

        <select
          className="form-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ width: '180px', padding: '8px 12px', fontSize: '0.82rem' }}
        >
          <option value="">All Statuses</option>
          <option value="success">✅ Successful Dispatches</option>
          <option value="fallback">🔄 Fallback Used</option>
          <option value="rejected">🚫 Constraint Rejections</option>
        </select>

        <select
          className="form-select"
          value={filterModel}
          onChange={(e) => setFilterModel(e.target.value)}
          style={{ width: '180px', padding: '8px 12px', fontSize: '0.82rem' }}
        >
          <option value="">All Models</option>
          <option value="qwen3.5-2b">Qwen3.5 2B</option>
          <option value="qwen3.5-4b">Qwen3.5 4B</option>
          <option value="deepseek-r1-7b">DeepSeek-R1 7B</option>
          <option value="phi-4-mini-3.8b">Phi-4-mini 3.8B</option>
          <option value="qwen3.5-9b">Qwen3.5 9B</option>
        </select>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="card">
          <div className="loading-overlay" style={{ padding: '40px' }}>
            <div className="spinner spinner-lg" />
            <div className="loading-text" style={{ marginTop: '12px' }}>Loading audit records...</div>
          </div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '40px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>No Audit Records Found</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Send requests through the Inference Gateway to generate explainable audit entries.
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Timestamp</th>
                  <th>Prompt Preview</th>
                  <th>Complexity</th>
                  <th>Selected Model</th>
                  <th>Latency</th>
                  <th>Failover Status</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const isNoValid = log.routing_decision?.no_valid_model;
                  return (
                    <tr
                      key={log.request_id}
                      className="log-row"
                      onClick={() => setSelectedLog(log)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <code style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)' }}>
                          #{log.request_id}
                        </code>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        {log.prompt_preview}
                      </td>
                      <td>
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                          {log.estimated_complexity}
                        </span>
                      </td>
                      <td>
                        {log.selected_model ? (
                          <strong style={{ fontSize: '0.85rem' }}>{log.selected_model}</strong>
                        ) : (
                          <span style={{ color: 'var(--accent-red)', fontSize: '0.8rem' }}>None (Rejected)</span>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: '0.8rem' }}>
                        {log.latency_ms}ms
                      </td>
                      <td>
                        {log.fallback_used ? (
                          <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>
                            🔄 {log.fallback_attempts} fallback(s)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Direct</span>
                        )}
                      </td>
                      <td>
                        {isNoValid ? (
                          <span className="badge badge-red" style={{ fontSize: '0.7rem' }}>
                            🚫 Disqualified
                          </span>
                        ) : log.success ? (
                          <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                            ✅ Success
                          </span>
                        ) : (
                          <span className="badge badge-red" style={{ fontSize: '0.7rem' }}>
                            ❌ Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drill-Down Inspection Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div
            className="modal-card animate-scale-up"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  🔍 Audit Decision Trace #{selectedLog.request_id}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Recorded at {new Date(selectedLog.timestamp).toLocaleString()}
                </span>
              </div>
              <button className="modal-close" onClick={() => setSelectedLog(null)}>
                ✕
              </button>
            </div>

            {/* Prompt preview */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Prompt Preview
              </div>
              <div style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginTop: '4px' }}>
                {selectedLog.prompt_preview}
              </div>
            </div>

            {/* Constraints Table */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Applied Hard Constraints
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {selectedLog.constraints?.max_latency_ms && (
                  <span className="badge badge-blue">Max Latency: {selectedLog.constraints.max_latency_ms}ms</span>
                )}
                {selectedLog.constraints?.min_capability_score && (
                  <span className="badge badge-purple">Min Capability: {selectedLog.constraints.min_capability_score}/10</span>
                )}
                {selectedLog.constraints?.required_context_length && (
                  <span className="badge badge-cyan">Min Context: {selectedLog.constraints.required_context_length} tokens</span>
                )}
                {selectedLog.constraints?.max_cost_per_1k_tokens && (
                  <span className="badge badge-green">Max Cost: ${selectedLog.constraints.max_cost_per_1k_tokens}</span>
                )}
                <span className="badge badge-gray">Optimization: {selectedLog.constraints?.optimization}</span>
              </div>
            </div>

            {/* Decision explanation */}
            <div style={{ marginBottom: '16px', background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', borderLeft: '3px solid var(--accent-blue)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Decision Explanation
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                {selectedLog.routing_decision?.selection_reason || selectedLog.routing_decision?.no_valid_model_reason}
              </div>
            </div>

            {/* Candidates evaluation */}
            {selectedLog.routing_decision?.candidates?.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Model Candidates Evaluation
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedLog.routing_decision.candidates.map((c) => (
                    <div
                      key={c.model_id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: c.eligible ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                        border: c.eligible ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.15)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div>
                        <strong>{c.model_name}</strong>
                        <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                          ({c.avg_latency_ms}ms, Cap: {c.capability_score})
                        </span>
                        {!c.eligible && c.rejection_reasons?.length > 0 && (
                          <div style={{ color: 'var(--accent-red)', fontSize: '0.72rem', marginTop: '2px' }}>
                            {c.rejection_reasons.join('; ')}
                          </div>
                        )}
                      </div>
                      <div>
                        {c.eligible ? (
                          <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                            Eligible (Score: {c.score?.toFixed(1)})
                          </span>
                        ) : (
                          <span className="badge badge-red" style={{ fontSize: '0.7rem' }}>
                            Disqualified
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedLog(null)}>
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
