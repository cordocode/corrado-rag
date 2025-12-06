// ============================================================================
// RE-INGEST ALL LEASES
// ============================================================================
//
// USAGE: npx tsx tests/reingest-all-leases.ts
//
// This script:
// 1. Deletes all existing documents and chip_chunks from Supabase
// 2. Re-ingests all PDFs from /users/cordo/documents/LEASES
// 3. Uses optimal parameters: 200w chunks, 25w overlap, 2 chips, prepend+append
//
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        process.env[trimmed.substring(0, idx)] = trimmed.substring(idx + 1);
      }
    }
  }
}

import { createClient } from '@supabase/supabase-js';
import { ingestDocument } from '../src/file-client/orchestrator';
import { getChunkerConfig } from '../src/file-client/chunker';

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------

const LEASE_DIRECTORY = '/users/cordo/documents/LEASES';

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('\n' + '='.repeat(70));
  console.log('RE-INGEST ALL LEASES');
  console.log('='.repeat(70));

  // Show chunker config
  const chunkerConfig = getChunkerConfig();
  console.log('\nChunker Configuration:');
  console.log('  Target chunk words: %d', chunkerConfig.targetChunkWords);
  console.log('  Overlap words: %d', chunkerConfig.overlapWords);
  console.log('  Chip position: %s', chunkerConfig.chipPosition);

  // Initialize Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Step 1: Delete existing data
  console.log('\n' + '-'.repeat(70));
  console.log('STEP 1: Clear existing data');
  console.log('-'.repeat(70));

  console.log('Deleting chip_chunks...');
  const { error: chunksError } = await supabase
    .from('chip_chunks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (chunksError) {
    console.error('Failed to delete chunks:', chunksError.message);
    process.exit(1);
  }

  console.log('Deleting documents...');
  const { error: docsError } = await supabase
    .from('documents')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (docsError) {
    console.error('Failed to delete documents:', docsError.message);
    process.exit(1);
  }

  console.log('✓ Cleared all existing data');

  // Step 2: Find all PDFs
  console.log('\n' + '-'.repeat(70));
  console.log('STEP 2: Find lease PDFs');
  console.log('-'.repeat(70));

  if (!fs.existsSync(LEASE_DIRECTORY)) {
    console.error('Directory not found: %s', LEASE_DIRECTORY);
    process.exit(1);
  }

  const pdfFiles = fs.readdirSync(LEASE_DIRECTORY)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(LEASE_DIRECTORY, f));

  console.log('Found %d PDF files:', pdfFiles.length);
  pdfFiles.forEach(f => console.log('  - %s', path.basename(f)));

  if (pdfFiles.length === 0) {
    console.error('No PDFs found!');
    process.exit(1);
  }

  // Step 3: Ingest each PDF
  console.log('\n' + '-'.repeat(70));
  console.log('STEP 3: Ingest documents');
  console.log('-'.repeat(70));

  const results: Array<{
    file: string;
    success: boolean;
    chunks?: number;
    error?: string;
    timeMs?: number;
  }> = [];

  for (let i = 0; i < pdfFiles.length; i++) {
    const pdfPath = pdfFiles[i];
    const fileName = path.basename(pdfPath);
    
    console.log('\n[%d/%d] Processing: %s', i + 1, pdfFiles.length, fileName);
    console.log('-'.repeat(50));

    const docStartTime = Date.now();

    try {
      const result = await ingestDocument(pdfPath);
      const docTimeMs = Date.now() - docStartTime;

      results.push({
        file: fileName,
        success: true,
        chunks: result.chunking.totalChunks,
        timeMs: docTimeMs,
      });

      console.log('✓ Complete: %d chunks in %ss', 
        result.chunking.totalChunks, 
        (docTimeMs / 1000).toFixed(1)
      );

    } catch (error) {
      const docTimeMs = Date.now() - docStartTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      results.push({
        file: fileName,
        success: false,
        error: errorMsg,
        timeMs: docTimeMs,
      });

      console.error('✗ Failed: %s', errorMsg);
    }

    // Small delay between documents to avoid rate limits
    if (i < pdfFiles.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Step 4: Summary
  const totalTime = Date.now() - startTime;
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalChunks = successful.reduce((sum, r) => sum + (r.chunks || 0), 0);

  console.log('\n' + '='.repeat(70));
  console.log('INGESTION COMPLETE');
  console.log('='.repeat(70));

  console.log('\nResults:');
  console.log('  Total documents: %d', results.length);
  console.log('  Successful: %d', successful.length);
  console.log('  Failed: %d', failed.length);
  console.log('  Total chunks created: %d', totalChunks);
  console.log('  Total time: %s minutes', (totalTime / 1000 / 60).toFixed(1));

  if (failed.length > 0) {
    console.log('\nFailed documents:');
    failed.forEach(r => console.log('  - %s: %s', r.file, r.error));
  }

  console.log('\nPer-document breakdown:');
  for (const r of results) {
    if (r.success) {
      console.log('  ✓ %s: %d chunks (%ss)', 
        r.file, r.chunks, ((r.timeMs || 0) / 1000).toFixed(1));
    } else {
      console.log('  ✗ %s: %s', r.file, r.error);
    }
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});