// ============================================================================
// SAVE DOCUMENT (SUPABASE)
// ============================================================================

import { supabase } from '../supabase';

export interface CreateDocumentResult {
  id: string;
  original_name: string;
  status: string;
}

/**
 * Creates a new document record with status 'processing'
 */
export async function createDocument(
  originalName: string
): Promise<CreateDocumentResult> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      original_name: originalName,
      status: 'processing',
    })
    .select('id, original_name, status')
    .single();

  if (error) throw new Error(`Failed to create document: ${error.message}`);
  return data;
}

/**
 * Marks document as complete with final data
 */
export async function updateDocumentComplete(
  documentId: string,
  fileType: string,
  fullText?: string
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({
      file_type: fileType,
      full_text: fullText,
      status: 'complete',
      processed_at: new Date().toISOString(),
    })
    .eq('id', documentId);

  if (error) throw new Error(`Failed to update document: ${error.message}`);
}

/**
 * Marks document as failed
 */
export async function updateDocumentError(documentId: string): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update({ status: 'error', processed_at: new Date().toISOString() })
    .eq('id', documentId);

  if (error) throw new Error(`Failed to update document: ${error.message}`);
}