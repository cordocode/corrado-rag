// ============================================================================
// CHAT WINDOW COMPONENT
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import SourcesDropdown, { Source } from './SourcesDropdown';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

interface ChatWindowProps {
  messages: Message[];
  streamingContent?: string | null;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function ChatWindow({
  messages,
  streamingContent = null,
}: ChatWindowProps): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const hasMessages = messages.length > 0 || streamingContent;

  return (
    <div className="flex-1 overflow-y-auto">
      {!hasMessages ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-[var(--color-text-muted)]">
              Ask questions about your trained documents
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border-light)]">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
            >
              {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                <SourcesDropdown sources={message.sources} />
              )}
            </MessageBubble>
          ))}

          {streamingContent !== null && (
            <MessageBubble
              role="assistant"
              content={streamingContent}
              isStreaming={true}
            />
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}