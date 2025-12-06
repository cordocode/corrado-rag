// ============================================================================
// TEST: Retrieval Module
// ============================================================================
//
// USAGE: npx tsx tests/test-retrieval.ts
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

import { retrieveChunks, getRetrievalConfig } from '../src/chat-client/retrieval';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('RETRIEVAL MODULE TEST');
  console.log('='.repeat(70));

  // Show config
  const config = getRetrievalConfig();
  console.log('\nConfiguration:');
  console.log('  Chunks to retrieve: %d', config.chunksToRetrieve);
  console.log('  Similarity threshold: %s', config.similarityThreshold);
  console.log('  Embedding model: %s', config.embeddingModel);

  const query = 'When does the ACER lease expire?';

  console.log('\n' + '-'.repeat(70));
  console.log('Query: "%s"', query);
  console.log('-'.repeat(70) + '\n');

  const result = await retrieveChunks(query);

  console.log('\n' + '-'.repeat(70));
  console.log('RESULTS: %d chunks in %dms', result.chunks.length, result.retrievalTimeMs);
  console.log('-'.repeat(70) + '\n');

  for (const chunk of result.chunks) {
    console.log('[%.4f] %s (chunk %d)', chunk.similarity, chunk.documentName, chunk.chunkIndex);
    console.log('-'.repeat(50));
    console.log(chunk.content.substring(0, 500));
    console.log('\n');
  }

  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);