// ============================================================================
// CHAT ORCHESTRATOR
// ============================================================================
//
// This module wires together the complete chat pipeline:
//   retrieve → get history → build prompt → call LLM → save messages
//
// It's the single entry point for processing a chat message.
//
// PIPELINE FLOW:
// 1. retrieval.ts    - Find relevant document chunks
// 2. get-history.ts  - Fetch conversation context
// 3. prompt.ts       - Assemble the full prompt
// 4. llm.ts          - Get Claude's response
// 5. save-message.ts - Persist both messages
//
// USAGE:
// import { chat, chatWithNewConversation } from './orchestrator';
// const response = await chat(conversationId, 'What is the rent?');
//
// ============================================================================

import { retrieveChunks, RetrievalResult, RetrievalOptions } from './retrieval';
import { getConversationHistory, createConversation } from './get-history';
import { buildPrompt, buildSimplePrompt, BuiltPrompt } from './prompt';
import { callClaude, streamClaude, LLMResponse, estimateCost } from './llm';
import { saveMessage, saveMessagePair } from './save-message';
import { Message } from '../types';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ChatOptions {
  // Retrieval options
  topK?: number;
  minSimilarity?: number;
  
  // Skip saving to database (for testing)
  skipSave?: boolean;
  
  // Skip retrieval (for general questions)
  skipRetrieval?: boolean;
  
  // Streaming callback
  onStream?: (chunk: string) => void;
  
  // Progress callback
  onProgress?: (stage: ChatStage, message: string) => void;
}

export type ChatStage = 
  | 'retrieving'
  | 'building'
  | 'calling'
  | 'saving'
  | 'complete';

export interface ChatResult {
  // The assistant's response
  response: string;
  
  // Conversation tracking
  conversationId: string;
  userMessageId?: string;
  assistantMessageId?: string;
  
  // Pipeline details
  retrieval: RetrievalResult | null;
  prompt: BuiltPrompt;
  llm: LLMResponse;
  
  // Timing
  timing: {
    retrieval: number;
    promptBuild: number;
    llmCall: number;
    saving: number;
    total: number;
  };
  
  // Cost estimate
  estimatedCost: string;
}

// ----------------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------------

/**
 * Processes a chat message in an existing conversation
 * 
 * @param conversationId - UUID of the conversation
 * @param userMessage - The user's question
 * @param options - Chat configuration
 * @returns ChatResult with response and metadata
 */
