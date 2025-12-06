// ============================================================================
// TEST: Vector Search with TEXT parameter
// ============================================================================
//
// 1. Run fix-match-chunks-v3.sql in Supabase SQL Editor
// 2. Save this as tests/test-v3.ts
// 3. Run: npx tsx tests/test-v3.ts
//
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
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
import OpenAI from 'openai';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const openai = new OpenAI();

  console.log('═'.repeat(50));
  console.log('VECTOR SEARCH TEST v3');
  console.log('═'.repeat(50));

  const query = 'when does the EP minerals lease expire';
  console.log('\nQuery: "%s"\n', query);

  // Generate embedding
  console.log('1. Generating embedding...');
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const embedding = response.data[0].embedding;
  console.log('   ✓ Generated %d-dimensional embedding', embedding.length);

  // Convert to JSON string - this is what the function expects
  const embeddingJson = JSON.stringify(embedding);
  console.log('   JSON string length: %d chars', embeddingJson.length);

  // First, let's see what PostgreSQL actually receives
  console.log('\n2. Calling debug_input to see what PostgreSQL receives...');
  const { data: debugData, error: debugError } = await supabase.rpc('debug_input', {
    query_embedding: embeddingJson,
  });
  
  if (debugError) {
    console.log('   debug_input error:', debugError.message);
  } else if (debugData && debugData[0]) {
    const d = debugData[0];
    console.log('   PostgreSQL received:');
    console.log('     input_length: %d', d.input_length);
    console.log('     input_type: %s', d.input_type);
    console.log('     first_50_chars: %s', d.first_50_chars);
    console.log('     last_50_chars: %s', d.last_50_chars);
    console.log('     starts_with_bracket: %s', d.starts_with_bracket);
    console.log('     ends_with_bracket: %s', d.ends_with_bracket);
    console.log('     can_cast_to_json: %s', d.can_cast_to_json);
    console.log('     array_length_if_valid: %s', d.array_length_if_valid);
  }

  // Call match_chunks with the JSON string
  console.log('\n3. Calling match_chunks...');
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: embeddingJson,  // Pass as JSON string
    match_threshold: 0.0,
    match_count: 5,
  });

  if (error) {
    console.log('   ✗ Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('   ✗ No results returned');
    console.log('\n' + '─'.repeat(50));
    console.log('DEBUGGING: Investigating why...');
    console.log('─'.repeat(50));

    // Debug 1: Check if chunks exist at all
    const { count: totalChunks } = await supabase
      .from('chip_chunks')
      .select('*', { count: 'exact', head: true });
    console.log('\n[DEBUG 1] Total chunks in table: %d', totalChunks);

    // Debug 2: Check if embeddings are non-null
    const { data: nullCheck } = await supabase
      .from('chip_chunks')
      .select('id')
      .is('embedding', null);
    console.log('[DEBUG 2] Chunks with NULL embedding: %d', nullCheck?.length || 0);

    // Debug 3: Check what the function actually received
    console.log('\n[DEBUG 3] What we sent to match_chunks:');
    console.log('   Parameter name: query_embedding');
    console.log('   Type: %s', typeof embeddingJson);
    console.log('   First 100 chars: %s...', embeddingJson.substring(0, 100));
    console.log('   Last 50 chars: ...%s', embeddingJson.substring(embeddingJson.length - 50));
    console.log('   Starts with "[": %s', embeddingJson.startsWith('['));
    console.log('   Ends with "]": %s', embeddingJson.endsWith(']'));

    // Debug 4: Verify embedding array is valid
    console.log('\n[DEBUG 4] Embedding array validation:');
    console.log('   Original array length: %d', embedding.length);
    console.log('   First 3 values: [%s]', embedding.slice(0, 3).join(', '));
    console.log('   Last 3 values: [%s]', embedding.slice(-3).join(', '));
    console.log('   Contains NaN: %s', embedding.some(v => isNaN(v)));
    console.log('   Contains Infinity: %s', embedding.some(v => !isFinite(v)));

    // Debug 5: Try calling the function with a simpler test
    console.log('\n[DEBUG 5] Testing function with simple vector...');
    const simpleEmbedding = JSON.stringify(new Array(1536).fill(0.1));
    const { data: simpleResult, error: simpleError } = await supabase.rpc('match_chunks', {
      query_embedding: simpleEmbedding,
      match_threshold: 0.0,
      match_count: 5,
    });
    if (simpleError) {
      console.log('   Simple test ERROR: %s', simpleError.message);
    } else {
      console.log('   Simple test returned: %d rows', simpleResult?.length || 0);
    }

    // Debug 6: Check what functions exist
    console.log('\n[DEBUG 6] Checking match_chunks function exists...');
    const { data: funcCheck, error: funcError } = await supabase
      .rpc('match_chunks', {
        query_embedding: '[]',  // Empty array - should error or return 0
        match_threshold: 0.0,
        match_count: 1,
      });
    if (funcError) {
      console.log('   Function response to empty array: %s', funcError.message);
    } else {
      console.log('   Function accepts empty array, returned: %d rows', funcCheck?.length || 0);
    }

    // Debug 7: Try a raw SQL approach via RPC
    console.log('\n[DEBUG 7] Checking raw data from chip_chunks...');
    const { data: sampleChunk, error: sampleError } = await supabase
      .from('chip_chunks')
      .select('id, chunk_index, embedding')
      .limit(1)
      .single();
    
    if (sampleError) {
      console.log('   Error fetching sample: %s', sampleError.message);
    } else if (sampleChunk) {
      console.log('   Sample chunk ID: %s', sampleChunk.id);
      console.log('   Embedding type returned: %s', typeof sampleChunk.embedding);
      if (typeof sampleChunk.embedding === 'string') {
        console.log('   Embedding starts with: %s', sampleChunk.embedding.substring(0, 30));
      } else if (Array.isArray(sampleChunk.embedding)) {
        console.log('   Embedding is array with %d elements', sampleChunk.embedding.length);
      } else {
        console.log('   Embedding value: %s', JSON.stringify(sampleChunk.embedding)?.substring(0, 100));
      }
    }

    // Debug 8: Test if we can do vector operations at all via SQL
    console.log('\n[DEBUG 8] Testing vector operations via direct query...');
    const { data: vectorTest, error: vectorError } = await supabase
      .from('chip_chunks')
      .select('id')
      .limit(1);
    console.log('   Can query table: %s', vectorError ? 'NO - ' + vectorError.message : 'YES');

    console.log('\n' + '─'.repeat(50));
    console.log('END DEBUGGING');
    console.log('─'.repeat(50));
    return;
  }

  console.log('   ✓ Found %d matches!\n', data.length);

  for (let i = 0; i < data.length; i++) {
    const match = data[i];
    console.log('═'.repeat(60));
    console.log('RESULT %d: %s (Chunk %d)', i + 1, match.document_name, match.chunk_index);
    console.log('Similarity: %.4f', match.similarity);
    console.log('═'.repeat(60));
    console.log(match.content || '[No content]');
    console.log('\n');
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✅ VECTOR SEARCH IS WORKING!');
  console.log('═'.repeat(50));
}

main().catch(console.error);