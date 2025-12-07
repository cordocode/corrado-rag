// ============================================================================
// UPLOAD API ROUTE
// ============================================================================
//
// POST /api/upload - Upload file and start ingestion
// GET /api/upload?id= - Poll ingestion status
// PUT /api/upload - Update custom chips
// DELETE /api/upload - Cancel ingestion
//
// ============================================================================

import { NextRequest } from 'next/server';
import { writeFile, mkdir, unlink, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { supabase } from '@/src/supabase';
import { DEFAULT_USER_ID } from '@/src/lib/constants';
import { ingestDocument } from '@/src/file-client/orchestrator';
import { cancelIngestion } from '@/src/file-client/cancel';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface UploadStatus {
  status: 'pending' | 'processing' | 'complete' | 'error' | 'cancelled';
  progress: number;
  stage: string;
  documentId: string;
  fileName: string;
  fileType: string | null;
  extractedChips: Record<string, string>;
  customChips: Record<string, string>;
  error?: string;
}

// In-memory progress tracking (for v1 - would use Redis/DB in production)
const progressMap = new Map<string, UploadStatus>();

// ----------------------------------------------------------------------------
// POST - Upload file and start ingestion
// ----------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const fileName = file.name;
    const extension = path.extname(fileName).toLowerCase();

    // Validate file type
    if (!['.pdf', '.txt'].includes(extension)) {
      return new Response(
        JSON.stringify({ error: 'Unsupported file type. Use PDF or TXT.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[UPLOAD API] Received file: %s', fileName);

    // Create document record first
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        original_name: fileName,
        user_id: DEFAULT_USER_ID,
        status: 'pending',
      })
      .select('id')
      .single();

    if (docError) {
      throw new Error(`Failed to create document: ${docError.message}`);
    }

    const documentId = doc.id;
    console.log('[UPLOAD API] Created document: %s', documentId);

    // Save file to temp directory
    const tmpDir = path.join(process.cwd(), '.tmp-uploads');
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true });
    }

    const filePath = path.join(tmpDir, `${documentId}${extension}`);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    console.log('[UPLOAD API] Saved to: %s', filePath);

    // Initialize progress tracking
    progressMap.set(documentId, {
      status: 'processing',
      progress: 0,
      stage: 'Reading document...',
      documentId,
      fileName,
      fileType: null,
      extractedChips: {},
      customChips: {},
    });

    // Start ingestion in background (don't await)
    runIngestion(documentId, filePath, fileName, extension);

    return new Response(
      JSON.stringify({
        documentId,
        fileName,
        status: 'processing',
      }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UPLOAD API] POST error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// GET - Poll ingestion status
// ----------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('id');

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'id parameter required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check in-memory progress first
    const progress = progressMap.get(documentId);
    if (progress) {
      return new Response(JSON.stringify(progress), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fall back to database
    const { data: doc, error } = await supabase
      .from('documents')
      .select('id, original_name, file_type, status, custom_chips')
      .eq('id', documentId)
      .single();

    if (error || !doc) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const status: UploadStatus = {
      status: doc.status as UploadStatus['status'],
      progress: doc.status === 'complete' ? 100 : 0,
      stage: doc.status === 'complete' ? 'Complete' : doc.status,
      documentId: doc.id,
      fileName: doc.original_name,
      fileType: doc.file_type,
      extractedChips: {},
      customChips: doc.custom_chips || {},
    };

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[UPLOAD API] GET error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// PUT - Update custom chips
// ----------------------------------------------------------------------------

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();

    if (!body.id) {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { id, customChips } = body;

    const { data, error } = await supabase
      .from('documents')
      .update({ custom_chips: customChips || {} })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update: ${error.message}`);
    }

    // Update in-memory if exists
    const progress = progressMap.get(id);
    if (progress) {
      progress.customChips = customChips || {};
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[UPLOAD API] PUT error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// DELETE - Cancel ingestion
// ----------------------------------------------------------------------------

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();

    if (!body.id) {
      return new Response(
        JSON.stringify({ error: 'id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const documentId = body.id;
    console.log('[UPLOAD API] Cancelling: %s', documentId);

    // Update progress map
    const progress = progressMap.get(documentId);
    if (progress) {
      progress.status = 'cancelled';
      progress.stage = 'Cancelled';
    }

    // Cancel and cleanup
    const result = await cancelIngestion(documentId);

    // Remove from progress map
    progressMap.delete(documentId);

    // Cleanup temp files in .tmp-uploads
    const tmpUploadsDir = path.join(process.cwd(), '.tmp-uploads');
    for (const ext of ['.pdf', '.txt']) {
      const filePath = path.join(tmpUploadsDir, `${documentId}${ext}`);
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    }

    // Cleanup temp files in .tmp-ocr (page images)
    const tmpOcrDir = path.join(process.cwd(), '.tmp-ocr');
    if (existsSync(tmpOcrDir)) {
      try {
        const files = await readdir(tmpOcrDir);
        for (const file of files) {
          if (file.startsWith(documentId)) {
            await unlink(path.join(tmpOcrDir, file));
          }
        }
      } catch (e) {
        console.warn('[UPLOAD API] OCR cleanup warning:', e);
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[UPLOAD API] DELETE error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// BACKGROUND INGESTION
// ----------------------------------------------------------------------------

async function runIngestion(
  documentId: string,
  filePath: string,
  fileName: string,
  extension: string
): Promise<void> {
  const progress = progressMap.get(documentId);
  if (!progress) return;

  // Estimate based on file type - PDFs take much longer due to OCR
  const isPdf = extension === '.pdf';
  
  // Progress phases:
  // 0-70%: Extraction (slow, linear - this is the long part for PDFs)
  // 70-80%: Classification
  // 80-90%: Chunking  
  // 90-95%: Embedding
  // 95-100%: Saving

  let extractionInterval: ReturnType<typeof setInterval> | null = null;

  try {
    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Start slow extraction progress (0-70%)
    // For PDFs this simulates the page-by-page OCR
    // For TXT files, move faster
    const extractionDuration = isPdf ? 120000 : 5000; // 2 min for PDF, 5s for TXT
    const extractionTicks = extractionDuration / 500; // tick every 500ms
    const progressPerTick = 70 / extractionTicks;
    
    progress.stage = isPdf ? 'Extracting text from pages...' : 'Reading document...';
    
    extractionInterval = setInterval(() => {
      if (progress.status !== 'processing') {
        if (extractionInterval) clearInterval(extractionInterval);
        return;
      }
      if (progress.progress < 70) {
        progress.progress = Math.min(70, progress.progress + progressPerTick);
      }
    }, 500);

    // Run actual ingestion
    const result = await ingestDocument(filePath, {
      onProgress: (stage: string) => {
        if (progress.status !== 'processing') return;
        
        // Clear extraction interval once we get real progress
        if (extractionInterval) {
          clearInterval(extractionInterval);
          extractionInterval = null;
        }
        
        if (stage === 'classifying') {
          progress.progress = 72;
          progress.stage = 'Identifying document type...';
        } else if (stage === 'chunking') {
          progress.progress = 82;
          progress.stage = 'Breaking into knowledge pieces...';
        } else if (stage === 'embedding') {
          progress.progress = 90;
          progress.stage = 'Building semantic connections...';
        } else if (stage === 'saving') {
          progress.progress = 96;
          progress.stage = 'Finalizing training...';
        }
      },
    });

    if (extractionInterval) {
      clearInterval(extractionInterval);
    }

    // Update progress with results
    progress.status = 'complete';
    progress.progress = 100;
    progress.stage = 'Complete';
    progress.fileType = result.classification.file_type;
    progress.extractedChips = result.classification.chips;

    console.log('[UPLOAD API] Ingestion complete: %s', documentId);

  } catch (error) {
    if (extractionInterval) {
      clearInterval(extractionInterval);
    }
    
    console.error('[UPLOAD API] Ingestion error:', error);
    
    progress.status = 'error';
    progress.stage = 'Error';
    progress.error = error instanceof Error ? error.message : 'Unknown error';

    await supabase
      .from('documents')
      .update({ status: 'error' })
      .eq('id', documentId);

  } finally {
    // Cleanup temp upload file
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (e) {
      console.warn('[UPLOAD API] Upload cleanup warning:', e);
    }

    // Cleanup OCR temp files
    const tmpOcrDir = path.join(process.cwd(), '.tmp-ocr');
    if (existsSync(tmpOcrDir)) {
      try {
        const files = await readdir(tmpOcrDir);
        for (const file of files) {
          if (file.startsWith(documentId)) {
            await unlink(path.join(tmpOcrDir, file));
          }
        }
      } catch (e) {
        console.warn('[UPLOAD API] OCR cleanup warning:', e);
      }
    }

    // Remove from progress map after delay (allow final poll)
    setTimeout(() => {
      progressMap.delete(documentId);
    }, 30000);
  }
}