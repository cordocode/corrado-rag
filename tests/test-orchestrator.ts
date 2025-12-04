// ============================================================================
// TEST SCRIPT: ORCHESTRATOR (FULL PIPELINE)
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-orchestrator.ts /path/to/file.pdf
//
// EXAMPLE:
//   npx tsx tests/test-orchestrator.ts /users/cordo/documents/RAG-TESTS/lease_2.pdf
//
// This runs the complete ingestion pipeline:
//   extract → clean → classify → chunk → embed
//
// COST: ~$0.04-0.05 for an 18-page scanned lease
//   - Extraction (Haiku vision): ~$0.04
//   - Classification (Haiku): ~$0.001
//   - Embedding (OpenAI): ~$0.001
//
// OUTPUT:
// - Prints pipeline progress and stats to console
// - Saves full result to pipeline-output.json
//
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local FIRST before any other imports
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

// Now import modules that need env vars
import { ingestDocument, IngestionResult } from '../src/file-client/orchestrator';

async function main(): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  FULL PIPELINE TEST');
  console.log('█'.repeat(60) + '\n');

  // Check required env vars
  const requiredVars = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('ERROR: Missing environment variables in .env.local:');
    missing.forEach(v => console.error('  - %s', v));
    process.exit(1);
  }

  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx tests/test-orchestrator.ts /path/to/file.pdf');
    console.error('\nExample:');
    console.error('  npx tsx tests/test-orchestrator.ts /users/cordo/documents/RAG-TESTS/lease_2.pdf');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error('ERROR: File not found:', filePath);
    process.exit(1);
  }

  console.log('Input: %s', filePath);
  console.log('Size: %s KB', (fs.statSync(filePath).size / 1024).toFixed(1));

  try {
    // Run the full pipeline
    const result = await ingestDocument(filePath, {
      onProgress: (stage, message) => {
        // Progress callback - could update a UI here
        // console.log('[PROGRESS] %s: %s', stage, message);
      },
    });

    // Print summary
    printSummary(result);

    // Save full output
    const outputPath = path.join(process.cwd(), 'pipeline-output.json');
    const outputData = {
      input: {
        filePath: result.filePath,
        fileName: result.fileName,
      },
      timestamp: new Date().toISOString(),
      
      stages: {
        extraction: result.extraction,
        cleaning: result.cleaning,
        classification: {
          file_type: result.classification.file_type,
          confidence: result.classification.confidence,
          reasoning: result.classification.reasoning,
          chips: result.classification.chips,
        },
        chunking: result.chunking,
        embedding: result.embedding,
      },
      
      timing: result.timing,
      
      // Include full chunks with embeddings
      chunks: result.chunks.map((c: any) => ({
        chunkIndex: c.chunkIndex,
        wordCount: c.wordCount,
        contentLength: c.content.length,
        content: c.content,
        embedding: c.embedding || null,
      })),
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log('\nFull output saved to: %s', outputPath);
    console.log('Output size: %s KB', (fs.statSync(outputPath).size / 1024).toFixed(1));

    console.log('\n' + '█'.repeat(60));
    console.log('█  ✅ PIPELINE SUCCESS');
    console.log('█'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n' + '█'.repeat(60));
    console.error('█  ❌ PIPELINE FAILED');
    console.error('█'.repeat(60));
    console.error('\nError:', error);
    process.exit(1);
  }
}

function printSummary(result: IngestionResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('PIPELINE SUMMARY');
  console.log('='.repeat(60));

  console.log('\n📄 FILE');
  console.log('   Name: %s', result.fileName);
  console.log('   Extraction: %s', result.extraction.extractionMethod);

  console.log('\n📊 PROCESSING');
  console.log('   Raw text: %s chars', result.extraction.rawTextLength.toLocaleString());
  console.log('   Cleaned: %s chars (%s reduction)', 
    result.cleaning.cleanedTextLength.toLocaleString(),
    result.cleaning.reduction);

  console.log('\n🏷️  CLASSIFICATION');
  console.log('   Type: %s (%s%% confidence)', 
    result.classification.file_type,
    (result.classification.confidence * 100).toFixed(0));
  
  console.log('\n📋 CHIPS');
  const chips = result.classification.chips;
  const maxKeyLen = Math.max(...Object.keys(chips).map(k => k.length));
  for (const [key, value] of Object.entries(chips)) {
    if (value) {
      const paddedKey = key.padEnd(maxKeyLen);
      const displayVal = value.length > 50 ? value.substring(0, 47) + '...' : value;
      console.log('   %s : %s', paddedKey, displayVal);
    }
  }

  console.log('\n📦 CHUNKS');
  console.log('   Total: %d chunks', result.chunking.totalChunks);
  console.log('   Average: %d words each', result.chunking.averageWords);

  if (result.embedding) {
    console.log('\n🔢 EMBEDDINGS');
    console.log('   Tokens: %s', result.embedding.totalTokens.toLocaleString());
    console.log('   Cost: %s', result.embedding.estimatedCost);
  }

  console.log('\n⏱️  TIMING');
  console.log('   Extraction: %ss', (result.timing.extraction / 1000).toFixed(1));
  console.log('   Cleaning: %sms', result.timing.cleaning);
  console.log('   Classification: %ss', (result.timing.classification / 1000).toFixed(1));
  console.log('   Chunking: %sms', result.timing.chunking);
  if (result.embedding) {
    console.log('   Embedding: %ss', (result.timing.embedding / 1000).toFixed(1));
  }
  console.log('   ─────────────');
  console.log('   TOTAL: %ss', (result.timing.total / 1000).toFixed(1));

  // Cost estimate
  const extractionCost = result.extraction.extractionMethod === 'vision' ? 0.04 : 0;
  const classificationCost = 0.001;
  const embeddingCost = result.embedding ? parseFloat(result.embedding.estimatedCost.replace('$', '')) : 0;
  const totalCost = extractionCost + classificationCost + embeddingCost;
  
  console.log('\n💰 ESTIMATED COST');
  console.log('   Extraction: $%s', extractionCost.toFixed(3));
  console.log('   Classification: $%s', classificationCost.toFixed(3));
  console.log('   Embedding: $%s', embeddingCost.toFixed(4));
  console.log('   ─────────────');
  console.log('   TOTAL: $%s', totalCost.toFixed(3));
}

main();