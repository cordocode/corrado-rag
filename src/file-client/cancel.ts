// ============================================================================
// INGESTION CANCELLATION
// ============================================================================
//
// This module handles cleanup when a user cancels document ingestion.
// It removes any partial data created during the ingestion process.
//
// WHAT IT DOES:
// 1. Deletes any chunks created for the document
// 2. Deletes the document record itself
// 3. Returns cleanup statistics
//
// WHY THIS MATTERS:
// - Users may cancel long-running ingestion (18-page PDFs take 60-90s)
// - Partial data would pollute the database and search results
// - Clean cancellation provides good UX
//
// USAGE:
// import { cancelIngestion } from './cancel';
// const result = await cancelIngestion(documentId);
// // result = { success: true, chunksDeleted: 5, documentDeleted: true }
//
// ============================================================================

import { supabase } from '../supabase';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface CancellationResult {
  success: boolean;
  documentId: string;
  chunksDeleted: number;
  documentDeleted: boolean;
  error?: string;
}

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Cancels an in-progress ingestion and cleans up partial data
 * 
 * @param documentId - UUID of the document being ingested
 * @returns CancellationResult with cleanup statistics
 */
export async function cancelIngestion(documentId: string): Promise<CancellationResult> {
  console.log('[CANCEL] Cancelling ingestion for document: %s', documentId);

  try {
    // Step 1: Delete any chunks that were created
    console.log('[CANCEL] Deleting chunks...');
    
    const { data: deletedChunks, error: chunksError } = await supabase
      .from('chip_chunks')
      .delete()
      .eq('document_id', documentId)
      .select('id');

    if (chunksError) {
      console.error('[CANCEL] Error deleting chunks:', chunksError);
      throw new Error(`Failed to delete chunks: ${chunksError.message}`);
    }

    const chunksDeleted = deletedChunks?.length || 0;
    console.log('[CANCEL] Deleted %d chunks', chunksDeleted);

    // Step 2: Delete the document record
    console.log('[CANCEL] Deleting document record...');
    
    const { error: docError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (docError) {
      console.error('[CANCEL] Error deleting document:', docError);
      throw new Error(`Failed to delete document: ${docError.message}`);
    }

    console.log('[CANCEL] Document deleted');

    console.log('[CANCEL] Cancellation complete');

    return {
      success: true,
      documentId,
      chunksDeleted,
      documentDeleted: true,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CANCEL] Cancellation failed:', errorMessage);

    return {
      success: false,
      documentId,
      chunksDeleted: 0,
      documentDeleted: false,
      error: errorMessage,
    };
  }
}

/**
 * Checks if a document exists and returns its current status
 * Useful for determining if cancellation is needed
 * 
 * @param documentId - UUID of the document
 * @returns Document status or null if not found
 */
export async function getDocumentStatus(documentId: string): Promise<{
  id: string;
  status: string;
  original_name: string;
} | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, status, original_name')
    .eq('id', documentId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Marks a document as cancelled without deleting it
 * Alternative to full deletion if you want to keep a record
 * 
 * @param documentId - UUID of the document
 * @returns Updated document status
 */
export async function markAsCancelled(documentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  console.log('[CANCEL] Marking document as cancelled: %s', documentId);

  const { error } = await supabase
    .from('documents')
    .update({
      status: 'cancelled',
      processed_at: new Date().toISOString(),
    })
    .eq('id', documentId);

  if (error) {
    console.error('[CANCEL] Error marking as cancelled:', error);
    return {
      success: false,
      error: error.message,
    };
  }

  return { success: true };
}

/**
 * Cleans up orphaned chunks (chunks without a parent document)
 * Utility function for maintenance
 * 
 * @returns Number of orphaned chunks deleted
 */
export async function cleanupOrphanedChunks(): Promise<number> {
  console.log('[CANCEL] Cleaning up orphaned chunks...');

  // Find chunks where document_id doesn't exist in documents table
  const { data: orphans, error: findError } = await supabase
    .from('chip_chunks')
    .select('id, document_id')
    .is('document_id', null);

  if (findError) {
    console.error('[CANCEL] Error finding orphans:', findError);
    return 0;
  }

  if (!orphans || orphans.length === 0) {
    console.log('[CANCEL] No orphaned chunks found');
    return 0;
  }

  const orphanIds = orphans.map(o => o.id);

  const { error: deleteError } = await supabase
    .from('chip_chunks')
    .delete()
    .in('id', orphanIds);

  if (deleteError) {
    console.error('[CANCEL] Error deleting orphans:', deleteError);
    return 0;
  }

  console.log('[CANCEL] Deleted %d orphaned chunks', orphanIds.length);
  return orphanIds.length;
}