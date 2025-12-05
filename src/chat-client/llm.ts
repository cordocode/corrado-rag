// ============================================================================
// LLM CLIENT (CLAUDE SONNET)
// ============================================================================
//
// This module handles the actual Claude API calls. It takes a built prompt
// and returns the assistant's response.
//
// Pipeline position:
//   prompt.ts → llm.ts → save-message.ts
//
// WHAT IT DOES:
// 1. Takes assembled system prompt and messages
// 2. Calls Claude Sonnet via the Anthropic SDK
// 3. Returns the response text
//
// WHY SONNET:
// Per the architecture doc, we use Claude Sonnet for chat responses because
// it's the best balance of quality and speed for conversational RAG.
// (Haiku is used for classification/extraction where speed matters more.)
//
// STREAMING:
// This module supports both streaming and non-streaming responses.
// For terminal testing, we use non-streaming. For UI, streaming is better.
//
// USAGE:
// import { callClaude, streamClaude } from './llm';
// const response = await callClaude(systemPrompt, messages);
//
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { BuiltPrompt, PromptMessage } from './prompt';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

// Claude Sonnet for quality responses
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Max tokens for response
const MAX_TOKENS = 4096;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface LLMResponse {
  content: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  responseTime: number;
}

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  // For streaming
  onChunk?: (chunk: string) => void;
}

// ----------------------------------------------------------------------------
// ANTHROPIC CLIENT (LAZY INITIALIZATION)
// ----------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

// ----------------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------------

/**
 * Calls Claude with the built prompt (non-streaming)
 * 
 * @param prompt - Built prompt from prompt.ts
 * @param options - Optional configuration
 * @returns LLMResponse with content and metadata
 */
export async function callClaude(
  prompt: BuiltPrompt,
  options: LLMOptions = {}
): Promise<LLMResponse> {
  console.log('[LLM] Calling Claude Sonnet...');
  console.log('[LLM] Model: %s', CLAUDE_MODEL);
  console.log('[LLM] Estimated input tokens: ~%d', prompt.tokenEstimate);

  const startTime = Date.now();

  try {
    const response = await getAnthropicClient().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: options.maxTokens || MAX_TOKENS,
      system: prompt.systemPrompt,
      messages: prompt.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    const responseTime = Date.now() - startTime;

    // Extract text content
    const textContent = response.content.find(block => block.type === 'text');
    const content = textContent && textContent.type === 'text' ? textContent.text : '';

    console.log('[LLM] Response received in %ss', (responseTime / 1000).toFixed(1));
    console.log('[LLM] Input tokens: %d, Output tokens: %d', 
      response.usage.input_tokens, response.usage.output_tokens);

    return {
      content,
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      responseTime,
    };

  } catch (error) {
    console.error('[LLM] Error:', error);
    throw error;
  }
}

/**
 * Calls Claude with raw system prompt and messages
 * (Alternative to using BuiltPrompt)
 */
export async function callClaudeRaw(
  systemPrompt: string,
  messages: PromptMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const prompt: BuiltPrompt = {
    systemPrompt,
    messages,
    tokenEstimate: Math.ceil((systemPrompt.length + messages.reduce((s, m) => s + m.content.length, 0)) / 4),
  };
  return callClaude(prompt, options);
}

/**
 * Streams Claude's response (for real-time UI updates)
 * 
 * @param prompt - Built prompt from prompt.ts
 * @param onChunk - Callback for each text chunk
 * @returns Final LLMResponse after stream completes
 */
export async function streamClaude(
  prompt: BuiltPrompt,
  onChunk: (chunk: string) => void
): Promise<LLMResponse> {
  console.log('[LLM] Streaming Claude Sonnet...');

  const startTime = Date.now();
  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = await getAnthropicClient().messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: prompt.systemPrompt,
      messages: prompt.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta) {
          fullContent += delta.text;
          onChunk(delta.text);
        }
      } else if (event.type === 'message_delta') {
        // Final usage stats
        if (event.usage) {
          outputTokens = event.usage.output_tokens;
        }
      } else if (event.type === 'message_start') {
        if (event.message.usage) {
          inputTokens = event.message.usage.input_tokens;
        }
      }
    }

    const responseTime = Date.now() - startTime;

    console.log('[LLM] Stream complete in %ss', (responseTime / 1000).toFixed(1));

    return {
      content: fullContent,
      stopReason: 'end_turn',
      inputTokens,
      outputTokens,
      responseTime,
    };

  } catch (error) {
    console.error('[LLM] Streaming error:', error);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// UTILITY EXPORTS
// ----------------------------------------------------------------------------

/**
 * Gets model info
 */
export function getModelInfo(): { model: string; maxTokens: number } {
  return {
    model: CLAUDE_MODEL,
    maxTokens: MAX_TOKENS,
  };
}

/**
 * Estimates cost for a request
 * Sonnet pricing: $3/1M input, $15/1M output
 */
export function estimateCost(inputTokens: number, outputTokens: number): string {
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  const total = inputCost + outputCost;
  return `$${total.toFixed(4)}`;
}