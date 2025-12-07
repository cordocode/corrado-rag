// ============================================================================
// DOCUMENTS API ROUTE
// ============================================================================
//
// GET /api/documents - List all trained documents (or get single by ?id=)
// DELETE /api/documents - Delete a document and its chunks
//
// ============================================================================

import { NextRequest } from 'next/server';
import { supabase } from '@/src/supabase';
import { DEFAULT_USER_ID } from '@/src/lib/constants';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface DocumentListItem {
  id: string;
  original_name: string;
  file_type: string | null;
  status: string;
  uploaded_at: string;
  processed_at: string | null;
  chunk_count: number;
}

interface DocumentDetail extends DocumentListItem {
  full_text: string | null;
  custom_chips: Record<string, string>;
  chips: Record<string, string>;
}

// ----------------------------------------------------------------------------
// GET - List documents or get single document details
// ----------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('id');

    // If ID provided, return single document with details
    if (documentId) {
      return await getDocumentDetail(documentId);
    }

    // Otherwise, return list of all documents
    return await getDocumentList();

  } catch (error) {
    console.error('[DOCUMENTS API] GET error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// DELETE - Delete a document and its chunks
// ----------------------------------------------------------------------------

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();

    if (!body.id || typeof body.id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const documentId = body.id;
    console.log('[DOCUMENTS API] Deleting document: %s', documentId);

    // Delete chunks first (foreign key constraint)
    const { data: deletedChunks, error: chunksError } = await supabase
      .from('chip_chunks')
      .delete()
      .eq('document_id', documentId)
      .select('id');

    if (chunksError) {
      console.error('[DOCUMENTS API] Error deleting chunks:', chunksError);
      throw new Error(`Failed to delete chunks: ${chunksError.message}`);
    }

    const chunksDeleted = deletedChunks?.length || 0;
    console.log('[DOCUMENTS API] Deleted %d chunks', chunksDeleted);

    // Delete the document
    const { error: docError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (docError) {
      console.error('[DOCUMENTS API] Error deleting document:', docError);
      throw new Error(`Failed to delete document: ${docError.message}`);
    }

    console.log('[DOCUMENTS API] Document deleted successfully');

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        chunksDeleted,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[DOCUMENTS API] DELETE error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

async function getDocumentList(): Promise<Response> {
  console.log('[DOCUMENTS API] Fetching document list');

  // Get documents with chunk counts
  const { data: documents, error: docsError } = await supabase
    .from('documents')
    .select('id, original_name, file_type, status, uploaded_at, processed_at')
    .eq('user_id', DEFAULT_USER_ID)
    .order('uploaded_at', { ascending: false });

  if (docsError) {
    throw new Error(`Failed to fetch documents: ${docsError.message}`);
  }

  // Get chunk counts for each document
  const documentIds = (documents || []).map(d => d.id);
  
  let chunkCounts: Record<string, number> = {};
  
  if (documentIds.length > 0) {
    const { data: chunks, error: chunksError } = await supabase
      .from('chip_chunks')
      .select('document_id')
      .in('document_id', documentIds);

    if (chunksError) {
      console.warn('[DOCUMENTS API] Could not fetch chunk counts:', chunksError);
    } else {
      // Count chunks per document
      for (const chunk of chunks || []) {
        chunkCounts[chunk.document_id] = (chunkCounts[chunk.document_id] || 0) + 1;
      }
    }
  }

  // Build response
  const result: DocumentListItem[] = (documents || []).map(doc => ({
    id: doc.id,
    original_name: doc.original_name,
    file_type: doc.file_type,
    status: doc.status,
    uploaded_at: doc.uploaded_at,
    processed_at: doc.processed_at,
    chunk_count: chunkCounts[doc.id] || 0,
  }));

  console.log('[DOCUMENTS API] Returning %d documents', result.length);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getDocumentDetail(documentId: string): Promise<Response> {
  console.log('[DOCUMENTS API] Fetching document detail: %s', documentId);

  // Get document
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError) {
    if (docError.code === 'PGRST116') {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw new Error(`Failed to fetch document: ${docError.message}`);
  }

  // Get chunk count
  const { count: chunkCount } = await supabase
    .from('chip_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', documentId);

  // Extract chips from first chunk's content (if available)
  let chips: Record<string, string> = {};
  
  const { data: firstChunk } = await supabase
    .from('chip_chunks')
    .select('content')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })
    .limit(1)
    .single();

  if (firstChunk?.content) {
    chips = extractChipsFromContent(firstChunk.content);
  }

  const result: DocumentDetail = {
    id: doc.id,
    original_name: doc.original_name,
    file_type: doc.file_type,
    status: doc.status,
    uploaded_at: doc.uploaded_at,
    processed_at: doc.processed_at,
    chunk_count: chunkCount || 0,
    full_text: doc.full_text,
    custom_chips: doc.custom_chips || {},
    chips,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Extracts chip key-value pairs from chunk content
 * Parses the [DOCUMENT CONTEXT] header format
 */
function extractChipsFromContent(content: string): Record<string, string> {
  const chips: Record<string, string> = {};
  
  // Look for [DOCUMENT CONTEXT] section
  const contextMatch = content.match(/\[DOCUMENT CONTEXT\]([\s\S]*?)\[CONTENT\]/);
  if (!contextMatch) return chips;

  const contextSection = contextMatch[1];
  const lines = contextSection.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Match "Key Name: value" pattern
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      // Convert "Property Address" back to "property_address"
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      const value = match[2].trim();
      chips[key] = value;
    }
  }

  return chips;
}