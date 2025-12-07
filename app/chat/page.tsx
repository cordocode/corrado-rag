// ============================================================================
// CHAT PAGE
// ============================================================================

'use client';

import { useState, useRef } from 'react';
import ChatWindow, { Message } from '@/components/chat/ChatWindow';
import MessageInput from '@/components/chat/MessageInput';
import { Source } from '@/components/chat/SourcesDropdown';

// ----------------------------------------------------------------------------
// PAGE COMPONENT
// ----------------------------------------------------------------------------

export default function ChatPage(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  async function handleSend(content: string): Promise<void> {
    // Add user message immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          message: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let fullContent = '';
      let sources: Source[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);

              if (data.type === 'token') {
                fullContent += data.content;
                setStreamingContent(fullContent);
              } else if (data.type === 'done') {
                conversationIdRef.current = data.conversationId;
                sources = data.sources || [];
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Skip malformed JSON lines
              console.warn('Failed to parse SSE data:', jsonStr);
            }
          }
        }
      }

      // Add assistant message with sources
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: fullContent,
        sources,
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);

    } finally {
      setStreamingContent(null);
      setIsLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-6 overflow-hidden">
      <ChatWindow 
        messages={messages} 
        streamingContent={streamingContent}
      />
      <MessageInput 
        onSend={handleSend} 
        isLoading={isLoading} 
      />
    </main>
  );
}