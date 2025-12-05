// ============================================================================
// MINIMAL VECTOR SEARCH TEST
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-vector-minimal.ts
//
// This bypasses all our code and tests match_chunks directly
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
import OpenAI from 'openai';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('MINIMAL VECTOR SEARCH TEST');
  console.log('='.repeat(60) + '\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const openai = new OpenAI();

  // Step 1: Get a chunk and extract the FIRST SENTENCE to use as query
  console.log('1. Getting a sample chunk...');
  const { data: chunk, error: chunkError } = await supabase
    .from('chip_chunks')
    .select('id, content, embedding')
    .limit(1)
    .single();

  if (chunkError || !chunk) {
    console.error('Failed to get chunk:', chunkError);
    process.exit(1);
  }

  console.log('   Chunk ID:', chunk.id);
  console.log('   Content preview:', chunk.content.substring(0, 150) + '...');
  
  // Check embedding format
  console.log('\n2. Checking embedding format...');
  console.log('   Type:', typeof chunk.embedding);
  if (typeof chunk.embedding === 'string') {
    console.log('   String length:', chunk.embedding.length);
    console.log('   Starts with [:', chunk.embedding.startsWith('['));
    
    // Try to parse and check dimensions
    try {
      const parsed = JSON.parse(chunk.embedding);
      console.log('   Parsed array length:', parsed.length);
      console.log('   First value:', parsed[0]);
      console.log('   Last value:', parsed[parsed.length - 1]);
    } catch (e) {
      console.log('   ❌ Cannot parse as JSON');
    }
  }

  // Step 2: Create a test query embedding
  console.log('\n3. Creating query embedding for "EP Minerals lease rent"...');
  const query = "EP Minerals lease rent monthly payment";
  
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  
  const queryEmbedding = embeddingResponse.data[0].embedding;
  console.log('   Query embedding dimensions:', queryEmbedding.length);
  console.log('   First 3 values:', queryEmbedding.slice(0, 3));

  // Step 3: Call match_chunks directly
  console.log('\n4. Calling match_chunks RPC...');
  
  const { data: matches, error: matchError } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: 0.0,  // No threshold
    match_count: 5
  });

  if (matchError) {
    console.log('   ❌ Error:', matchError.message);
    console.log('   Code:', matchError.code);
    console.log('   Details:', matchError.details);
    console.log('   Hint:', matchError.hint);
  } else {
    console.log('   ✓ Success! Results:', matches?.length || 0);
    
    if (matches && matches.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('MATCHES FOUND:');
      console.log('-'.repeat(60));
      matches.forEach((m: any, i: number) => {
        console.log('\n   Match %d:', i + 1);
        console.log('   Similarity:', m.similarity);
        console.log('   Document:', m.document_name);
        console.log('   Content:', m.content?.substring(0, 100) + '...');
      });
    } else {
      console.log('\n   No matches returned - this suggests the embeddings');
      console.log('   in the database are not in the correct format.');
    }
  }

  // Step 4: Try a raw SQL approach to verify data
  console.log('\n5. Checking embedding column directly via raw query...');
  
  // This will tell us if the column is actually vector type
  const { data: rawCheck, error: rawError } = await supabase
    .from('chip_chunks')
    .select('id')
    .limit(1);
  
  // Try to get the actual vector representation
  console.log('\n6. Attempting similarity calc with known chunk...');
  
  // Get the stored embedding of our sample chunk
  if (typeof chunk.embedding === 'string') {
    try {
      const storedEmbedding = JSON.parse(chunk.embedding);
      
      // Calculate cosine similarity manually
      const dotProduct = queryEmbedding.reduce((sum, val, i) => sum + val * storedEmbedding[i], 0);
      const normA = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
      const normB = Math.sqrt(storedEmbedding.reduce((sum: number, val: number) => sum + val * val, 0));
      const similarity = dotProduct / (normA * normB);
      
      console.log('   Manual cosine similarity:', similarity.toFixed(4));
      console.log('   (If this is a reasonable number 0.3-0.9, the data is fine)');
      console.log('   (If it\'s NaN or 0, something is wrong with the embeddings)');
    } catch (e) {
      console.log('   Could not calculate manual similarity');
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(console.error);