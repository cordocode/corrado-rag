// ============================================================================
// VECTOR RETRIEVAL (PGVECTOR SEARCH)
// ============================================================================
//
// This module handles semantic search against the chip_chunks table using
// pgvector's cosine similarity. It embeds the user's query and finds the
// most relevant document chunks.
//
// Pipeline position:
//   User Query → retrieval.ts → prompt.ts → llm.ts → response
//
// WHAT IT DOES:
// 1. Takes user's natural language query
// 2. Embeds query using OpenAI (same model as ingestion)
// 3. Performs cosine similarity search via pgvector
// 4. Returns top K most relevant chunks with metadata
//
// WHY COSINE SIMILARITY:
// - Works well with normalized embeddings
// - Scale-invariant (length of text doesn't skew results)
// - Standard choice for semantic search
//
// THE CHIP ADVANTAGE:
// Because chips are embedded WITH each chunk's content, searching for
// "John Smith's lease" naturally returns chunks from John Smith's lease
// even if those chunks don't mention his name - the chip header does.
//
// USAGE:
// import { retrieveChunks } from './retrieval';
// const chunks = await retrieveChunks('What is the rent for unit 204?');
//
// ============================================================================

import OpenAI from 'openai';
import { supabase } from '../supabase';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

// Must match the model used during ingestion
const EMBEDDING_MODEL = 'text-embedding-3-small';

// Default number of chunks to retrieve
const DEFAULT_TOP_K = 5;

// Minimum similarity threshold (0-1, cosine similarity)
// Chunks below this score are filtered out
const MIN_SIMILARITY_THRESHOLD = 0.3;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  similarity: number;
  // Joined from documents table
  document_name?: string;
  file_type?: string;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  query: string;
  queryEmbeddingTime: number;
  searchTime: number;
  totalTime: number;
}

export interface RetrievalOptions {
  topK?: number;
  minSimilarity?: number;
  // Filter by specific document IDs (optional)
  documentIds?: string[];
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
 * Retrieves relevant chunks for a query using vector similarity search
 * 
 * @param query - User's natural language question
 * @param options - Search configuration options
 * @returns RetrievalResult with ranked chunks
 */
export async function retrieveChunks(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult> {
  const startTime = Date.now();
  const topK = options.topK || DEFAULT_TOP_K;
  const minSimilarity = options.minSimilarity || MIN_SIMILARITY_THRESHOLD;

  console.log('[RETRIEVAL] Query: "%s"', query.substring(0, 100));
  console.log('[RETRIEVAL] Top K: %d, Min similarity: %s', topK, minSimilarity);

  // Step 1: Embed the query
  const embedStart = Date.now();
  const queryEmbedding = await embedQuery(query);
  const queryEmbeddingTime = Date.now() - embedStart;
  console.log('[RETRIEVAL] Query embedded in %dms', queryEmbeddingTime);

  // Step 2: Vector search
  const searchStart = Date.now();
  const chunks = await searchChunks(queryEmbedding, topK, minSimilarity, options.documentIds);
  const searchTime = Date.now() - searchStart;
  console.log('[RETRIEVAL] Search completed in %dms, found %d chunks', searchTime, chunks.length);

  const totalTime = Date.now() - startTime;

  return {
    chunks,
    query,
    queryEmbeddingTime,
    searchTime,
    totalTime,
  };
}

// ----------------------------------------------------------------------------
// QUERY EMBEDDING
// ----------------------------------------------------------------------------

/**
 * Embeds the query using OpenAI
 */
async function embedQuery(query: string): Promise<number[]> {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });

  return response.data[0].embedding;
}

// ----------------------------------------------------------------------------
// VECTOR SEARCH
// ----------------------------------------------------------------------------

/**
 * Performs cosine similarity search using pgvector
 * 
 * We use a raw SQL query because Supabase's JS client doesn't have
 * built-in support for pgvector operators. The <=> operator computes
 * cosine distance (1 - cosine_similarity), so we order ASC.
 */
async function searchChunks(
  queryEmbedding: number[],
  topK: number,
  minSimilarity: number,
  documentIds?: string[]
): Promise<RetrievedChunk[]> {
  // Convert embedding array to pgvector format: '[0.1,0.2,...]'
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Build the query
  // Note: 1 - (embedding <=> query) converts distance to similarity
  let query = `
    SELECT 
      cc.id,
      cc.document_id,
      cc.content,
      cc.chunk_index,
      1 - (cc.embedding <=> '${embeddingStr}'::vector) as similarity,
      d.original_name as document_name,
      d.file_type
    FROM chip_chunks cc
    LEFT JOIN documents d ON cc.document_id = d.id
    WHERE 1 - (cc.embedding <=> '${embeddingStr}'::vector) >= ${minSimilarity}
  `;

  // Add document filter if provided
  if (documentIds && documentIds.length > 0) {
    const idList = documentIds.map(id => `'${id}'`).join(',');
    query += ` AND cc.document_id IN (${idList})`;
  }

  query += `
    ORDER BY cc.embedding <=> '${embeddingStr}'::vector ASC
    LIMIT ${topK}
  `;

  const { data, error } = await supabase.rpc('exec_sql', { sql: query });

  // If RPC doesn't exist, fall back to direct query
  if (error && error.message.includes('function')) {
    console.log('[RETRIEVAL] RPC not available, using match_chunks function...');
    return await searchChunksWithFunction(queryEmbedding, topK, minSimilarity, documentIds);
  }

  if (error) {
    console.error('[RETRIEVAL] Search error:', error);
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return data || [];
}

/**
 * Alternative search using a Supabase function
 * This requires a function to be created in Supabase
 */
async function searchChunksWithFunction(
  queryEmbedding: number[],
  topK: number,
  minSimilarity: number,
  documentIds?: string[]
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: 0.0,
    match_count: topK,
  });

  if (error) {
    console.error('[RETRIEVAL] Function search error:', error);
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    document_id: row.document_id,
    content: row.content,
    chunk_index: row.chunk_index,
    similarity: row.similarity,
    document_name: row.document_name,
    file_type: row.file_type,
  }));
}

// ----------------------------------------------------------------------------
// UTILITY EXPORTS
// ----------------------------------------------------------------------------

/**
 * Gets stats about the chunks in the database
 */
export async function getChunkStats(): Promise<{
  totalChunks: number;
  totalDocuments: number;
  avgChunksPerDoc: number;
}> {
  const { count: chunkCount, error: chunkError } = await supabase
    .from('chip_chunks')
    .select('*', { count: 'exact', head: true });

  const { count: docCount, error: docError } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });

  if (chunkError || docError) {
    console.error('[RETRIEVAL] Stats error:', chunkError || docError);
    throw new Error('Failed to get chunk stats');
  }

  const totalChunks = chunkCount || 0;
  const totalDocuments = docCount || 0;
  const avgChunksPerDoc = totalDocuments > 0 ? Math.round(totalChunks / totalDocuments) : 0;

  return { totalChunks, totalDocuments, avgChunksPerDoc };
}

/**
 * Embeds text (exposed for testing)
 */
export async function embedText(text: string): Promise<number[]> {
  return embedQuery(text);
}