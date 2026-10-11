import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, Decision, ModelInfo } from '../types';
import { postInfer } from '../api';
import MessageBubble from './MessageBubble';
import ModelsAvailablePopup from './ModelsAvailablePopup';

interface ChatPanelProps {
  models: ModelInfo[];
  onModelsChange: (models: ModelInfo[]) => void;
  onDecision: (decision: Decision) => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

let msgCounter = 0;
function uid() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

export default function ChatPanel({
  models,
  onModelsChange,
  onDecision,
  inspectorOpen,
  onToggleInspector,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Model selection is completely decided by backend server as per the user prompt
      // and the manipulated features of models configured by judges.
      const data = await postInfer(text, {} as any);

      if (data.decision) {
        onDecision(data.decision);
      }

      if (data.status === 'NO_VALID_MODEL' || !data.success) {
        const errorMsg: ChatMessage = {
          id: uid(),
          role: 'error',
          content: `❌ NO VALID MODEL: ${data.message || data.error || 'No available model satisfies the prompt requirements.'}`,
          decision: data.decision,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } else {
        const aiMsg: ChatMessage = {
          id: uid(),
          role: 'ai',
          content: data.response || '',
          modelName: data.model_name || data.model_used,
          modelKey: data.model_used,
          executionMode: data.execution_mode || (data.simulated ? 'SIMULATED' : 'REAL_OLLAMA_INFERENCE'),
          latencyMs: data.latency_ms,
          decision: data.decision,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: uid(),
        role: 'error',
        content: `Error connecting to gateway: ${err.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={styles.wrapper}>
      {/* Top Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>A-01</span>
          <div>
            <span style={styles.title}>ModelRouter</span>
            <span style={styles.subtitle}> · Autonomous Prompt-to-Model Inference Gateway</span>
          </div>
        </div>

        <button
          type="button"
          style={styles.inspectorToggleBtn}
          onClick={onToggleInspector}
          title={inspectorOpen ? 'Hide Inspector Panel' : 'Show Inspector Panel'}
        >
          {inspectorOpen ? 'Inspector ⇥' : '⇤ Inspector'}
        </button>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>⚡</div>
            <p style={styles.emptyTitle}>ModelRouter Ready</p>
            <p style={styles.emptySubtitle}>
              Type any prompt. The backend automatically analyzes its complexity,
              evaluates your models' features, and selects the winning model.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {loading && (
          <div style={styles.typingWrapper}>
            <div style={styles.typingBubble}>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span style={styles.routingText}>Backend analyzing prompt & routing to optimal model…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div style={styles.inputArea}>
        {/* Row above textarea with "Models available" Popup Button */}
        <div style={styles.controlsRow}>
          <ModelsAvailablePopup
            models={models}
            onModelsChange={onModelsChange}
          />
          <div style={styles.routingModeNotice}>
            Autonomous routing: Backend server analyzes prompt complexity
          </div>
        </div>

        {/* Textarea and Send button */}
        <div style={styles.inputRow}>
          <textarea
            ref={textareaRef}
            style={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message ModelRouter…"
            rows={1}
            disabled={loading}
          />
          <button
            type="button"
            style={{
              ...styles.sendBtn,
              ...(loading || !input.trim() ? styles.sendBtnDisabled : {}),
            }}
            onClick={send}
            disabled={loading || !input.trim()}
            title="Send (Enter)"
          >
            <SendIcon />
          </button>
        </div>
        <p style={styles.hint}>
          Enter to send · Shift+Enter for new line · Click "Models available" to modify a model's latency or availability
        </p>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#ffffff',
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid #e5e5e5',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    fontSize: 12,
    fontWeight: 700,
    background: '#1a1a1a',
    color: '#fff',
    padding: '2px 7px',
    borderRadius: 5,
    letterSpacing: '0.05em',
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
  },
  inspectorToggleBtn: {
    background: '#f5f5f5',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
    fontWeight: 600,
    color: '#444',
    cursor: 'pointer',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '80px 32px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '0 0 6px 0',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#777',
    maxWidth: 420,
    lineHeight: 1.5,
    margin: 0,
  },
  typingWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 24px',
  },
  typingBubble: {
    background: '#f3f4f6',
    borderRadius: 16,
    padding: '10px 14px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  routingText: {
    fontSize: 12,
    color: '#888',
  },
  inputArea: {
    padding: '12px 20px 16px',
    borderTop: '1px solid #e5e5e5',
    background: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  routingModeNotice: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: 10,
    padding: '8px 12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  textarea: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 14,
    color: '#1a1a1a',
    background: 'transparent',
    resize: 'none',
    maxHeight: 160,
    fontFamily: 'inherit',
    lineHeight: 1.4,
  },
  sendBtn: {
    background: '#1a1a1a',
    border: 'none',
    borderRadius: 7,
    color: '#fff',
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    background: '#e5e7eb',
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  hint: {
    fontSize: 11,
    color: '#999',
    margin: 0,
    textAlign: 'center',
  },
};
