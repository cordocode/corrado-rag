// ============================================================================
// UPLOAD API ROUTE
// ============================================================================
//
// POST /api/upload - Upload file and start ingestion
// GET /api/upload?id= - Poll ingestion status
// PUT /api/upload - Update custom chips (triggers reprocessing)
// DELETE /api/upload - Cancel ingestion
//
// ============================================================================

import { NextRequest } from 'next/server';
import { writeFile, mkdir, unlink, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { supabase } from '@/src/supabase';
import { DEFAULT_USER_ID } from '@/src/lib/constants';
import { ingestDocument, IngestionStage, ProgressData } from '@/src/file-client/orchestrator';
import { reprocessDocument, ReprocessStage } from '@/src/file-client/reprocess';
import { cancelIngestion } from '@/src/file-client/cancel';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface UploadStatus {
  status: 'pending' | 'processing' | 'reprocessing' | 'complete' | 'error' | 'cancelled';
  progress: number;
  stage: string;
  documentId: string;
  fileName: string;
  fileType: string | null;
  extractedChips: Record<string, string>;
  customChips: Record<string, string>;
  error?: string;
  // Extraction progress details
  currentPage?: number;
  totalPages?: number;
}

// In-memory progress tracking (for v1 - would use Redis/DB in production)
const progressMap = new Map<string, UploadStatus>();

// AbortController map for cancellation support
const abortControllers = new Map<string, AbortController>();

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
      stage: 'Starting...',
      documentId,
      fileName,
      fileType: null,
      extractedChips: {},
      customChips: {},
      currentPage: 0,
      totalPages: 0,
    });

    // Create AbortController for this ingestion
    const abortController = new AbortController();
    abortControllers.set(documentId, abortController);

    // Start ingestion in background (don't await)
    runIngestion(documentId, filePath, fileName, abortController.signal);

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
      .select('id, original_name, file_type, status, auto_chips, custom_chips')
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
      extractedChips: doc.auto_chips || {},
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
// PUT - Update custom chips (triggers reprocessing)
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

    const { id: documentId, customChips } = body;
    const newCustomChips = customChips || {};

    console.log('[UPLOAD API] PUT chips for %s: %s', documentId, JSON.stringify(newCustomChips));

    // Fetch current document state
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('id, original_name, file_type, status, auto_chips, custom_chips')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if chips actually changed
    const currentCustomChips = doc.custom_chips || {};
    const chipsChanged = JSON.stringify(currentCustomChips) !== JSON.stringify(newCustomChips);

    if (!chipsChanged) {
      console.log('[UPLOAD API] Chips unchanged, skipping reprocess');
      return new Response(JSON.stringify({
        documentId,
        status: 'complete',
        message: 'No changes detected',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize progress tracking for reprocessing
    progressMap.set(documentId, {
      status: 'reprocessing',
      progress: 0,
      stage: 'Updating chips...',
      documentId,
      fileName: doc.original_name,
      fileType: doc.file_type,
      extractedChips: doc.auto_chips || {},
      customChips: newCustomChips,
    });

    // Update document status to reprocessing
    await supabase
      .from('documents')
      .update({ status: 'reprocessing' })
      .eq('id', documentId);

    // Start reprocessing in background (don't await)
    runReprocess(documentId, newCustomChips);

    return new Response(JSON.stringify({
      documentId,
      status: 'reprocessing',
      message: 'Reprocessing started',
    }), {
      status: 202,
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

    // Abort the running ingestion if possible
    const abortController = abortControllers.get(documentId);
    if (abortController) {
      abortController.abort();
      abortControllers.delete(documentId);
      console.log('[UPLOAD API] Sent abort signal');
    }

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
  signal: AbortSignal
): Promise<void> {
  const progress = progressMap.get(documentId);
  if (!progress) return;

  try {
    // Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Run actual ingestion with all the proper parameters
    const result = await ingestDocument(filePath, {
      documentId: documentId,
      fileName: fileName,
      signal: signal,
      onProgress: (stage: IngestionStage, percent: number, data?: ProgressData) => {
        if (progress.status !== 'processing') return;
        
        progress.progress = percent;
        
        // Update page progress if available
        if (data?.currentPage !== undefined) {
          progress.currentPage = data.currentPage;
        }
        if (data?.totalPages !== undefined) {
          progress.totalPages = data.totalPages;
        }
        
        // Map stage to user-friendly message
        switch (stage) {
          case 'creating':
            progress.stage = 'Preparing document...';
            break;
          case 'extracting':
            // Show page-level progress during extraction
            if (progress.totalPages && progress.totalPages > 0) {
              if (progress.currentPage === 0) {
                progress.stage = 'Converting PDF to images...';
              } else {
                progress.stage = `Extracting text from page ${progress.currentPage} of ${progress.totalPages}...`;
              }
            } else {
              progress.stage = 'Extracting text...';
            }
            break;
          case 'cleaning':
            progress.stage = 'Cleaning and normalizing...';
            break;
          case 'classifying':
            progress.stage = 'Identifying document type...';
            if (data?.fileType) {
              progress.fileType = data.fileType;
            }
            if (data?.chips) {
              progress.extractedChips = data.chips;
            }
            break;
          case 'chunking':
            progress.stage = 'Breaking into knowledge pieces...';
            break;
          case 'embedding':
            progress.stage = 'Building semantic connections...';
            break;
          case 'saving':
            progress.stage = 'Finalizing training...';
            break;
          case 'complete':
            progress.stage = 'Complete';
            if (data?.fileType) {
              progress.fileType = data.fileType;
            }
            if (data?.chips) {
              progress.extractedChips = data.chips;
            }
            break;
          case 'cancelled':
            progress.stage = 'Cancelled';
            progress.status = 'cancelled';
            break;
          case 'error':
            progress.stage = 'Error';
            progress.status = 'error';
            if (data?.error) {
              progress.error = data.error;
            }
            break;
        }
      },
    });

    // Save auto_chips to document for future reprocessing
    await supabase
      .from('documents')
      .update({ auto_chips: result.classification.chips })
      .eq('id', documentId);

    // Update progress with final results
    progress.status = 'complete';
    progress.progress = 100;
    progress.stage = 'Complete';
    progress.fileType = result.classification.file_type;
    progress.extractedChips = result.classification.chips;

    console.log('[UPLOAD API] Ingestion complete: %s', documentId);

  } catch (error) {
    const isCancelled = signal.aborted;
    
    if (isCancelled) {
      console.log('[UPLOAD API] Ingestion cancelled: %s', documentId);
      progress.status = 'cancelled';
      progress.stage = 'Cancelled';
    } else {
      console.error('[UPLOAD API] Ingestion error:', error);
      
      progress.status = 'error';
      progress.stage = 'Error';
      progress.error = error instanceof Error ? error.message : 'Unknown error';

      await supabase
        .from('documents')
        .update({ status: 'error' })
        .eq('id', documentId);
    }

  } finally {
    // Cleanup abort controller
    abortControllers.delete(documentId);
    
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

// ----------------------------------------------------------------------------
// BACKGROUND REPROCESSING
// ----------------------------------------------------------------------------

async function runReprocess(
  documentId: string,
  customChips: Record<string, string>
): Promise<void> {
  const progress = progressMap.get(documentId);
  if (!progress) return;

  try {
    const result = await reprocessDocument(documentId, customChips, {
      onProgress: (stage: ReprocessStage, percent: number) => {
        if (progress.status !== 'reprocessing') return;
        
        progress.progress = percent;
        
        switch (stage) {
          case 'fetching':
            progress.stage = 'Loading document...';
            break;
          case 'chunking':
            progress.stage = 'Rebuilding chunks...';
            break;
          case 'embedding':
            progress.stage = 'Regenerating embeddings...';
            break;
          case 'saving':
            progress.stage = 'Saving changes...';
            break;
          case 'complete':
            progress.stage = 'Complete';
            break;
          case 'error':
            progress.stage = 'Error';
            progress.status = 'error';
            break;
        }
      },
    });

    // Update document status back to complete
    await supabase
      .from('documents')
      .update({ status: 'complete' })
      .eq('id', documentId);

    // Update progress
    progress.status = 'complete';
    progress.progress = 100;
    progress.stage = 'Complete';
    progress.customChips = customChips;

    console.log('[UPLOAD API] Reprocess complete: %s (%d → %d chunks)',
      documentId, result.previousChunkCount, result.newChunkCount);

  } catch (error) {
    console.error('[UPLOAD API] Reprocess error:', error);
    
    progress.status = 'error';
    progress.stage = 'Error';
    progress.error = error instanceof Error ? error.message : 'Unknown error';

    await supabase
      .from('documents')
      .update({ status: 'error' })
      .eq('id', documentId);

  } finally {
    // Remove from progress map after delay
    setTimeout(() => {
      progressMap.delete(documentId);
    }, 30000);
  }
}