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
//
// ============================================================================

import { retrieveChunks, RetrievalResult } from './retrieval';
import { getConversationHistory, createConversation, conversationExists } from './get-history';
import { buildPrompt, BuiltPrompt } from './prompt';
import { generateResponse, LLMResponse } from './llm';
import { saveMessagePair } from './save-message';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ChatResponse {
  // The assistant's answer
  answer: string;
  
  // Conversation tracking
  conversationId: string;
  
  // Retrieval info
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
  // Override number of chunks to retrieve
  chunkCount?: number;
  
  // Override similarity threshold
  similarityThreshold?: number;
  
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
 * @returns ChatResponse with answer and metadata
 */
export async function chat(
  conversationId: string | null,
  userMessage: string,
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const startTime = Date.now();

  console.log('\n' + '='.repeat(60));
  console.log('CHAT PIPELINE');
  console.log('='.repeat(60));
  console.log('User: "%s"', userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : ''));

  // Step 0: Ensure conversation exists
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

  // Step 1: Retrieve relevant chunks
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 1: RETRIEVAL');
  console.log('-'.repeat(60));

  const retrieval: RetrievalResult = await retrieveChunks(userMessage, {
    chunkCount: options.chunkCount,
    similarityThreshold: options.similarityThreshold,
  });

  // Step 2: Get conversation history
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 2: HISTORY');
  console.log('-'.repeat(60));

  const history = await getConversationHistory(convId);

  // Step 3: Build prompt
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 3: BUILD PROMPT');
  console.log('-'.repeat(60));

  const prompt: BuiltPrompt = buildPrompt(retrieval.chunks, history.messages, userMessage);

  // Step 4: Call LLM
  console.log('\n' + '-'.repeat(60));
  console.log('STEP 4: LLM');
  console.log('-'.repeat(60));

  const llmResponse: LLMResponse = await generateResponse(prompt.systemPrompt, prompt.messages);

  // Step 5: Save messages
  if (!options.skipSave) {
    console.log('\n' + '-'.repeat(60));
    console.log('STEP 5: SAVE');
    console.log('-'.repeat(60));

    await saveMessagePair(convId, userMessage, llmResponse.content);
  } else {
    console.log('\n[ORCHESTRATOR] Skipping save (skipSave=true)');
  }

  // Build response
  const totalTimeMs = Date.now() - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE COMPLETE');
  console.log('='.repeat(60));
  console.log('Total time: %dms', totalTimeMs);
  console.log('Tokens - embedding: %d, input: %d, output: %d',
    retrieval.queryEmbeddingTokens,
    llmResponse.inputTokens,
    llmResponse.outputTokens
  );

  return {
    answer: llmResponse.content,
    conversationId: convId,
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
 * @returns Just the answer string
 */
export async function quickChat(question: string): Promise<string> {
  const response = await chat(null, question, { skipSave: true });
  return response.answer;
}