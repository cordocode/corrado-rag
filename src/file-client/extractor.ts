// ============================================================================
// TEXT EXTRACTOR (CLAUDE VISION)
// ============================================================================
//
// This module extracts raw text from uploaded files using Claude Vision.
// It's the first step in the ingestion pipeline.
//
// EXTRACTION METHOD:
// All PDFs are processed through Claude Vision for consistency. This ensures
// the same quality extraction whether a PDF is text-based or scanned.
//
// WHY CLAUDE VISION FOR ALL DOCS:
// - Handles tables with proper structure preservation
// - Reads handwritten annotations accurately
// - Understands document layout and context
// - Consistent output format across all document types
// - Far superior to traditional OCR for complex documents like leases
//
// SYSTEM DEPENDENCIES (macOS):
// - brew install poppler      (PDF to image conversion via pdftoppm)
//
// ENVIRONMENT VARIABLES:
// - ANTHROPIC_API_KEY         (for Claude Vision API)
//
// COST:
// - Using Haiku: ~$0.002 per page (very cheap)
// - 18-page lease ≈ $0.04
//
// TODO: PRODUCTION - Key changes needed for deployment:
// 1. FILESYSTEM: Replace process.cwd()/.tmp-ocr with /tmp (Vercel) or 
//    stream directly from Supabase Storage to avoid disk entirely
// 2. CONCURRENCY: Current cleanup wipes ALL temp files - must use unique
//    session IDs and only clean up that session to avoid race conditions
// 3. TIMEOUTS: Vercel has 60s limit. 18-page lease takes 60-90s. Need to
//    move to background job processing (Inngest, Trigger.dev, or Supabase
//    Edge Functions with longer timeout)
// 4. ARCHITECTURE: Upload should save to Supabase Storage, create DB record
//    with status='processing', then background worker handles extraction
//    and updates status='complete' when done
//
// USAGE:
// import { extractText } from './extractor';
// const text = await extractText('/path/to/lease.pdf');
//
// ============================================================================

// External packages
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

// Supported file extensions (lowercase)
const SUPPORTED_EXTENSIONS = ['.pdf', '.txt'];

// Claude model for vision extraction - Haiku is fast and cheap
const CLAUDE_MODEL = 'claude-3-5-haiku-20241022';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2000; // 2 seconds, doubles each retry

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ExtractionProgress {
  currentPage: number;
  totalPages: number;
  percentComplete: number;
}

export type ExtractionProgressCallback = (progress: ExtractionProgress) => void;

export interface ExtractOptions {
  onProgress?: ExtractionProgressCallback;
  signal?: AbortSignal;
}

// ----------------------------------------------------------------------------
// CLAUDE CLIENT (LAZY INITIALIZATION)
// ----------------------------------------------------------------------------
// We use lazy initialization because the module may be imported before
// environment variables are loaded. The client is created on first use.

let _anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

// ----------------------------------------------------------------------------
// EXTRACTION PROMPT
// ----------------------------------------------------------------------------
// 
// PROMPT DESIGN NOTES:
// - The prompt is structured to minimize instruction echo (where Claude
//   accidentally includes the prompt instructions in its output)
// - We put "Begin extraction now:" at the end to create a clear boundary
// - The image comes AFTER the text prompt so Claude processes instructions
//   first, then focuses on the image
// - Post-processing in stripInstructionEcho() catches any leakage
//
// ----------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are a document text extractor. Extract ALL visible text from the document image.

Format rules:
- Tables: Wrap in [TABLE] and [END TABLE] markers, use | for columns
- Handwritten text: Wrap in [HANDWRITTEN: content]
- Preserve section numbers (1.01, 1.02) exactly as shown
- Preserve paragraph breaks and logical structure

Output the extracted text only. Do not include any preamble, commentary, or explanation.

Begin extraction now:`;

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Extracts text from a file based on its extension
 * 
 * @param filePath - Absolute path to the file
 * @param options - Optional extraction options including progress callback
 * @returns Extracted text as a single string
 */
export async function extractText(
  filePath: string,
  options: ExtractOptions = {}
): Promise<string> {
  console.log('[EXTRACTOR] Starting extraction for:', filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const extension = path.extname(filePath).toLowerCase();
  console.log('[EXTRACTOR] Detected extension:', extension);

  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error(`Unsupported file type: ${extension}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }

  let extractedText: string;

  switch (extension) {
    case '.pdf':
      extractedText = await extractPdfText(filePath, options);
      break;
    case '.txt':
      extractedText = fs.readFileSync(filePath, 'utf-8');
      // For txt files, report immediate completion
      if (options.onProgress) {
        options.onProgress({ currentPage: 1, totalPages: 1, percentComplete: 100 });
      }
      break;
    default:
      throw new Error(`No extractor implemented for: ${extension}`);
  }

  console.log('[EXTRACTOR] Extraction complete. Character count:', extractedText.length);
  return extractedText;
}

