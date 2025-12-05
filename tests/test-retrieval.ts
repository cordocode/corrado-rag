// ============================================================================
// TEST SCRIPT: RETRIEVAL ONLY
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-retrieval.ts "What is the monthly rent?"
//
// This script tests just the vector retrieval without LLM calls.
// Useful for debugging search quality and seeing what chunks are returned.
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

import { retrieveChunks, getChunkStats } from '../src/chat-client/retrieval';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('VECTOR RETRIEVAL TEST');
  console.log('='.repeat(60) + '\n');

  // Get query from args
  const query = process.argv.slice(2).join(' ');
  
  if (!query) {
    console.log('Usage: npx tsx tests/test-retrieval.ts "your question here"');
    console.log('\nExamples:');
    console.log('  npx tsx tests/test-retrieval.ts "What is the monthly rent?"');
    console.log('  npx tsx tests/test-retrieval.ts "Who is the tenant?"');
    console.log('  npx tsx tests/test-retrieval.ts "When does the lease end?"');
    process.exit(1);
  }

  // Check env
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY not found in .env.local');
    process.exit(1);
  }

  // Show stats
  console.log('📊 Database Stats:');
  try {
    const stats = await getChunkStats();
    console.log('   Documents: %d', stats.totalDocuments);
    console.log('   Chunks: %d', stats.totalChunks);
  } catch (error) {
    console.log('   Could not fetch stats');
  }

  console.log('\n' + '-'.repeat(60));
  console.log('QUERY: %s', query);
  console.log('-'.repeat(60) + '\n');

  try {
    const result = await retrieveChunks(query, {
      topK: 5,
      minSimilarity: 0.2, // Lower threshold to see more results
    });

    console.log('\n' + '-'.repeat(60));
    console.log('RESULTS');
    console.log('-'.repeat(60));
    console.log('\nFound: %d chunks', result.chunks.length);
    console.log('Query embedding time: %dms', result.queryEmbeddingTime);
    console.log('Search time: %dms', result.searchTime);
    console.log('Total time: %dms', result.totalTime);

    if (result.chunks.length === 0) {
      console.log('\n⚠️  No chunks found above similarity threshold.');
      console.log('Try a different query or check that documents are ingested.');
      process.exit(0);
    }

    console.log('\n' + '='.repeat(60));
    console.log('RETRIEVED CHUNKS');
    console.log('='.repeat(60));

    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i];
      
      console.log('\n' + '-'.repeat(60));
      console.log('CHUNK %d of %d', i + 1, result.chunks.length);
      console.log('-'.repeat(60));
      console.log('Similarity: %s%%', (chunk.similarity * 100).toFixed(1));
      console.log('Document: %s', chunk.document_name || 'Unknown');
      console.log('Type: %s', chunk.file_type || 'Unknown');
      console.log('Chunk Index: %d', chunk.chunk_index);
      console.log('Document ID: %s', chunk.document_id);
      console.log('\n--- Content ---\n');
      
      // Show full content or first 1000 chars
      const maxLen = 1000;
      if (chunk.content.length > maxLen) {
        console.log(chunk.content.substring(0, maxLen));
        console.log('\n... [%d more characters]', chunk.content.length - maxLen);
      } else {
        console.log(chunk.content);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ RETRIEVAL COMPLETE');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ FAILED:', error);
    process.exit(1);
  }
}

main();