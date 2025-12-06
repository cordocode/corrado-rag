// ============================================================================
// STREAMING LLM CLIENT
// ============================================================================
//
// This module handles streaming responses from Claude for real-time chat.
// Used by the chat API route to send tokens as they're generated.
//
// WHAT IT DOES:
// 1. Takes the built prompt (system + messages)
// 2. Calls Claude API with streaming enabled
// 3. Yields tokens as they arrive via callback
// 4. Returns final metadata when complete
//
// USAGE:
// import { streamResponse } from './stream';
// 
// await streamResponse(systemPrompt, messages, {
//   onToken: (token) => sendToClient(token),
//   model: 'claude-sonnet-4-20250514',
// });
//
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { PromptMessage } from './prompt';
import { DEFAULT_CHAT_MODEL } from '../lib/constants';

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------

/** Maximum tokens in response */
const MAX_TOKENS = 4096;

/** Temperature (0 = deterministic, 1 = creative) */
const TEMPERATURE = 0.3;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface StreamOptions {
  /** Claude model to use */
  model?: string;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for response generation */
  temperature?: number;
  /** Callback for each token */
  onToken: (token: string) => void;
}

export interface StreamResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
  responseTimeMs: number;
}

// ----------------------------------------------------------------------------
// CLAUDE CLIENT (LAZY INITIALIZATION)
// ----------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Streams a response from Claude, calling onToken for each piece
 * 
 * @param systemPrompt - System instructions with document context
 * @param messages - Conversation history + current user query
 * @param options - Configuration including onToken callback
 * @returns StreamResult with final content and metadata
 */
export async function streamResponse(
  systemPrompt: string,
  messages: PromptMessage[],
  options: StreamOptions
): Promise<StreamResult> {
  const model = options.model || DEFAULT_CHAT_MODEL;
  const maxTokens = options.maxTokens || MAX_TOKENS;
  const temperature = options.temperature || TEMPERATURE;

  console.log('[STREAM] Starting streaming response...');
  console.log('[STREAM] Model: %s', model);
  console.log('[STREAM] Messages: %d', messages.length);

  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = 'unknown';

  const stream = await getAnthropicClient().messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  // Process the stream
  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if ('text' in delta) {
        const token = delta.text;
        fullContent += token;
        options.onToken(token);
      }
    } else if (event.type === 'message_start') {
      if (event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    } else if (event.type === 'message_delta') {
      if (event.usage) {
        outputTokens = event.usage.output_tokens;
      }
      if ('stop_reason' in event.delta && event.delta.stop_reason) {
        stopReason = event.delta.stop_reason;
      }
    }
  }

  const responseTimeMs = Date.now() - startTime;

  console.log('[STREAM] Stream complete in %dms', responseTimeMs);
  console.log('[STREAM] Tokens - input: %d, output: %d', inputTokens, outputTokens);
  console.log('[STREAM] Stop reason: %s', stopReason);
  console.log('[STREAM] Content length: %d chars', fullContent.length);

  return {
    content: fullContent,
    model,
    inputTokens,
    outputTokens,
    stopReason,
    responseTimeMs,
  };
}

/**
 * Creates a streaming chat response with full pipeline
 * Convenience function that combines retrieval, prompt building, and streaming
 * 
 * @param systemPrompt - System prompt with {chunks} placeholder already filled
 * @param messages - Formatted messages array
 * @param options - Stream options including onToken callback
 * @returns StreamResult
 */
export async function createStreamingResponse(
  systemPrompt: string,
  messages: PromptMessage[],
  options: StreamOptions
): Promise<StreamResult> {
  return streamResponse(systemPrompt, messages, options);
}