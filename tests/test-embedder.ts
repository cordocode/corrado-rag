// ============================================================================
// TEST SCRIPT: EMBEDDER
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-embedder.ts ./chunks-output.json
//
// COST: ~$0.001 for a typical 18-page lease (20 chunks)
//
// This tests the embedder module which generates vector embeddings
// for chip-chunks using OpenAI's text-embedding-3-small model.
//
// OUTPUT:
// - Prints embedding stats to console
// - Saves embedded chunks to embeddings-output.json
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

import { 
  embedChunks, 
  estimateEmbeddingCost, 
  getEmbeddingModelInfo 
} from '../src/file-client/embedder';
import { ChipChunk } from '../src/file-client/chunker';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('VECTOR EMBEDDER TEST');
  console.log('='.repeat(60) + '\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY not found in .env.local');
    process.exit(1);
  }

  const chunksPath = process.argv[2];
  if (!chunksPath) {
    console.error('Usage: npx tsx tests/test-embedder.ts ./chunks-output.json');
    process.exit(1);
  }

  if (!fs.existsSync(chunksPath)) {
    console.error('ERROR: Chunks file not found:', chunksPath);
    process.exit(1);
  }

  console.log('Chunks file:', chunksPath);

  try {
    // Load chunks
    const chunksData = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
    
    // Convert to ChipChunk format
    const chunks: ChipChunk[] = chunksData.chunks.map((c: any) => ({
      content: c.content,
      chunkIndex: c.chunkIndex,
      wordCount: c.wordCount,
      startChar: 0,  // Not needed for embedding
      endChar: 0,
    }));

    console.log('\n' + '-'.repeat(60));
    console.log('INPUT SUMMARY');
    console.log('-'.repeat(60) + '\n');

    console.log('Chunks to embed: %d', chunks.length);
    
    const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
    console.log('Total characters: %s', totalChars.toLocaleString());

    // Model info
    const modelInfo = getEmbeddingModelInfo();
    console.log('\nModel: %s', modelInfo.model);
    console.log('Dimensions: %d', modelInfo.dimensions);
    console.log('Cost: $%s per 1K tokens', modelInfo.costPer1KTokens);

    // Cost estimate
    const estimate = estimateEmbeddingCost(chunks);
    console.log('\nEstimated tokens: ~%s', estimate.estimatedTokens.toLocaleString());
    console.log('Estimated cost: %s', estimate.estimatedCost);

    console.log('\n' + '-'.repeat(60));
    console.log('GENERATING EMBEDDINGS...');
    console.log('-'.repeat(60) + '\n');

    const startTime = Date.now();
    const result = await embedChunks(chunks);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '-'.repeat(60));
    console.log('RESULTS');
    console.log('-'.repeat(60) + '\n');

    console.log('Time: %ss', duration);
    console.log('Chunks embedded: %d', result.totalChunks);
    console.log('Total tokens used: %s', result.totalTokens.toLocaleString());
    console.log('Actual cost: %s', result.estimatedCost);

    // Verify embeddings
    console.log('\n' + '-'.repeat(60));
    console.log('EMBEDDING VERIFICATION');
    console.log('-'.repeat(60) + '\n');

    const firstEmbedding = result.chunks[0].embedding;
    console.log('First embedding dimensions: %d', firstEmbedding.length);
    console.log('First embedding sample (first 5 values):');
    console.log('  [%s, ...]', firstEmbedding.slice(0, 5).map(v => v.toFixed(6)).join(', '));

    // Check all embeddings have correct dimensions
    const allCorrectDimensions = result.chunks.every(
      c => c.embedding.length === modelInfo.dimensions
    );
    console.log('\nAll embeddings have %d dimensions: %s', 
      modelInfo.dimensions, allCorrectDimensions ? '✓ YES' : '✗ NO');

    // Calculate embedding stats
    const magnitudes = result.chunks.map(c => {
      const sum = c.embedding.reduce((s, v) => s + v * v, 0);
      return Math.sqrt(sum);
    });
    const avgMagnitude = magnitudes.reduce((s, m) => s + m, 0) / magnitudes.length;
    console.log('Average embedding magnitude: %s', avgMagnitude.toFixed(4));

    // Save full output
    const outputPath = path.join(process.cwd(), 'embeddings-output.json');
    const outputData = {
      input_file: chunksPath,
      timestamp: new Date().toISOString(),
      model: modelInfo.model,
      dimensions: modelInfo.dimensions,
      summary: {
        totalChunks: result.totalChunks,
        totalTokens: result.totalTokens,
        cost: result.estimatedCost,
        processingTime: `${duration}s`,
      },
      chunks: result.chunks.map(c => ({
        chunkIndex: c.chunkIndex,
        wordCount: c.wordCount,
        contentLength: c.content.length,
        content: c.content,
        embedding: c.embedding,
      })),
    };
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log('\nFull output saved to: %s', outputPath);
    console.log('File size: %s KB', (fs.statSync(outputPath).size / 1024).toFixed(1));

    // Also save a compact version without full content (just embeddings)
    const compactPath = path.join(process.cwd(), 'embeddings-compact.json');
    const compactData = {
      model: modelInfo.model,
      dimensions: modelInfo.dimensions,
      chunks: result.chunks.map(c => ({
        chunkIndex: c.chunkIndex,
        embedding: c.embedding,
      })),
    };
    fs.writeFileSync(compactPath, JSON.stringify(compactData));
    console.log('Compact output saved to: %s', compactPath);

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ FAILED:', error);
    process.exit(1);
  }
}

main();