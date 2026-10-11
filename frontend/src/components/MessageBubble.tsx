import React from 'react';
import type { ChatMessage } from '../types';

interface Props {
  message: ChatMessage;
}

export default function MessageBubble({ message }: Props) {
  const { role, content, modelName, timestamp } = message;

  const isUser = role === 'user';
  const isError = role === 'error';

  const timeStr = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (isError) {
    return (
      <div style={styles.errorWrapper}>
        <div style={styles.errorCard}>
          <span style={styles.errorIcon}>❌</span>
          <div>
            <p style={styles.errorTitle}>NO VALID MODEL</p>
            <p style={styles.errorMsg}>{content}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.row, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && (
        <div style={styles.avatar}>
          <AiIcon />
        </div>
      )}

      <div style={styles.bubbleGroup}>
        {!isUser && modelName && (
          <p style={styles.modelLabel}>Responded by: {modelName}</p>
        )}

        <div
          style={{
            ...styles.bubble,
            ...(isUser ? styles.userBubble : styles.aiBubble),
          }}
        >
          <p style={{ ...styles.text, ...(isUser ? styles.userText : styles.aiText) }}>
            {content}
          </p>
        </div>

        <p style={{ ...styles.time, textAlign: isUser ? 'right' : 'left' }}>{timeStr}</p>
      </div>

      {isUser && (
        <div style={{ ...styles.avatar, ...styles.userAvatar }}>
          <UserIcon />
        </div>
      )}
    </div>
  );
}

function AiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    padding: '4px 24px',
    maxWidth: '100%',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#f0f0f0',
    border: '1px solid #e5e5e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  userAvatar: {
    background: '#1a1a1a',
    border: '1px solid #1a1a1a',
  },
  bubbleGroup: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 'min(520px, 72%)',
  },
  modelLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
    paddingLeft: 2,
    fontWeight: 500,
  },
  bubble: {
    borderRadius: 18,
    padding: '10px 16px',
    wordBreak: 'break-word',
    lineHeight: 1.6,
  },
  userBubble: {
    background: '#1a1a1a',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    background: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 14,
    whiteSpace: 'pre-wrap',
  },
  userText: {
    color: '#ffffff',
  },
  aiText: {
    color: '#1a1a1a',
  },
  time: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 4,
    paddingLeft: 2,
    paddingRight: 2,
  },
  errorWrapper: {
    padding: '6px 24px',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    background: '#fff5f5',
    border: '1px solid #fecaca',
    borderLeft: '3px solid #dc2626',
    borderRadius: 10,
    padding: '12px 16px',
  },
  errorIcon: {
    fontSize: 16,
    flexShrink: 0,
    marginTop: 1,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#dc2626',
    letterSpacing: '0.05em',
    marginBottom: 4,
  },
  errorMsg: {
    fontSize: 13,
    color: '#7f1d1d',
    lineHeight: 1.5,
  },
};