// ----------------------------------------------------------------------------
// PDF EXTRACTION (ALWAYS VISION)
// ----------------------------------------------------------------------------

/**
 * Extracts text from a PDF using Claude Vision
 * We always use vision for consistency across all document types
 */
async function extractPdfText(
  filePath: string,
  options: ExtractOptions = {}
): Promise<string> {
  console.log('[EXTRACTOR] Using Claude Vision for PDF extraction...');

  // Get page count for logging and progress
  let pageCount = 0;
  try {
    const info = execSync(`pdfinfo "${filePath}"`, { encoding: 'utf-8' });
    const pageMatch = info.match(/Pages:\s+(\d+)/);
    pageCount = pageMatch ? parseInt(pageMatch[1], 10) : 0;
    console.log('[EXTRACTOR] PDF has %d pages', pageCount);
  } catch {
    console.log('[EXTRACTOR] Could not determine page count');
  }

  return await extractWithClaudeVision(filePath, pageCount, options);
}

// ----------------------------------------------------------------------------
// CLAUDE VISION EXTRACTION
// ----------------------------------------------------------------------------

/**
 * Extracts text from a PDF using Claude Vision
 * Processes ONE PAGE AT A TIME for reliability
 * 
 * TODO: PRODUCTION - This function needs refactoring for deployment:
 * 
 * 1. TIMEOUTS: 18 pages takes 60-90s, exceeds Vercel's 60s limit.
 *    → Move to background job (Inngest, Trigger.dev, or Supabase Edge Function)
 * 
 * 2. FILESYSTEM: Vercel serverless has no persistent filesystem at cwd.
 *    → Use /tmp (500MB limit) or stream directly from Supabase Storage to memory
 * 
 * 3. CONCURRENCY: Current cleanup wipes ALL temp files, breaking parallel requests.
 *    → Use unique session cleanup only, or avoid disk entirely
 * 
 * 4. PROGRESS: User has no visibility into processing status.
 *    → Update document.status in DB after each page, frontend polls for progress
 * 
 * 5. FILE SOURCE: Currently reads from local filepath.
 *    → In production, download from Supabase Storage URL instead
 */
async function extractWithClaudeVision(
  filePath: string,
  pageCount: number,
  options: ExtractOptions = {}
): Promise<string> {
  console.log('[EXTRACTOR] Starting Claude Vision extraction...');

  const { onProgress, signal } = options;

  // TODO: PRODUCTION - See function docstring for full list of production changes needed
  // Clean up any leftover temp files from previous runs
  const tmpBaseDir = path.join(process.cwd(), '.tmp-ocr'); // TODO: PRODUCTION - use /tmp on Vercel
  if (fs.existsSync(tmpBaseDir)) {
    console.log('[EXTRACTOR] Cleaning up old temp files...');
    fs.rmSync(tmpBaseDir, { recursive: true, force: true });
  }

  const sessionDir = path.join(tmpBaseDir, Date.now().toString());
  
  try {
    fs.mkdirSync(sessionDir, { recursive: true });

    // TODO: PRODUCTION - pdftoppm (poppler) won't be available on Vercel
    // Options: Use pdf.js for conversion, or pre-process PDFs before upload
    // Convert PDF to images (150 DPI JPEG for reasonable size)
    console.log('[EXTRACTOR] Converting PDF to images...');
    execSync(`pdftoppm -jpeg -r 150 "${filePath}" "${path.join(sessionDir, 'page')}"`, { stdio: 'pipe' });

    const imageFiles = fs.readdirSync(sessionDir)
      .filter(f => f.endsWith('.jpg'))
      .sort()
      .map(f => path.join(sessionDir, f));

    console.log('[EXTRACTOR] Generated %d page images', imageFiles.length);

    if (imageFiles.length === 0) {
      throw new Error('No images generated from PDF');
    }

    // Update pageCount if we now know the actual count
    const totalPages = imageFiles.length;

    // Report initial progress
    if (onProgress) {
      onProgress({ currentPage: 0, totalPages, percentComplete: 0 });
    }

    // Process EACH PAGE INDIVIDUALLY
    const pageTexts: string[] = [];
    
    for (let i = 0; i < imageFiles.length; i++) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new Error('Extraction cancelled');
      }

      const pageNum = i + 1;
      console.log('[EXTRACTOR] Processing page %d/%d...', pageNum, totalPages);
      
      const pageText = await processPageWithRetry(imageFiles[i], pageNum);
      pageTexts.push(`--- PAGE ${pageNum} ---\n\n${pageText}`);

      // Report progress after each page
      if (onProgress) {
        const percentComplete = Math.round((pageNum / totalPages) * 100);
        onProgress({ currentPage: pageNum, totalPages, percentComplete });
      }
    }

    return pageTexts.join('\n\n');

  } finally {
    // Cleanup
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('[EXTRACTOR] Cleanup warning:', e);
    }
  }
}

