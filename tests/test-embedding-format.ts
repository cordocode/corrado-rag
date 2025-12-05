// ============================================================================
// DIAGNOSTIC: EMBEDDING FORMAT CHECK
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-embedding-format.ts
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
  console.log('EMBEDDING FORMAT DIAGNOSTIC');
  console.log('='.repeat(60) + '\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get a single chunk with its embedding
  const { data, error } = await supabase
    .from('chip_chunks')
    .select('id, embedding')
    .limit(1)
    .single();

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('Chunk ID:', data.id);
  console.log('');
  console.log('Embedding type:', typeof data.embedding);
  console.log('Is Array:', Array.isArray(data.embedding));
  console.log('');

  if (typeof data.embedding === 'string') {
    console.log('⚠️  EMBEDDING IS A STRING!');
    console.log('String length:', data.embedding.length);
    console.log('First 100 chars:', data.embedding.substring(0, 100));
    console.log('Last 50 chars:', data.embedding.substring(data.embedding.length - 50));
    
    // Try to see if it's a JSON string
    if (data.embedding.startsWith('[')) {
      console.log('\nLooks like a JSON array string. Trying to parse...');
      try {
        const parsed = JSON.parse(data.embedding);
        console.log('✓ Parsed successfully!');
        console.log('Parsed length:', parsed.length);
        console.log('First 5 values:', parsed.slice(0, 5));
      } catch (e) {
        console.log('❌ Failed to parse as JSON');
      }
    }
  } else if (Array.isArray(data.embedding)) {
    console.log('Embedding is an array');
    console.log('Length:', data.embedding.length);
    console.log('First 5 values:', data.embedding.slice(0, 5));
    console.log('Value types:', typeof data.embedding[0]);
  } else if (data.embedding && typeof data.embedding === 'object') {
    console.log('Embedding is an object');
    console.log('Keys:', Object.keys(data.embedding).slice(0, 10));
    console.log('Raw value sample:', JSON.stringify(data.embedding).substring(0, 200));
  }

  // Also check via raw SQL to see what Postgres actually has
  console.log('\n' + '-'.repeat(60));
  console.log('CHECKING VIA RAW QUERY');
  console.log('-'.repeat(60) + '\n');

  const { data: rawData, error: rawError } = await supabase
    .rpc('get_embedding_info', {});

  if (rawError) {
    console.log('Note: get_embedding_info function not found, which is expected.');
    console.log('The embedding column type in Supabase is what matters.');
  } else {
    console.log('Raw query result:', rawData);
  }

  // Check column info
  console.log('\n' + '-'.repeat(60));
  console.log('RECOMMENDATION');
  console.log('-'.repeat(60) + '\n');

  if (typeof data.embedding === 'string') {
    console.log('The embedding was stored as a STRING instead of a vector.');
    console.log('This happened during ingestion - the save-chunks.ts file');
    console.log('needs to format the embedding correctly for pgvector.');
    console.log('');
    console.log('You\'ll need to either:');
    console.log('1. Re-run ingestion with fixed save-chunks.ts');
    console.log('2. Or run a migration to convert existing embeddings');
  } else if (data.embedding?.length === 1536) {
    console.log('✓ Embedding looks correct (1536 dimensions)');
  } else {
    console.log('Unexpected embedding format. Length:', data.embedding?.length);
  }
}

main().catch(console.error);