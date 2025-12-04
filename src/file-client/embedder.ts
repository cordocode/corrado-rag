// ============================================================================
// VECTOR EMBEDDER (OPENAI)
// ============================================================================
//
// This module generates vector embeddings for chip-chunks using OpenAI's
// text-embedding-3-small model. These embeddings enable semantic search.
//
// Pipeline position:
//   extractor.ts → cleaner.ts → classifier.ts → chunker.ts → embedder.ts
//
// WHAT IT DOES:
// 1. Takes array of chip-chunks from chunker
// 2. Batches them for efficient API calls
// 3. Calls OpenAI embedding API
// 4. Returns chunks with their 1536-dimensional vectors
//
// WHY TEXT-EMBEDDING-3-SMALL:
// - Good balance of quality and cost
// - 1536 dimensions (same as ada-002, compatible with most vector DBs)
// - ~$0.00002 per 1K tokens (~$0.02 per 1M tokens)
// - A typical 18-page lease with 20 chunks costs ~$0.001
//
// BATCHING:
// OpenAI allows up to 2048 embeddings per request, but we batch at 100
// for reasonable response times and memory usage.
//
// USAGE:
// import { embedChunks } from './embedder';
// const embeddedChunks = await embedChunks(chunks);
//
// ============================================================================

import OpenAI from 'openai';
import { ChipChunk } from './chunker';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

// OpenAI embedding model
const EMBEDDING_MODEL = 'text-embedding-3-small';

// Dimensions for text-embedding-3-small
const EMBEDDING_DIMENSIONS = 1536;

// Max chunks per API request (OpenAI allows 2048, we use 100 for safety)
const BATCH_SIZE = 100;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface EmbeddedChunk extends ChipChunk {
  embedding: number[];       // 1536-dimensional vector
}

export interface EmbeddingResult {
  chunks: EmbeddedChunk[];
  totalChunks: number;
  totalTokens: number;
  estimatedCost: string;     // Estimated cost in USD
}

// ----------------------------------------------------------------------------
// OPENAI CLIENT (LAZY INITIALIZATION)
// ----------------------------------------------------------------------------
// We use lazy initialization because the module may be imported before
// environment variables are loaded. The client is created on first use.

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI();
  }
  return _openai;
}

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Generates embeddings for an array of chip-chunks
 * 
 * @param chunks - Array of chip-chunks from chunker
 * @returns EmbeddingResult with chunks containing their embeddings
 */
export async function embedChunks(chunks: ChipChunk[]): Promise<EmbeddingResult> {
  console.log('[EMBEDDER] Starting embedding generation...');
  console.log('[EMBEDDER] Chunks to embed: %d', chunks.length);
  console.log('[EMBEDDER] Model: %s', EMBEDDING_MODEL);

  const embeddedChunks: EmbeddedChunk[] = [];
  let totalTokens = 0;

  // Process in batches
  const batches = createBatches(chunks, BATCH_SIZE);
  console.log('[EMBEDDER] Batches: %d (size %d)', batches.length, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log('[EMBEDDER] Processing batch %d/%d (%d chunks)...', 
      i + 1, batches.length, batch.length);

    const result = await embedBatchWithRetry(batch);
    
    // Attach embeddings to chunks
    for (let j = 0; j < batch.length; j++) {
      embeddedChunks.push({
        ...batch[j],
        embedding: result.embeddings[j],
      });
    }

    totalTokens += result.tokens;
    console.log('[EMBEDDER]   ✓ Batch %d complete (%d tokens)', i + 1, result.tokens);
  }

  // Calculate estimated cost
  // text-embedding-3-small: $0.00002 per 1K tokens
  const costPer1KTokens = 0.00002;
  const estimatedCost = ((totalTokens / 1000) * costPer1KTokens).toFixed(6);

  console.log('[EMBEDDER] Complete. Total tokens: %d, Est. cost: $%s', 
    totalTokens, estimatedCost);

  return {
    chunks: embeddedChunks,
    totalChunks: embeddedChunks.length,
    totalTokens,
    estimatedCost: `$${estimatedCost}`,
  };
}

/**
 * Embeds a single piece of text (useful for query embedding)
 * 
 * @param text - Text to embed
 * @returns 1536-dimensional embedding vector
 */
export async function embedText(text: string): Promise<number[]> {
  console.log('[EMBEDDER] Embedding single text (%d chars)...', text.length);

  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

// ----------------------------------------------------------------------------
// BATCH PROCESSING
// ----------------------------------------------------------------------------

interface BatchResult {
  embeddings: number[][];
  tokens: number;
}

/**
 * Creates batches from an array
 */
function createBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Embeds a batch of chunks with retry logic
 */
async function embedBatchWithRetry(chunks: ChipChunk[]): Promise<BatchResult> {
  const texts = chunks.map(c => c.content);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const startTime = Date.now();

      const response = await getOpenAIClient().embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('[EMBEDDER]   API call completed in %ss', duration);

      // Extract embeddings in order
      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);

      return {
        embeddings,
        tokens: response.usage.total_tokens,
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Check if it's a rate limit error
      const isRateLimit = lastError.message.includes('rate') || 
                          lastError.message.includes('429');
      
      if (attempt < MAX_RETRIES) {
        const delay = isRateLimit 
          ? INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt)  // Longer backoff for rate limits
          : INITIAL_RETRY_DELAY_MS * attempt;
          
        console.log('[EMBEDDER]   ✗ Attempt %d failed: %s', attempt, lastError.message);
        console.log('[EMBEDDER]   Retrying in %ds...', delay / 1000);
        await sleep(delay);
      }
    }
  }

  throw new Error(`Embedding failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------------
// UTILITY EXPORTS
// ----------------------------------------------------------------------------

/**
 * Estimates embedding cost for a set of chunks
 * Uses rough token estimate: 1 token ≈ 4 characters
 */
export function estimateEmbeddingCost(chunks: ChipChunk[]): {
  estimatedTokens: number;
  estimatedCost: string;
} {
  const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  const costPer1KTokens = 0.00002;
  const cost = ((estimatedTokens / 1000) * costPer1KTokens).toFixed(6);
  
  return {
    estimatedTokens,
    estimatedCost: `$${cost}`,
  };
}

/**
 * Returns embedding model info
 */
export function getEmbeddingModelInfo(): {
  model: string;
  dimensions: number;
  costPer1KTokens: number;
} {
  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    costPer1KTokens: 0.00002,
  };
}