// ============================================================================
// PROMPT BUILDER
// ============================================================================
//
// This module assembles the complete prompt for Claude from:
// - System instructions
// - Retrieved document chunks
// - Conversation history
// - Current user query
//
// Pipeline position:
//   retrieval.ts → get-history.ts → prompt.ts → llm.ts
//
// WHAT IT DOES:
// 1. Creates a system prompt that explains Claude's role
// 2. Formats retrieved chunks as context
// 3. Adds conversation history
// 4. Packages everything for the LLM call
//
// PROMPT STRUCTURE:
// - System: Instructions + retrieved chunks
// - Messages: Full conversation history + current query
//
// WHY CHUNKS IN SYSTEM:
// Putting document context in the system prompt keeps the user/assistant
// message history clean and makes it easier for Claude to distinguish
// between "what the documents say" and "what we've discussed."
//
// USAGE:
// import { buildPrompt } from './prompt';
// const prompt = buildPrompt(chunks, history, userQuery);
//
// ============================================================================

import { Message } from '../types';
import { RetrievedChunk } from './retrieval';

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
  tokenEstimate: number;
}

// ----------------------------------------------------------------------------
// SYSTEM PROMPT TEMPLATE
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT_TEMPLATE = `You are a helpful assistant with access to a document database. Your role is to answer questions about the documents stored in the system.

IMPORTANT INSTRUCTIONS:
1. Base your answers primarily on the document context provided below
2. If the documents don't contain relevant information, say so clearly
3. Quote specific text from documents when it supports your answer
4. If asked about something not in the documents, explain what you can and cannot help with
5. Be concise but thorough - users are looking for specific information

DOCUMENT CONTEXT:
The following are relevant excerpts from documents in the database. Each chunk includes a [DOCUMENT CONTEXT] header with metadata (property address, tenant name, etc.) followed by [CONTENT] with the actual text.

{{CHUNKS}}

END OF DOCUMENT CONTEXT

Answer the user's questions based on the above context. If you need to reference a specific document, use details from its [DOCUMENT CONTEXT] header (like property address or tenant name).`;

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Builds the complete prompt for the LLM
 * 
 * @param chunks - Retrieved document chunks
 * @param history - Previous conversation messages
 * @param currentQuery - The user's new question
 * @returns BuiltPrompt ready for LLM call
 */
export function buildPrompt(
  chunks: RetrievedChunk[],
  history: Message[],
  currentQuery: string
): BuiltPrompt {
  console.log('[PROMPT] Building prompt...');
  console.log('[PROMPT] Chunks: %d, History: %d messages', chunks.length, history.length);

  // Format chunks for insertion into system prompt
  const chunksText = formatChunksForPrompt(chunks);
  
  // Build system prompt with chunks
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{{CHUNKS}}', chunksText);

  // Build message history
  const messages: PromptMessage[] = [];

  // Add previous conversation
  for (const msg of history) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Add current query
  messages.push({
    role: 'user',
    content: currentQuery,
  });

  // Estimate tokens (rough: 1 token ≈ 4 chars)
  const totalChars = systemPrompt.length + messages.reduce((sum, m) => sum + m.content.length, 0);
  const tokenEstimate = Math.ceil(totalChars / 4);

  console.log('[PROMPT] System prompt: %d chars', systemPrompt.length);
  console.log('[PROMPT] Messages: %d', messages.length);
  console.log('[PROMPT] Estimated tokens: ~%d', tokenEstimate);

  return {
    systemPrompt,
    messages,
    tokenEstimate,
  };
}

// ----------------------------------------------------------------------------
// CHUNK FORMATTING
// ----------------------------------------------------------------------------

/**
 * Formats retrieved chunks for insertion into the system prompt
 */
function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return '[No relevant documents found]';
  }

  const formattedChunks = chunks.map((chunk, index) => {
    const header = `--- Chunk ${index + 1} of ${chunks.length} (similarity: ${(chunk.similarity * 100).toFixed(1)}%) ---`;
    const source = chunk.document_name 
      ? `Source: ${chunk.document_name} (${chunk.file_type || 'unknown type'})`
      : '';
    
    return `${header}\n${source}\n\n${chunk.content}`;
  });

  return formattedChunks.join('\n\n');
}

// ----------------------------------------------------------------------------
// ALTERNATIVE PROMPTS
// ----------------------------------------------------------------------------

/**
 * Builds a simple prompt without document context
 * Useful for general questions or when no chunks are found
 */
export function buildSimplePrompt(
  history: Message[],
  currentQuery: string
): BuiltPrompt {
  const systemPrompt = `You are a helpful assistant for a document management system. 
You can answer general questions, but for specific document queries, the user should upload documents first.
Be helpful and friendly.`;

  const messages: PromptMessage[] = history.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  messages.push({
    role: 'user',
    content: currentQuery,
  });

  const totalChars = systemPrompt.length + messages.reduce((sum, m) => sum + m.content.length, 0);

  return {
    systemPrompt,
    messages,
    tokenEstimate: Math.ceil(totalChars / 4),
  };
}

/**
 * Builds a focused prompt for a specific document type
 * Could be extended for lease-specific queries, etc.
 */
export function buildLeasePrompt(
  chunks: RetrievedChunk[],
  history: Message[],
  currentQuery: string
): BuiltPrompt {
  const leaseSystemPrompt = `You are a lease document assistant. You help property managers and tenants understand lease agreements.

IMPORTANT INSTRUCTIONS:
1. Focus on factual information from the lease documents
2. When discussing financial terms (rent, deposits), be precise
3. When discussing dates (lease term, move-in), use the exact dates from the documents
4. If information isn't in the documents, say so - don't guess
5. For legal questions, recommend consulting a lawyer

DOCUMENT CONTEXT:
{{CHUNKS}}

END OF DOCUMENT CONTEXT

Help the user understand their lease documents based on the above context.`;

  const chunksText = formatChunksForPrompt(chunks);
  const systemPrompt = leaseSystemPrompt.replace('{{CHUNKS}}', chunksText);

  const messages: PromptMessage[] = history.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  messages.push({
    role: 'user',
    content: currentQuery,
  });

  const totalChars = systemPrompt.length + messages.reduce((sum, m) => sum + m.content.length, 0);

  return {
    systemPrompt,
    messages,
    tokenEstimate: Math.ceil(totalChars / 4),
  };
}

// ----------------------------------------------------------------------------
// UTILITY EXPORTS
// ----------------------------------------------------------------------------

/**
 * Gets the raw system prompt template
 */
export function getSystemPromptTemplate(): string {
  return SYSTEM_PROMPT_TEMPLATE;
}

/**
 * Estimates token count for a string
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}