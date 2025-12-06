// ============================================================================
// CHAT ORCHESTRATOR
// ============================================================================
//
// This module wires together the complete chat pipeline:
//   retrieve → get history → build prompt → call LLM → save messages
//
// It's the single entry point for processing a user message and getting
// an AI response with document-grounded context.
//
// USAGE:
// import { chat, startConversation } from './orchestrator';
// 
// const conversationId = await startConversation();
// const response = await chat(conversationId, 'When does the lease expire?');
// console.log(response.answer);
// console.log(response.sources); // Full source data for citations
//
// ============================================================================

import { retrieveChunks, RetrievalResult, RetrievedChunk } from './retrieval';
import { getConversationHistory, createConversation, conversationExists } from './get-history';
import { buildPrompt, BuiltPrompt } from './prompt';
import { generateResponse, LLMResponse } from './llm';
import { saveMessagePair } from './save-message';
import { getEffectiveSettings } from '../lib/settings';
import { DEFAULT_USER_ID } from '../lib/constants';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface SourceChunk {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  fileType: string;
}

export interface ChatResponse {
  // The assistant's answer
  answer: string;
  
  // Conversation tracking
  conversationId: string;
  
  // Full source data for citations
  sources: SourceChunk[];
  
  // Retrieval info (for debugging/display)
  chunksUsed: number;
  topChunkSimilarity: number | null;
  
  // Token usage
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  
  // Timing
  retrievalTimeMs: number;
  llmTimeMs: number;
  totalTimeMs: number;
}

export interface ChatOptions {
  // User ID for settings lookup (defaults to localhost user)
  userId?: string;
  
  // Override number of chunks to retrieve
  chunkCount?: number;
  
  // Override similarity threshold
  similarityThreshold?: number;
  
  // Override system prompt
  systemPrompt?: string;
  
  // Override chat model
  model?: string;
  
  // Skip saving to database (useful for testing)
  skipSave?: boolean;
}

// ----------------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------------

/**
 * Starts a new conversation
 * 
 * @returns New conversation ID
 */
export async function startConversation(): Promise<string> {
  return createConversation();
}

/**
 * Processes a user message and returns an AI response
 * 
 * @param conversationId - UUID of the conversation (or null to create new)
 * @param userMessage - The user's question
 * @param options - Optional configuration overrides
 * @returns ChatResponse with answer, sources, and metadata
 */
export async function chat(
  conversationId: string | null,
  userMessage: string,
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const startTime = Date.now();
  const userId = options.userId || DEFAULT_USER_ID;

  console.log('\n' + '='.repeat(60));
  console.log('CHAT PIPELINE');
  console.log('='.repeat(60));
  console.log('User: "%s"', userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : ''));

  // Step 0: Load user settings
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 0: LOAD SETTINGS');
  console.log('-'.repeat(60));

  const settings = await getEffectiveSettings(userId);
  console.log('[ORCHESTRATOR] Settings loaded: chunks=%d, threshold=%s, model=%s',
    settings.chunks_per_query, settings.similarity_threshold, settings.chat_model);

  // Merge options with settings (options take precedence)
  const effectiveChunkCount = options.chunkCount ?? settings.chunks_per_query;
  const effectiveThreshold = options.similarityThreshold ?? settings.similarity_threshold;
  const effectivePrompt = options.systemPrompt ?? settings.system_prompt;
  const effectiveModel = options.model ?? settings.chat_model;

  // Step 1: Ensure conversation exists
  let convId = conversationId;
  if (!convId) {
    console.log('\n[ORCHESTRATOR] No conversation ID, creating new...');
    convId = await createConversation();
  } else {
    const exists = await conversationExists(convId);
    if (!exists) {
      console.log('\n[ORCHESTRATOR] Conversation not found, creating new...');
      convId = await createConversation();
    }
  }
  console.log('[ORCHESTRATOR] Conversation: %s', convId);

  // Step 2: Retrieve relevant chunks
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 1: RETRIEVAL');
  console.log('-'.repeat(60));

  const retrieval: RetrievalResult = await retrieveChunks(userMessage, {
    chunkCount: effectiveChunkCount,
    similarityThreshold: effectiveThreshold,
  });

  // Step 3: Get conversation history
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 2: HISTORY');
  console.log('-'.repeat(60));

  const history = await getConversationHistory(convId);

  // Step 4: Build prompt
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 3: BUILD PROMPT');
  console.log('-'.repeat(60));

  const prompt: BuiltPrompt = buildPrompt(
    retrieval.chunks,
    history.messages,
    userMessage,
    effectivePrompt
  );

  // Step 5: Call LLM
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 4: LLM');
  console.log('-'.repeat(60));

  const llmResponse: LLMResponse = await generateResponse(
    prompt.systemPrompt,
    prompt.messages,
    { model: effectiveModel }
  );

  // Step 6: Save messages
  if (!options.skipSave) {
    console.log('\n' + '-'.repeat(60));
    console.log('STEP 5: SAVE');
    console.log('-'.repeat(60));

    await saveMessagePair(convId, userMessage, llmResponse.content);
  } else {
    console.log('\n[ORCHESTRATOR] Skipping save (skipSave=true)');
  }

  // Build sources array for response
  const sources: SourceChunk[] = retrieval.chunks.map((chunk: RetrievedChunk) => ({
    id: chunk.id,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    similarity: chunk.similarity,
    fileType: chunk.fileType,
  }));

  // Build response
  const totalTimeMs = Date.now() - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE COMPLETE');
  console.log('='.repeat(60));
  console.log('Total time: %dms', totalTimeMs);
  console.log('Sources: %d chunks', sources.length);
  console.log('Tokens - embedding: %d, input: %d, output: %d',
    retrieval.queryEmbeddingTokens,
    llmResponse.inputTokens,
    llmResponse.outputTokens
  );

  return {
    answer: llmResponse.content,
    conversationId: convId,
    sources,
    chunksUsed: retrieval.chunks.length,
    topChunkSimilarity: retrieval.chunks.length > 0 ? retrieval.chunks[0].similarity : null,
    inputTokens: llmResponse.inputTokens,
    outputTokens: llmResponse.outputTokens,
    embeddingTokens: retrieval.queryEmbeddingTokens,
    retrievalTimeMs: retrieval.retrievalTimeMs,
    llmTimeMs: llmResponse.responseTimeMs,
    totalTimeMs,
  };
}

/**
 * Quick single-turn chat (no conversation history)
 * Creates a new conversation but doesn't save messages
 * 
 * @param question - The user's question
 * @param options - Optional configuration
 * @returns Just the answer string
 */
export async function quickChat(
  question: string,
  options: Omit<ChatOptions, 'skipSave'> = {}
): Promise<string> {
  const response = await chat(null, question, { ...options, skipSave: true });
  return response.answer;
}