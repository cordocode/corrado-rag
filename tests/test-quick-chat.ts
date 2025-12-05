// ============================================================================
// TEST SCRIPT: QUICK CHAT (NO DB PERSISTENCE)
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-quick-chat.ts "What is the monthly rent?"
//
// This script runs the full RAG pipeline (retrieve → prompt → LLM) but
// WITHOUT saving to the database. Good for quick testing.
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

import { retrieveChunks } from '../src/chat-client/retrieval';
import { buildPrompt } from '../src/chat-client/prompt';
import { callClaude, estimateCost } from '../src/chat-client/llm';

async function main(): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  QUICK CHAT TEST (NO DB)');
  console.log('█'.repeat(60) + '\n');

  const query = process.argv.slice(2).join(' ');
  
  if (!query) {
    console.log('Usage: npx tsx tests/test-quick-chat.ts "your question here"');
    console.log('\nExamples:');
    console.log('  npx tsx tests/test-quick-chat.ts "What is the monthly rent?"');
    console.log('  npx tsx tests/test-quick-chat.ts "Who are the parties in this lease?"');
    console.log('  npx tsx tests/test-quick-chat.ts "What happens if rent is late?"');
    process.exit(1);
  }

  // Check env
  const required = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('Missing environment variables:', missing.join(', '));
    process.exit(1);
  }

  console.log('Query: %s', query);
  console.log('');

  try {
    const startTime = Date.now();

    // Step 1: Retrieve
    console.log('[1/3] Retrieving relevant chunks...');
    const retrieval = await retrieveChunks(query, { topK: 5 });
    console.log('      Found %d chunks in %dms', retrieval.chunks.length, retrieval.totalTime);

    if (retrieval.chunks.length === 0) {
      console.log('\n⚠️  No relevant chunks found. The LLM will have no document context.');
    }

    // Step 2: Build prompt
    console.log('[2/3] Building prompt...');
    const prompt = buildPrompt(retrieval.chunks, [], query);
    console.log('      System prompt: %d chars', prompt.systemPrompt.length);
    console.log('      Estimated tokens: ~%d', prompt.tokenEstimate);

    // Step 3: Call LLM
    console.log('[3/3] Calling Claude Sonnet...');
    const llmResponse = await callClaude(prompt);
    console.log('      Response in %ss', (llmResponse.responseTime / 1000).toFixed(1));

    const totalTime = Date.now() - startTime;

    // Output
    console.log('\n' + '='.repeat(60));
    console.log('RESPONSE');
    console.log('='.repeat(60) + '\n');
    console.log(llmResponse.content);

    console.log('\n' + '='.repeat(60));
    console.log('STATS');
    console.log('='.repeat(60));
    console.log('Chunks retrieved: %d', retrieval.chunks.length);
    console.log('Input tokens: %d', llmResponse.inputTokens);
    console.log('Output tokens: %d', llmResponse.outputTokens);
    console.log('Cost: %s', estimateCost(llmResponse.inputTokens, llmResponse.outputTokens));
    console.log('Total time: %ss', (totalTime / 1000).toFixed(1));

    // Show chunk sources
    if (retrieval.chunks.length > 0) {
      console.log('\nDocument sources:');
      const sources = [...new Set(retrieval.chunks.map(c => c.document_name || c.document_id))];
      sources.forEach(s => console.log('  - %s', s));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ COMPLETE');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ FAILED:', error);
    process.exit(1);
  }
}

main();