// ============================================================================
// LLM CLIENT (CLAUDE)
// ============================================================================
//
// This module handles communication with Claude for generating responses.
//
// Pipeline position:
//   retrieval.ts → get-history.ts → prompt.ts → llm.ts → save-message.ts
//
// WHAT IT DOES:
// 1. Takes the built prompt (system + messages)
// 2. Calls Claude API
// 3. Returns the assistant's response
//
// USAGE:
// import { generateResponse } from './llm';
// const response = await generateResponse(systemPrompt, messages);
//
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { PromptMessage } from './prompt';

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------

/** Claude model to use */
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

/** Maximum tokens in response */
const MAX_TOKENS = 4096;

/** Temperature (0 = deterministic, 1 = creative) */
const TEMPERATURE = 0.3;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface LLMResponse {
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
 * Generates a response from Claude
 * 
 * @param systemPrompt - System instructions with document context
 * @param messages - Conversation history + current user query
 * @returns LLMResponse with content and metadata
 */
export async function generateResponse(
  systemPrompt: string,
  messages: PromptMessage[]
): Promise<LLMResponse> {
  console.log('[LLM] Calling Claude...');
  console.log('[LLM] Model: %s', CLAUDE_MODEL);
  console.log('[LLM] Messages: %d', messages.length);

  const startTime = Date.now();

  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  const responseTimeMs = Date.now() - startTime;

  // Extract text content
  const textBlock = response.content.find(block => block.type === 'text');
  const content = textBlock && textBlock.type === 'text' ? textBlock.text : '';

  console.log('[LLM] Response received in %dms', responseTimeMs);
  console.log('[LLM] Tokens - input: %d, output: %d', 
    response.usage.input_tokens, 
    response.usage.output_tokens
  );
  console.log('[LLM] Stop reason: %s', response.stop_reason);

  return {
    content,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason || 'unknown',
    responseTimeMs,
  };
}

/**
 * Returns current configuration
 */
export function getLLMConfig(): {
  model: string;
  maxTokens: number;
  temperature: number;
} {
  return {
    model: CLAUDE_MODEL,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  };
}