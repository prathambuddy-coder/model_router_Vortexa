import React from 'react';

/**
 * Score Breakdown Comparison Chart
 * Visualizes the exact scoring formula components for each evaluated candidate
 * on the current question:
 *   - Speed / Latency Contribution (Cyan)
 *   - Reasoning / Quality Contribution (Purple)
 *   - Reliability Contribution (Green)
 *   - Task Suitability Bonus (Amber)
 *   - Load Penalty (Red)
 */
export default function ScoreBreakdownChart({ candidates, selectedModelId }) {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div style={{ background: 'rgba(10, 14, 23, 0.7)', borderRadius: '12px', border: '1px solid var(--border-default)', padding: '16px 20px', marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
            📊 Candidate Multi-Attribute Scoring Formula Breakdown
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            Mathematical breakdown of weights based on user optimization preference
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', fontSize: '0.7rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#06b6d4' }}>■ Speed (Latency)</span>
          <span style={{ color: '#8b5cf6' }}>■ Quality (Capability)</span>
          <span style={{ color: '#10b981' }}>■ Reliability</span>
          <span style={{ color: '#f59e0b' }}>■ Task Bonus</span>
          <span style={{ color: '#ef4444' }}>■ Load Penalty</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {candidates.map((c) => {
          const isWinner = c.model_id === selectedModelId;
          const bd = c.score_breakdown || {
            latency_contribution: 0,
            capability_contribution: 0,
            reliability_contribution: 0,
            task_suitability_bonus: 0,
            load_penalty: 0,
            final_score: 0,
          };

          const total = (bd.latency_contribution || 0) +
            (bd.capability_contribution || 0) +
            (bd.reliability_contribution || 0) +
            (bd.task_suitability_bonus || 0);

          const maxScale = 100; // max normalized score

          const pLat = ((bd.latency_contribution || 0) / maxScale) * 100;
          const pCap = ((bd.capability_contribution || 0) / maxScale) * 100;
          const pRel = ((bd.reliability_contribution || 0) / maxScale) * 100;
          const pTask = ((bd.task_suitability_bonus || 0) / maxScale) * 100;

          return (
            <div
              key={c.model_id}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: isWinner ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                border: isWinner ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 600, color: isWinner ? 'var(--accent-green)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isWinner ? '🏆 ' : ''}{c.model_name}
                  {!c.eligible && <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>Disqualified</span>}
                </span>
                <span className="mono" style={{ fontWeight: 700, color: isWinner ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                  {c.eligible ? `Score: ${c.score?.toFixed(2)}` : '—'}
                </span>
              </div>

              {c.eligible ? (
                <div style={{ width: '100%', height: '14px', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${pLat}%`, background: '#06b6d4', transition: 'width 0.4s' }} title={`Speed: +${bd.latency_contribution}`} />
                  <div style={{ width: `${pCap}%`, background: '#8b5cf6', transition: 'width 0.4s' }} title={`Quality: +${bd.capability_contribution}`} />
                  <div style={{ width: `${pRel}%`, background: '#10b981', transition: 'width 0.4s' }} title={`Reliability: +${bd.reliability_contribution}`} />
                  <div style={{ width: `${pTask}%`, background: '#f59e0b', transition: 'width 0.4s' }} title={`Task Match: +${bd.task_suitability_bonus}`} />
                </div>
              ) : (
                <div style={{ fontSize: '0.72rem', color: 'var(--accent-red)' }}>
                  {c.rejection_reasons?.join('; ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