export async function chat(
  conversationId: string,
  userMessage: string,
  options: ChatOptions = {}
): Promise<ChatResult> {
  const startTime = Date.now();
  const timing = {
    retrieval: 0,
    promptBuild: 0,
    llmCall: 0,
    saving: 0,
    total: 0,
  };

  const progress = options.onProgress || (() => {});

  console.log('\n' + '='.repeat(60));
  console.log('CHAT PIPELINE');
  console.log('='.repeat(60));
  console.log('\nConversation: %s', conversationId);
  console.log('Query: %s', userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : ''));

  // -------------------------------------------------------------------------
  // STAGE 1: RETRIEVAL (optional)
  // -------------------------------------------------------------------------
  let retrievalResult: RetrievalResult | null = null;

  if (!options.skipRetrieval) {
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 1: RETRIEVAL');
    console.log('-'.repeat(60));
    
    progress('retrieving', 'Searching for relevant documents...');
    const retrievalStart = Date.now();

    const retrievalOptions: RetrievalOptions = {
      topK: options.topK || 5,
      minSimilarity: options.minSimilarity || 0.3,
    };

    retrievalResult = await retrieveChunks(userMessage, retrievalOptions);
    
    timing.retrieval = Date.now() - retrievalStart;
    console.log('✓ Retrieved %d chunks in %dms', 
      retrievalResult.chunks.length, timing.retrieval);
  } else {
    console.log('\n[SKIPPED] Retrieval stage (skipRetrieval=true)');
  }

  // -------------------------------------------------------------------------
  // STAGE 2: GET HISTORY + BUILD PROMPT
  // -------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(60));
  console.log('STAGE 2: BUILD PROMPT');
  console.log('-'.repeat(60));
  
  progress('building', 'Building prompt...');
  const promptStart = Date.now();

  // Get conversation history
  const history = await getConversationHistory(conversationId);
  console.log('History: %d previous messages', history.length);

  // Build the prompt
  let prompt: BuiltPrompt;
  if (retrievalResult && retrievalResult.chunks.length > 0) {
    prompt = buildPrompt(retrievalResult.chunks, history, userMessage);
  } else {
    prompt = buildSimplePrompt(history, userMessage);
  }

  timing.promptBuild = Date.now() - promptStart;
  console.log('✓ Prompt built in %dms', timing.promptBuild);

  // -------------------------------------------------------------------------
  // STAGE 3: LLM CALL
  // -------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(60));
  console.log('STAGE 3: LLM CALL');
  console.log('-'.repeat(60));
  
  progress('calling', 'Getting response from Claude...');
  const llmStart = Date.now();

  let llmResponse: LLMResponse;
  if (options.onStream) {
    llmResponse = await streamClaude(prompt, options.onStream);
  } else {
    llmResponse = await callClaude(prompt);
  }

  timing.llmCall = Date.now() - llmStart;
  console.log('✓ LLM response in %dms', timing.llmCall);

  // -------------------------------------------------------------------------
  // STAGE 4: SAVE MESSAGES (optional)
  // -------------------------------------------------------------------------
  let userMessageId: string | undefined;
  let assistantMessageId: string | undefined;

  if (!options.skipSave) {
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 4: SAVE MESSAGES');
    console.log('-'.repeat(60));
    
    progress('saving', 'Saving to database...');
    const saveStart = Date.now();

    const { userMessage: savedUser, assistantMessage: savedAssistant } = 
      await saveMessagePair(conversationId, userMessage, llmResponse.content);
    
    userMessageId = savedUser.id;
    assistantMessageId = savedAssistant.id;

    timing.saving = Date.now() - saveStart;
    console.log('✓ Messages saved in %dms', timing.saving);
  } else {
    console.log('\n[SKIPPED] Save stage (skipSave=true)');
  }

  // -------------------------------------------------------------------------
  // COMPLETE
  // -------------------------------------------------------------------------
  timing.total = Date.now() - startTime;
  const cost = estimateCost(llmResponse.inputTokens, llmResponse.outputTokens);

  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE COMPLETE');
  console.log('='.repeat(60));
  console.log('\nTotal time: %ss', (timing.total / 1000).toFixed(1));
  console.log('Cost: %s', cost);

  progress('complete', 'Done');

  return {
    response: llmResponse.content,
    conversationId,
    userMessageId,
    assistantMessageId,
    retrieval: retrievalResult,
    prompt,
    llm: llmResponse,
    timing,
    estimatedCost: cost,
  };
}

/**
 * Starts a new conversation and processes the first message
 * 
 * @param userMessage - The user's question
 * @param options - Chat configuration
 * @returns ChatResult with response and new conversation ID
 */
export async function chatWithNewConversation(
  userMessage: string,
  options: ChatOptions = {}
): Promise<ChatResult> {
  console.log('[ORCHESTRATOR] Creating new conversation...');
  
  const conversation = await createConversation();
  console.log('[ORCHESTRATOR] Created conversation: %s', conversation.id);
  
  return chat(conversation.id, userMessage, options);
}

/**
 * Quick chat without persisting anything
 * Useful for testing retrieval and LLM without database overhead
 */
export async function chatQuick(
  userMessage: string,
  options: Omit<ChatOptions, 'skipSave'> = {}
): Promise<string> {
  // Create a temporary conversation ID
  const tempConvId = 'temp-' + Date.now();
  
  const result = await chat(tempConvId, userMessage, {
    ...options,
    skipSave: true,
  });
  
  return result.response;
}

// ----------------------------------------------------------------------------
// RETRIEVAL-ONLY EXPORT
// ----------------------------------------------------------------------------

/**
 * Just retrieves relevant chunks without calling LLM
 * Useful for testing/debugging retrieval quality
 */
export async function retrieveOnly(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult> {
  return retrieveChunks(query, options);
}

// ----------------------------------------------------------------------------
// RE-EXPORTS
// ----------------------------------------------------------------------------

export { createConversation, getConversationHistory } from './get-history';
export { retrieveChunks } from './retrieval';
export type { RetrievedChunk } from './retrieval';