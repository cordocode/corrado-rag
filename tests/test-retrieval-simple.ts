// ============================================================================
// SIMPLE RETRIEVAL TEST
// ============================================================================
//
// Tests vector search with a specific query to verify the pipeline works
// end-to-end.
//
// USAGE:
//   npx tsx tests/test-retrieval-simple.ts
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

// ----------------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------------

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MATCH_THRESHOLD = 0.3;
const MATCH_COUNT = 5;

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('RETRIEVAL TEST: "When does the EP Minerals lease expire?"');
  console.log('='.repeat(70) + '\n');

  // Initialize clients
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const openai = new OpenAI();

  // The test query
  const query = 'when does the EP minerals lease expire';

  console.log('Query: "%s"', query);
  console.log('Model: %s', EMBEDDING_MODEL);
  console.log('Threshold: %s', MATCH_THRESHOLD);
  console.log('Max results: %d', MATCH_COUNT);

  // Step 1: Embed the query
  console.log('\n' + '-'.repeat(70));
  console.log('STEP 1: Embedding query...');
  console.log('-'.repeat(70) + '\n');

  const startEmbed = Date.now();
  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;
  const embedTime = Date.now() - startEmbed;

  console.log('✓ Query embedded in %dms', embedTime);
  console.log('  Dimensions: %d', queryEmbedding.length);

  // Step 2: Search via match_chunks RPC
  console.log('\n' + '-'.repeat(70));
  console.log('STEP 2: Searching via match_chunks...');
  console.log('-'.repeat(70) + '\n');

  const startSearch = Date.now();
  const { data: matches, error } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });
  const searchTime = Date.now() - startSearch;

  if (error) {
    console.error('❌ Search failed:', error.message);
    process.exit(1);
  }

  console.log('✓ Search completed in %dms', searchTime);
  console.log('  Results found: %d', matches?.length || 0);

  // Step 3: Display results
  console.log('\n' + '-'.repeat(70));
  console.log('RESULTS');
  console.log('-'.repeat(70));

  if (!matches || matches.length === 0) {
    console.log('\n⚠️  No matches found above threshold %s', MATCH_THRESHOLD);
    console.log('Try lowering the threshold or check if chunks contain relevant content.');
    return;
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    console.log('\n' + '─'.repeat(70));
    console.log('MATCH %d of %d', i + 1, matches.length);
    console.log('─'.repeat(70));
    console.log('Similarity:  %.4f (%s%%)', match.similarity, (match.similarity * 100).toFixed(1));
    console.log('Document:    %s', match.document_name);
    console.log('File Type:   %s', match.file_type);
    console.log('Chunk Index: %d', match.chunk_index);
    console.log('');
    console.log('CONTENT:');
    console.log('');
    
    // Show the full chunk content (it includes the chip header)
    const content = match.content;
    
    // Truncate if very long, but show enough to see the chip header + key content
    const maxLen = 1500;
    if (content.length > maxLen) {
      console.log(content.substring(0, maxLen));
      console.log('\n... [%d more chars]', content.length - maxLen);
    } else {
      console.log(content);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('\nQuery: "%s"', query);
  console.log('Top match: %s (similarity: %.4f)', matches[0].document_name, matches[0].similarity);
  console.log('Total time: %dms (embed: %dms, search: %dms)', embedTime + searchTime, embedTime, searchTime);
  
  // Check if EP Minerals appears in the top result
  const topContent = matches[0].content.toLowerCase();
  if (topContent.includes('ep minerals') || topContent.includes('ep mineral')) {
    console.log('\n✅ SUCCESS: Top result contains "EP Minerals"');
  } else {
    console.log('\n⚠️  Top result may not be from EP Minerals lease');
    console.log('   Check the content above to verify relevance.');
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});