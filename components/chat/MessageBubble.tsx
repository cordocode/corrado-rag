// ============================================================================
// MESSAGE BUBBLE COMPONENT
// ============================================================================

'use client';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  children?: React.ReactNode;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function MessageBubble({
  role,
  content,
  isStreaming = false,
  children,
}: MessageBubbleProps): React.ReactElement {
  const isUser = role === 'user';

  return (
    <div className="py-4">
      {/* Role Label */}
      <div className="mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {isUser ? 'You' : 'Assistant'}
        </span>
      </div>

      {/* Message Content */}
      <div className="text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
        {content}
        {isStreaming && (
          <span className="inline-block w-0.5 h-4 ml-0.5 bg-[var(--color-text-primary)] animate-pulse" />
        )}
      </div>

      {/* Sources (passed as children) */}
      {children && (
        <div className="mt-3">
          {children}
        </div>
      )}
    </div>
  );
}