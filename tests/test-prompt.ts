// ============================================================================
// TEST: Prompt Builder
// ============================================================================
//
// USAGE: npx tsx tests/test-prompt.ts
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

import { retrieveChunks } from '../src/chat-client/retrieval';
import { buildPrompt, getSystemPromptTemplate } from '../src/chat-client/prompt';
import { HistoryMessage } from '../src/chat-client/get-history';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('PROMPT BUILDER TEST');
  console.log('='.repeat(70));

  const query = 'Does blue tree have an option to renew their lease?';

  // Get real chunks
  console.log('\n' + '-'.repeat(70));
  console.log('Step 1: Retrieve chunks');
  console.log('-'.repeat(70));

  const retrieval = await retrieveChunks(query);

  // Fake some history
  const fakeHistory: HistoryMessage[] = [
    { id: '1', role: 'user', content: 'What documents do you have?', createdAt: '' },
    { id: '2', role: 'assistant', content: 'I have access to several lease documents.', createdAt: '' },
  ];

  // Build prompt
  console.log('\n' + '-'.repeat(70));
  console.log('Step 2: Build prompt');
  console.log('-'.repeat(70));

  const prompt = buildPrompt(retrieval.chunks, fakeHistory, query);

  console.log('\n' + '-'.repeat(70));
  console.log('RESULT');
  console.log('-'.repeat(70));

  console.log('\nChunks included: %d', prompt.chunkCount);
  console.log('History messages: %d', prompt.historyCount);
  console.log('Total messages to send: %d', prompt.messages.length);
  console.log('Estimated tokens: ~%d', prompt.estimatedTokens);

  console.log('\n--- SYSTEM PROMPT (first 500 chars) ---');
  console.log(prompt.systemPrompt.substring(0, 500) + '...');

  console.log('\n--- MESSAGES ---');
  for (const msg of prompt.messages) {
    const preview = msg.content.substring(0, 100);
    console.log('[%s] %s%s', msg.role.toUpperCase(), preview, msg.content.length > 100 ? '...' : '');
  }

  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);