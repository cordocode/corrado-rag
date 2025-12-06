// ============================================================================
// PROMPT BUILDER
// ============================================================================
//
// This module assembles all context into a prompt ready for Claude.
// It combines retrieved chunks, conversation history, and the user's query.
//
// Pipeline position:
//   retrieval.ts → get-history.ts → prompt.ts → llm.ts → save-message.ts
//
// WHAT IT DOES:
// 1. Takes retrieved chunks from vector search
// 2. Takes conversation history
// 3. Takes the current user query
// 4. Builds a system prompt with instructions (default or custom)
// 5. Formats everything for the Claude API
//
// USAGE:
// import { buildPrompt } from './prompt';
// const { systemPrompt, messages } = buildPrompt(chunks, history, query);
// // Or with custom system prompt:
// const { systemPrompt, messages } = buildPrompt(chunks, history, query, customPrompt);
//
// ============================================================================

import { RetrievedChunk } from './retrieval';
import { HistoryMessage } from './get-history';
import { DEFAULT_SYSTEM_PROMPT } from '../lib/constants';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BuiltPrompt {
  systemPrompt: string;
  messages: PromptMessage[];
  chunkCount: number;
  historyCount: number;
  estimatedTokens: number;
}

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Builds the complete prompt for Claude
 * 
 * @param chunks - Retrieved document chunks from vector search
 * @param history - Previous messages in the conversation
 * @param userQuery - The current user question
 * @param customSystemPrompt - Optional custom system prompt (uses default if not provided)
 * @returns BuiltPrompt ready for Claude API
 */
export function buildPrompt(
  chunks: RetrievedChunk[],
  history: HistoryMessage[],
  userQuery: string,
  customSystemPrompt?: string | null
): BuiltPrompt {
  console.log('[PROMPT] Building prompt...');
  console.log('[PROMPT] Chunks: %d, History: %d messages', chunks.length, history.length);
  console.log('[PROMPT] Using %s system prompt', customSystemPrompt ? 'custom' : 'default');

  // Format chunks into readable context
  const chunksText = formatChunks(chunks);

  // Use custom prompt if provided, otherwise use default
  const promptTemplate = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;

  // Build system prompt with chunks inserted
  const systemPrompt = promptTemplate.replace('{chunks}', chunksText);

  // Convert history to Claude message format
  const messages: PromptMessage[] = history.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add current user query
  messages.push({
    role: 'user',
    content: userQuery,
  });

  // Estimate tokens (rough: 1 token ≈ 4 chars)
  const totalChars = systemPrompt.length + messages.reduce((sum, m) => sum + m.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);

  console.log('[PROMPT] System prompt: %d chars', systemPrompt.length);
  console.log('[PROMPT] Messages: %d total', messages.length);
  console.log('[PROMPT] Estimated tokens: ~%d', estimatedTokens);

  return {
    systemPrompt,
    messages,
    chunkCount: chunks.length,
    historyCount: history.length,
    estimatedTokens,
  };
}

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

/**
 * Formats retrieved chunks into readable text for the system prompt
 */
function formatChunks(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return '[No relevant documents found]';
  }

  return chunks
    .map((chunk, index) => {
      return `--- Document ${index + 1}: ${chunk.documentName} (chunk ${chunk.chunkIndex}, similarity: ${chunk.similarity.toFixed(3)}) ---
${chunk.content}`;
    })
    .join('\n\n');
}

/**
 * Returns the default system prompt template (for UI display)
 */
export function getSystemPromptTemplate(): string {
  return DEFAULT_SYSTEM_PROMPT;
}