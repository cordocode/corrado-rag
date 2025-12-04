// ============================================================================
// INGESTION ORCHESTRATOR
// ============================================================================
//
// This module wires together the complete ingestion pipeline:
//   extract → clean → classify → chunk → embed → save to Supabase
//
// It's the single entry point for processing a document from file to
// embedded chip-chunks stored in the database.
//
// PIPELINE FLOW:
// 1. save-document.ts - Create document record (status: processing)
// 2. extractor.ts     - Extract raw text from PDF/TXT
// 3. cleaner.ts       - Normalize text, remove artifacts
// 4. classifier.ts    - Determine file type + extract chip metadata
// 5. chunker.ts       - Split into chunks, prepend chip headers
// 6. embedder.ts      - Generate vector embeddings
// 7. save-chunks.ts   - Save chunks + embeddings to Supabase
// 8. save-document.ts - Update document (status: complete)
//
// USAGE:
// import { ingestDocument } from './orchestrator';
// const result = await ingestDocument('/path/to/lease.pdf');
//
// ============================================================================

import * as path from 'path';
import { extractText } from './extractor';
import { cleanText, getCleaningStats } from './cleaner';
import { classifyDocument, ClassificationResult, MOCK_TEMPLATES } from './classifier';
import type { FileTypeTemplate } from './classifier';
import { chunkDocument, ChunkingResult } from './chunker';
import type { ChunkerOptions } from './chunker';
import { embedChunks, EmbeddingResult } from './embedder';
import type { EmbeddedChunk } from './embedder';
import { createDocument, updateDocumentComplete, updateDocumentError } from './save-document';
import { saveChunks } from './save-chunks';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface IngestionOptions {
  // Chunker options
  chunkerOptions?: ChunkerOptions;
  
  // Templates to use (defaults to MOCK_TEMPLATES, in prod fetch from Supabase)
  templates?: FileTypeTemplate[];
  
  // Skip embedding (useful for testing earlier stages)
  skipEmbedding?: boolean;
  
  // Skip saving to Supabase (useful for local testing)
  skipSave?: boolean;
  
  // Progress callback for UI updates
  onProgress?: (stage: IngestionStage, message: string) => void;
}

export type IngestionStage = 
  | 'creating'
  | 'extracting'
  | 'cleaning'
  | 'classifying'
  | 'chunking'
  | 'embedding'
  | 'saving'
  | 'complete';

export interface IngestionResult {
  // Document ID from Supabase (null if skipSave)
  documentId: string | null;
  
  // Input info
  filePath: string;
  fileName: string;
  
  // Processing results
  extraction: {
    rawTextLength: number;
    extractionMethod: 'vision';
  };
  
  cleaning: {
    cleanedTextLength: number;
    reduction: string;
  };
  
  classification: ClassificationResult;
  
  chunking: {
    totalChunks: number;
    averageWords: number;
    chipHeader: string;
  };
  
  embedding: {
    totalTokens: number;
    estimatedCost: string;
  } | null;  // null if skipEmbedding=true
  
  // Final output
  chunks: EmbeddedChunk[] | ChunkingResult['chunks'];
  
