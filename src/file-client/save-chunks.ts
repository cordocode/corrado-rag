// ============================================================================
// SAVE CHUNKS (SUPABASE)
// ============================================================================

import { supabase } from '../supabase';
import type { EmbeddedChunk } from './embedder';

/**
 * Saves embedded chunks to the chip_chunks table
 */
export async function saveChunks(
  documentId: string,
  chunks: EmbeddedChunk[]
): Promise<void> {
  console.log('[SAVE-CHUNKS] Saving %d chunks for document %s', chunks.length, documentId);

  const rows = chunks.map(chunk => ({
    document_id: documentId,
    content: chunk.content,
    chunk_index: chunk.chunkIndex,
    embedding: chunk.embedding,
  }));

  const { error } = await supabase
    .from('chip_chunks')
    .insert(rows);

  if (error) {
    console.error('[SAVE-CHUNKS] Error:', error);
    throw new Error(`Failed to save chunks: ${error.message}`);
  }

  console.log('[SAVE-CHUNKS] Saved %d chunks', chunks.length);
}