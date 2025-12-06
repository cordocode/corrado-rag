// ============================================================================
// VECTOR RETRIEVAL (SEMANTIC SEARCH)
// ============================================================================
//
// This module handles semantic search over the chip_chunks table.
// It embeds the user's query and finds the most similar document chunks.
//
// Pipeline position:
//   User Query → retrieval.ts → prompt.ts → llm.ts → save-message.ts
//
// WHAT IT DOES:
// 1. Takes the user's question as plain text
// 2. Generates a vector embedding via OpenAI
// 3. Calls match_chunks() RPC in Supabase
// 4. Returns the top N most similar chunks with metadata
//
// CRITICAL NOTES:
// - Must use JSON.stringify() when passing embedding to match_chunks
// - match_chunks uses LANGUAGE sql (not plpgsql) to avoid pgvector bug
// - Similarity = 1 - cosine_distance (higher is better, max 1.0)
// - Threshold filtering happens at database level for efficiency
//
// USAGE:
// import { retrieveChunks } from './retrieval';
// const chunks = await retrieveChunks('When does the EP Minerals lease expire?');
//
// ============================================================================

import OpenAI from 'openai';
import { supabase } from '../supabase';

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------
// Adjust these parameters to tune retrieval behavior

/** Number of chunks to retrieve per query */
const CHUNKS_TO_RETRIEVE = 5;

/** Minimum similarity score (0-1). Chunks below this are filtered out at DB level. */
const SIMILARITY_THRESHOLD = 0.0;

/** OpenAI embedding model - must match what was used during ingestion */
const EMBEDDING_MODEL = 'text-embedding-3-small';

/** Expected embedding dimensions (must match database column) */
const EMBEDDING_DIMENSIONS = 1536;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface RetrievedChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  documentName: string;
  fileType: string;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  query: string;
  queryEmbeddingTokens: number;
  retrievalTimeMs: number;
}

// ----------------------------------------------------------------------------
// OPENAI CLIENT (LAZY INITIALIZATION)
// ----------------------------------------------------------------------------

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
 * Retrieves the most relevant chunks for a user query
 * 
 * @param query - The user's question in plain text
 * @param options - Optional overrides for chunk count and threshold
 * @returns RetrievalResult with chunks and metadata
 */
export async function retrieveChunks(
  query: string,
  options: {
    chunkCount?: number;
    similarityThreshold?: number;
  } = {}
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const chunkCount = options.chunkCount ?? CHUNKS_TO_RETRIEVE;
  const threshold = options.similarityThreshold ?? SIMILARITY_THRESHOLD;

  console.log('[RETRIEVAL] Starting retrieval...');
  console.log('[RETRIEVAL] Query: "%s"', query.substring(0, 100) + (query.length > 100 ? '...' : ''));
  console.log('[RETRIEVAL] Requesting top %d chunks (threshold: %s)', chunkCount, threshold);

  // Step 1: Generate query embedding
  console.log('[RETRIEVAL] Generating query embedding...');
  const embeddingStart = Date.now();
  
  const embeddingResponse = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });

  const embedding = embeddingResponse.data[0].embedding;
  const embeddingTokens = embeddingResponse.usage.total_tokens;
  const embeddingMs = Date.now() - embeddingStart;

  console.log('[RETRIEVAL] Embedding generated: %d dimensions, %d tokens, %dms',
    embedding.length, embeddingTokens, embeddingMs);

  // Validate embedding dimensions
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: got ${embedding.length}, expected ${EMBEDDING_DIMENSIONS}`
    );
  }

  // Step 2: Call match_chunks RPC
  console.log('[RETRIEVAL] Calling match_chunks RPC...');
  const searchStart = Date.now();

  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: chunkCount,
  });

  const searchMs = Date.now() - searchStart;

  if (error) {
    console.error('[RETRIEVAL] Supabase RPC error:', error);
    throw new Error(`Vector search failed: ${error.message}`);
  }

  console.log('[RETRIEVAL] Search complete: %d results in %dms', data?.length ?? 0, searchMs);

  // Step 3: Transform results
  const chunks: RetrievedChunk[] = (data || []).map((row: any) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    chunkIndex: row.chunk_index,
    similarity: row.similarity,
    documentName: row.document_name || 'Unknown',
    fileType: row.file_type || 'misc',
  }));

  // Log results summary
  if (chunks.length > 0) {
    console.log('[RETRIEVAL] Top result: %s (chunk %d, similarity: %.4f)',
      chunks[0].documentName, chunks[0].chunkIndex, chunks[0].similarity);
    console.log('[RETRIEVAL] Similarity range: %.4f - %.4f',
      chunks[chunks.length - 1].similarity, chunks[0].similarity);
  } else {
    console.log('[RETRIEVAL] No chunks found above threshold');
  }

  const totalMs = Date.now() - startTime;
  console.log('[RETRIEVAL] Total retrieval time: %dms', totalMs);

  return {
    chunks,
    query,
    queryEmbeddingTokens: embeddingTokens,
    retrievalTimeMs: totalMs,
  };
}

// ----------------------------------------------------------------------------
// UTILITY EXPORTS
// ----------------------------------------------------------------------------

/**
 * Embeds a query without searching (useful for testing)
 */
export async function embedQuery(query: string): Promise<number[]> {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  return response.data[0].embedding;
}

/**
 * Returns current configuration for debugging
 */
export function getRetrievalConfig(): {
  chunksToRetrieve: number;
  similarityThreshold: number;
  embeddingModel: string;
  embeddingDimensions: number;
} {
  return {
    chunksToRetrieve: CHUNKS_TO_RETRIEVE,
    similarityThreshold: SIMILARITY_THRESHOLD,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
  };
}