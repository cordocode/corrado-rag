// ============================================================================
// MESSAGE INPUT COMPONENT
// ============================================================================

'use client';

import { useState, useRef, useEffect } from 'react';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface MessageInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function MessageInput({
  onSend,
  isLoading = false,
  placeholder = 'Ask a question about your documents...',
}: MessageInputProps): React.ReactElement {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;
    
    onSend(trimmed);
    setMessage('');
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const canSend = message.trim().length > 0 && !isLoading;

  return (
    <form onSubmit={handleSubmit} className="py-4 border-t border-[var(--color-border-light)]">
      <div className="flex gap-3 items-center">
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className="flex-1 px-4 py-2.5 rounded-lg text-base"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="px-4 py-2.5 bg-[var(--color-text-primary)] text-[var(--color-background)] rounded-lg text-sm font-medium"
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </form>
  );
}