/**
 * Process a single page with retry logic
 */
async function processPageWithRetry(imagePath: string, pageNum: number): Promise<string> {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');
  const imageSizeKB = Math.round(imageData.length / 1024);
  
  console.log('[EXTRACTOR]   Image size: %d KB', imageSizeKB);

  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const startTime = Date.now();
      
      const response = await getAnthropicClient().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image
                }
              }
            ]
          }
        ]
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('[EXTRACTOR]   ✓ Page %d done in %ss', pageNum, duration);

      const textContent = response.content.find(block => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text in response');
      }

      // Post-process to remove any instruction echo
      const cleanedText = stripInstructionEcho(textContent.text);
      return cleanedText;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log('[EXTRACTOR]   ✗ Attempt %d failed: %s', attempt, lastError.message);
        console.log('[EXTRACTOR]   Retrying in %ds...', delay / 1000);
        await sleep(delay);
      }
    }
  }

  // All retries failed
  console.error('[EXTRACTOR]   ✗ Page %d failed after %d attempts', pageNum, MAX_RETRIES);
  return `[EXTRACTION FAILED FOR PAGE ${pageNum}: ${lastError?.message}]`;
}

// ----------------------------------------------------------------------------
// POST-PROCESSING
// ----------------------------------------------------------------------------

/**
 * Strips any instruction echo from Claude's response
 * 
 * Sometimes Claude accidentally includes parts of the extraction prompt
 * in its output. This function removes those artifacts.
 */
function stripInstructionEcho(text: string): string {
  let cleaned = text;
  
  // Pattern 1: Full instruction block echo
  // Matches "INSTRUCTIONS:" followed by numbered items until we hit real content
  cleaned = cleaned.replace(
    /^INSTRUCTIONS:\s*\n(?:.*\n)*?(?=\n[A-Z0-9]|\n\d+\.\d+|\n[A-Z]{2,})/i,
    ''
  );
  
  // Pattern 2: Format rules echo (from our new prompt style)
  // Matches "Format rules:" section if it appears
  cleaned = cleaned.replace(
    /^Format rules:\s*\n(?:.*\n)*?(?=\n[A-Z0-9]|\n\d+\.\d+|\n[A-Z]{2,})/i,
    ''
  );
  
  // Pattern 3: Example table from instructions
  // The fake example table with "Column 1", "Column 2", "value", etc.
  cleaned = cleaned.replace(
    /\[TABLE\]\s*\n\s*\|\s*Column\s+\d+.*\n.*\n.*value.*\n\s*\[END TABLE\]\s*\n?/gi,
    ''
  );
  
  // Pattern 4: "Begin extraction now:" or similar prompt artifacts
  cleaned = cleaned.replace(/^Begin extraction now:\s*\n?/i, '');
  cleaned = cleaned.replace(/^Output the extracted text only[.:\s]*\n?/i, '');
  
  // Pattern 5: Numbered instruction items (1. TABLES:, 2. HANDWRITING:, etc.)
  // Only remove if they appear at the very start of the text
  cleaned = cleaned.replace(
    /^\d+\.\s*(TABLES|HANDWRITING|Keep section|Preserve|Output)[:.].*\n?/gim,
    ''
  );
  
  // Clean up any resulting leading whitespace
  cleaned = cleaned.replace(/^\s+/, '');
  
  return cleaned;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}