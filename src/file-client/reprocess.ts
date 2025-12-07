// ============================================================================
// REPROCESS MODULE
// ============================================================================
//
// Re-processes a document when custom chips are added/modified.
// Skips extraction, cleaning, and classification (uses stored data).
// Only re-runs: chunking → embedding → save
//
// This is much faster than full ingestion since we skip OCR/vision.
//
// ============================================================================

import { supabase } from '@/src/supabase';
import { chunkDocument } from './chunker';
import type { ChunkerOptions } from './chunker';
import { embedChunks } from './embedder';
import type { EmbeddedChunk } from './embedder';
import { saveChunks } from './save-chunks';
import type { Chips } from '../types';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ReprocessOptions {
  // Chunker options (optional overrides)
  chunkerOptions?: ChunkerOptions;
  
  // Progress callback
  onProgress?: (stage: ReprocessStage, percent: number) => void;
}

export type ReprocessStage = 
  | 'fetching'
  | 'chunking'
  | 'embedding'
  | 'saving'
  | 'complete'
  | 'error';

export interface ReprocessResult {
  documentId: string;
  previousChunkCount: number;
  newChunkCount: number;
  totalTokens: number;
  estimatedCost: string;
  timing: {
    fetch: number;
    chunking: number;
    embedding: number;
    saving: number;
    total: number;
  };
}

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Reprocess a document with updated chips
 * 
 * @param documentId - Document ID to reprocess
 * @param customChips - New custom chips to merge with auto-extracted chips
 * @param options - Processing options
 * @returns ReprocessResult with timing and stats
 */
export async function reprocessDocument(
  documentId: string,
  customChips: Chips,
  options: ReprocessOptions = {}
): Promise<ReprocessResult> {
  const startTime = Date.now();
  const timing = {
    fetch: 0,
    chunking: 0,
    embedding: 0,
    saving: 0,
    total: 0,
  };

  const progress = options.onProgress || (() => {});

  console.log('\n' + '='.repeat(60));
  console.log('REPROCESS PIPELINE');
  console.log('='.repeat(60));
  console.log('\nDocument: %s', documentId);
  console.log('Custom chips: %s', JSON.stringify(customChips));

  try {
    // -------------------------------------------------------------------------
    // STAGE 1: FETCH DOCUMENT DATA
    // -------------------------------------------------------------------------
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 1: FETCH DOCUMENT');
    console.log('-'.repeat(60));
    
    progress('fetching', 0);
    const fetchStart = Date.now();

    // Fetch document with full_text and classification
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, original_name, file_type, full_text, auto_chips, custom_chips')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error(`Document not found: ${docError?.message || 'No data'}`);
    }

    if (!doc.full_text) {
      throw new Error('Document has no stored text. Full reprocessing required.');
    }

    if (!doc.file_type) {
      throw new Error('Document has no file_type. Full reprocessing required.');
    }

    // Count existing chunks
    const { count: previousChunkCount } = await supabase
      .from('chip_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);

    timing.fetch = Date.now() - fetchStart;
    console.log('✓ Fetched document: %s', doc.original_name);
    console.log('  File type: %s', doc.file_type);
    console.log('  Text length: %d chars', doc.full_text.length);
    console.log('  Existing chunks: %d', previousChunkCount || 0);
    
    progress('fetching', 10);

    // -------------------------------------------------------------------------
    // STAGE 2: MERGE CHIPS AND RE-CHUNK
    // -------------------------------------------------------------------------
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 2: CHUNKING');
    console.log('-'.repeat(60));
    
    progress('chunking', 15);
    const chunkStart = Date.now();

    // Merge auto-extracted chips with custom chips (custom takes precedence)
    const autoChips: Chips = doc.auto_chips || {};
    const mergedChips: Chips = {
      ...autoChips,
      ...customChips,
    };

    console.log('Auto chips: %s', JSON.stringify(autoChips));
    console.log('Custom chips: %s', JSON.stringify(customChips));
    console.log('Merged chips: %s', JSON.stringify(mergedChips));

    const chunkingResult = chunkDocument(
      doc.full_text,
      mergedChips,
      options.chunkerOptions
    );

    timing.chunking = Date.now() - chunkStart;
    console.log('✓ Created %d chunks (avg %d words) in %sms',
      chunkingResult.totalChunks,
      chunkingResult.averageWords,
      timing.chunking);
    console.log('  New chip header: %s', chunkingResult.chipHeader.substring(0, 100) + '...');

    progress('chunking', 30);

    // -------------------------------------------------------------------------
    // STAGE 3: EMBEDDING
    // -------------------------------------------------------------------------
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 3: EMBEDDING');
    console.log('-'.repeat(60));
    
    progress('embedding', 35);
    const embedStart = Date.now();

    const embeddingResult = await embedChunks(chunkingResult.chunks);

    timing.embedding = Date.now() - embedStart;
    console.log('✓ Embedded %d chunks (%d tokens, %s) in %ss',
      embeddingResult.totalChunks,
      embeddingResult.totalTokens,
      embeddingResult.estimatedCost,
      (timing.embedding / 1000).toFixed(1));

    progress('embedding', 75);

    // -------------------------------------------------------------------------
    // STAGE 4: DELETE OLD CHUNKS AND SAVE NEW
    // -------------------------------------------------------------------------
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 4: SAVE TO DATABASE');
    console.log('-'.repeat(60));
    
    progress('saving', 80);
    const saveStart = Date.now();

    // Delete existing chunks
    const { error: deleteError } = await supabase
      .from('chip_chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) {
      throw new Error(`Failed to delete old chunks: ${deleteError.message}`);
    }
    console.log('✓ Deleted %d old chunks', previousChunkCount || 0);

    // Save new chunks
    await saveChunks(documentId, embeddingResult.chunks as EmbeddedChunk[]);
    console.log('✓ Saved %d new chunks', chunkingResult.totalChunks);

    // Update document with new custom_chips and auto_chips
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        custom_chips: customChips,
        auto_chips: autoChips,  // Preserve auto chips
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }

    timing.saving = Date.now() - saveStart;
    console.log('✓ Database updated in %sms', timing.saving);

    progress('saving', 95);

    // -------------------------------------------------------------------------
    // COMPLETE
    // -------------------------------------------------------------------------
    timing.total = Date.now() - startTime;

    console.log('\n' + '='.repeat(60));
    console.log('REPROCESS COMPLETE');
    console.log('='.repeat(60));
    console.log('\nTotal time: %ss', (timing.total / 1000).toFixed(1));
    console.log('Chunks: %d → %d', previousChunkCount || 0, chunkingResult.totalChunks);
    console.log('Cost: %s', embeddingResult.estimatedCost);

    progress('complete', 100);

    return {
      documentId,
      previousChunkCount: previousChunkCount || 0,
      newChunkCount: chunkingResult.totalChunks,
      totalTokens: embeddingResult.totalTokens,
      estimatedCost: embeddingResult.estimatedCost,
      timing,
    };

  } catch (error) {
    console.error('\n[REPROCESS ERROR]', error);
    progress('error', 0);
    throw error;
  }
}