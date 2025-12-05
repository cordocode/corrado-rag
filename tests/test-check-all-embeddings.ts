// ============================================================================
// CHECK EMBEDDING VALIDITY ACROSS ALL CHUNKS
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-check-all-embeddings.ts
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
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) {
        process.env[key] = valueParts.join('=');
      }
    }
  }
}

import { createClient } from '@supabase/supabase-js';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('EMBEDDING VALIDITY CHECK');
  console.log('='.repeat(60) + '\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get ALL chunks with their embeddings
  console.log('Fetching all chunks...\n');
  
  const { data: chunks, error } = await supabase
    .from('chip_chunks')
    .select('id, document_id, chunk_index, embedding')
    .order('document_id')
    .order('chunk_index');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('Total chunks: %d\n', chunks.length);

  // Analyze each embedding
  let valid = 0;
  let nullEmbedding = 0;
  let wrongDimensions = 0;
  let stringFormat = 0;
  let arrayFormat = 0;

  const byDocument: Record<string, { valid: number; invalid: number }> = {};

  for (const chunk of chunks) {
    const docId = chunk.document_id;
    if (!byDocument[docId]) {
      byDocument[docId] = { valid: 0, invalid: 0 };
    }

    if (!chunk.embedding) {
      nullEmbedding++;
      byDocument[docId].invalid++;
      continue;
    }

    let embeddingArray: number[] | null = null;

    if (typeof chunk.embedding === 'string') {
      stringFormat++;
      try {
        embeddingArray = JSON.parse(chunk.embedding);
      } catch (e) {
        byDocument[docId].invalid++;
        continue;
      }
    } else if (Array.isArray(chunk.embedding)) {
      arrayFormat++;
      embeddingArray = chunk.embedding;
    }

    if (embeddingArray) {
      if (embeddingArray.length === 1536) {
        valid++;
        byDocument[docId].valid++;
      } else {
        wrongDimensions++;
        byDocument[docId].invalid++;
        console.log('Chunk %s has wrong dimensions: %d', chunk.id, embeddingArray.length);
      }
    }
  }

  console.log('-'.repeat(60));
  console.log('SUMMARY');
  console.log('-'.repeat(60));
  console.log('Valid embeddings (1536 dims): %d', valid);
  console.log('Null embeddings: %d', nullEmbedding);
  console.log('Wrong dimensions: %d', wrongDimensions);
  console.log('');
  console.log('Format breakdown:');
  console.log('  String format: %d', stringFormat);
  console.log('  Array format: %d', arrayFormat);

  console.log('\n' + '-'.repeat(60));
  console.log('BY DOCUMENT');
  console.log('-'.repeat(60));

  // Get document names
  const { data: docs } = await supabase
    .from('documents')
    .select('id, original_name');

  const docNames: Record<string, string> = {};
  docs?.forEach(d => { docNames[d.id] = d.original_name; });

  for (const [docId, counts] of Object.entries(byDocument)) {
    const name = docNames[docId] || docId;
    console.log('%s:', name);
    console.log('  Valid: %d, Invalid: %d', counts.valid, counts.invalid);
  }

  // Now test: call match_chunks with threshold 0 and see how many come back
  console.log('\n' + '-'.repeat(60));
  console.log('MATCH_CHUNKS TEST (threshold=0, count=50)');
  console.log('-'.repeat(60) + '\n');

  // Create a dummy embedding
  const dummyEmbedding = new Array(1536).fill(0.01);
  
  const { data: matches, error: matchError } = await supabase.rpc('match_chunks', {
    query_embedding: dummyEmbedding,
    match_threshold: 0.0,
    match_count: 50  // Get up to 50
  });

  if (matchError) {
    console.log('Error calling match_chunks:', matchError.message);
  } else {
    console.log('Chunks returned by match_chunks: %d', matches?.length || 0);
    
    if (matches && matches.length > 0) {
      console.log('\nSimilarity distribution:');
      const similarities = matches.map((m: any) => m.similarity);
      console.log('  Min: %s', Math.min(...similarities).toFixed(4));
      console.log('  Max: %s', Math.max(...similarities).toFixed(4));
      console.log('  Avg: %s', (similarities.reduce((a: number, b: number) => a + b, 0) / similarities.length).toFixed(4));
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(console.error);