  // Timing
  timing: {
    extraction: number;
    cleaning: number;
    classification: number;
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
 * Runs the complete ingestion pipeline on a document
 * 
 * @param filePath - Path to the document file
 * @param options - Pipeline configuration options
 * @returns IngestionResult with all processing outputs
 */
export async function ingestDocument(
  filePath: string,
  options: IngestionOptions = {}
): Promise<IngestionResult> {
  const startTime = Date.now();
  const timing = {
    extraction: 0,
    cleaning: 0,
    classification: 0,
    chunking: 0,
    embedding: 0,
    saving: 0,
    total: 0,
  };

  const templates = options.templates || MOCK_TEMPLATES;
  const progress = options.onProgress || (() => {});
  const fileName = path.basename(filePath);
  
  let documentId: string | null = null;

  console.log('\n' + '='.repeat(60));
  console.log('INGESTION PIPELINE');
  console.log('='.repeat(60));
  console.log('\nFile: %s', filePath);
  console.log('Templates: %s', templates.map(t => t.type_name).join(', '));

  try {
    // -------------------------------------------------------------------------
    // STAGE 0: CREATE DOCUMENT RECORD
    // -------------------------------------------------------------------------
    if (!options.skipSave) {
      console.log('\n' + '-'.repeat(60));
      console.log('STAGE 0: CREATE DOCUMENT RECORD');
      console.log('-'.repeat(60));
      
      progress('creating', 'Creating document record...');
      
      const doc = await createDocument(fileName);
      documentId = doc.id;
      
      console.log('✓ Created document: %s', documentId);
    }

    // -------------------------------------------------------------------------
    // STAGE 1: EXTRACTION
    // -------------------------------------------------------------------------
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 1: EXTRACTION');
    console.log('-'.repeat(60));
    
    progress('extracting', 'Extracting text from document...');
    const extractStart = Date.now();
    
    const rawText = await extractText(filePath);
    
    timing.extraction = Date.now() - extractStart;
    console.log('✓ Extracted %d characters in %ss', 
      rawText.length, (timing.extraction / 1000).toFixed(1));

    // Always vision now
    const extractionMethod = 'vision' as const;

    // -------------------------------------------------------------------------
    // STAGE 2: CLEANING
    // -------------------------------------------------------------------------
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 2: CLEANING');
    console.log('-'.repeat(60));
    
    progress('cleaning', 'Cleaning and normalizing text...');
    const cleanStart = Date.now();
    
    const cleanedText = cleanText(rawText);
    const cleaningStats = getCleaningStats(rawText, cleanedText);
    
    timing.cleaning = Date.now() - cleanStart;
    console.log('✓ Cleaned to %d characters (%s reduction) in %sms', 
      cleanedText.length, cleaningStats.reduction, timing.cleaning);

    // -------------------------------------------------------------------------
    // STAGE 3: CLASSIFICATION
    // -------------------------------------------------------------------------
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 3: CLASSIFICATION');
    console.log('-'.repeat(60));
    
    progress('classifying', 'Classifying document and extracting metadata...');
    const classifyStart = Date.now();
    
    const classification = await classifyDocument(cleanedText, templates);
    
    timing.classification = Date.now() - classifyStart;
    console.log('✓ Classified as "%s" (confidence: %s%%) in %ss', 
      classification.file_type, 
      (classification.confidence * 100).toFixed(0),
      (timing.classification / 1000).toFixed(1));

    // -------------------------------------------------------------------------
    // STAGE 4: CHUNKING
    // -------------------------------------------------------------------------
    console.log('\n' + '-'.repeat(60));
    console.log('STAGE 4: CHUNKING');
    console.log('-'.repeat(60));
    
    progress('chunking', 'Splitting into chunks...');
    const chunkStart = Date.now();
    
    const chunkingResult = chunkDocument(
      cleanedText, 
      classification.chips, 
      options.chunkerOptions
    );
    
    timing.chunking = Date.now() - chunkStart;
    console.log('✓ Created %d chunks (avg %d words) in %sms', 
      chunkingResult.totalChunks, 
      chunkingResult.averageWords,
      timing.chunking);

    // -------------------------------------------------------------------------
    // STAGE 5: EMBEDDING (optional)
    // -------------------------------------------------------------------------
    let embeddingResult: EmbeddingResult | null = null;
    let finalChunks: EmbeddedChunk[] | ChunkingResult['chunks'] = chunkingResult.chunks;

    if (!options.skipEmbedding) {
      console.log('\n' + '-'.repeat(60));
      console.log('STAGE 5: EMBEDDING');
      console.log('-'.repeat(60));
      
      progress('embedding', 'Generating vector embeddings...');
      const embedStart = Date.now();
      
      embeddingResult = await embedChunks(chunkingResult.chunks);
      finalChunks = embeddingResult.chunks;
      
      timing.embedding = Date.now() - embedStart;
      console.log('✓ Embedded %d chunks (%d tokens, %s) in %ss', 
        embeddingResult.totalChunks,
        embeddingResult.totalTokens,
        embeddingResult.estimatedCost,
        (timing.embedding / 1000).toFixed(1));
    } else {
      console.log('\n[SKIPPED] Embedding stage (skipEmbedding=true)');
    }

    // -------------------------------------------------------------------------
    // STAGE 6: SAVE TO SUPABASE (optional)
    // -------------------------------------------------------------------------
    if (!options.skipSave && !options.skipEmbedding && documentId) {
      console.log('\n' + '-'.repeat(60));
      console.log('STAGE 6: SAVE TO SUPABASE');
      console.log('-'.repeat(60));
      
      progress('saving', 'Saving to database...');
      const saveStart = Date.now();
      
      // Save chunks with embeddings
      await saveChunks(documentId, finalChunks as EmbeddedChunk[]);
      
      // Update document as complete
      await updateDocumentComplete(documentId, classification.file_type, cleanedText);
      
      timing.saving = Date.now() - saveStart;
      console.log('✓ Saved %d chunks to database in %sms', 
        chunkingResult.totalChunks, timing.saving);
    } else if (options.skipSave) {
      console.log('\n[SKIPPED] Save stage (skipSave=true)');
    }

    // -------------------------------------------------------------------------
    // COMPLETE
    // -------------------------------------------------------------------------
    timing.total = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(60));
    console.log('PIPELINE COMPLETE');
    console.log('='.repeat(60));
    console.log('\nTotal time: %ss', (timing.total / 1000).toFixed(1));
    if (documentId) {
      console.log('Document ID: %s', documentId);
    }
    
    progress('complete', 'Ingestion complete');

    return {
      documentId,
      filePath,
      fileName,
      
      extraction: {
        rawTextLength: rawText.length,
        extractionMethod,
      },
      
      cleaning: {
        cleanedTextLength: cleanedText.length,
        reduction: cleaningStats.reduction,
      },
      
      classification,
      
      chunking: {
        totalChunks: chunkingResult.totalChunks,
        averageWords: chunkingResult.averageWords,
        chipHeader: chunkingResult.chipHeader,
      },
      
      embedding: embeddingResult ? {
        totalTokens: embeddingResult.totalTokens,
        estimatedCost: embeddingResult.estimatedCost,
      } : null,
      
      chunks: finalChunks,
      
      timing,
    };

  } catch (error) {
    // Mark document as failed if we created one
    if (documentId) {
      try {
        await updateDocumentError(documentId);
        console.error('\n[ERROR] Pipeline failed, document marked as error');
      } catch (updateError) {
        console.error('\n[ERROR] Failed to update document status:', updateError);
      }
    }
    throw error;
  }
}

// ----------------------------------------------------------------------------
// UTILITY EXPORTS
// ----------------------------------------------------------------------------

/**
 * Runs pipeline without embedding or saving (fast, for testing)
 */
export async function ingestDocumentDry(
  filePath: string,
  options: Omit<IngestionOptions, 'skipEmbedding' | 'skipSave'> = {}
): Promise<IngestionResult> {
  return ingestDocument(filePath, { ...options, skipEmbedding: true, skipSave: true });
}

/**
 * Re-export types and templates for convenience
 */
export { MOCK_TEMPLATES } from './classifier';
export type { FileTypeTemplate } from './classifier';
export type { ChunkerOptions } from './chunker';
export type { EmbeddedChunk } from './embedder';