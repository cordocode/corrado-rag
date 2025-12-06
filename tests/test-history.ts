// ============================================================================
// TEST: History Module
// ============================================================================
//
// USAGE: npx tsx tests/test-history.ts
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

import { 
  createConversation, 
  getConversationHistory, 
  conversationExists,
  getHistoryConfig 
} from '../src/chat-client/get-history';
import { supabase } from '../src/supabase';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('HISTORY MODULE TEST');
  console.log('='.repeat(70));

  const config = getHistoryConfig();
  console.log('\nConfiguration:');
  console.log('  Max messages: %d', config.maxMessages);

  // Test 1: Create a conversation
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 1: Create conversation');
  console.log('-'.repeat(70));

  const conversationId = await createConversation();
  console.log('Created: %s', conversationId);

  // Test 2: Verify it exists
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 2: Check existence');
  console.log('-'.repeat(70));

  const exists = await conversationExists(conversationId);
  console.log('Exists: %s', exists ? 'YES' : 'NO');

  // Test 3: Get history (should be empty)
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 3: Get empty history');
  console.log('-'.repeat(70));

  const emptyHistory = await getConversationHistory(conversationId);
  console.log('Message count: %d', emptyHistory.messageCount);

  // Test 4: Add some test messages directly
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 4: Insert test messages');
  console.log('-'.repeat(70));

  await supabase.from('messages').insert([
    { conversation_id: conversationId, role: 'user', content: 'When does the lease expire?' },
    { conversation_id: conversationId, role: 'assistant', content: 'The lease expires on December 31, 2025.' },
    { conversation_id: conversationId, role: 'user', content: 'What is the monthly rent?' },
  ]);
  console.log('Inserted 3 test messages');

  // Test 5: Get history with messages
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 5: Get populated history');
  console.log('-'.repeat(70));

  const history = await getConversationHistory(conversationId);
  console.log('Message count: %d', history.messageCount);
  console.log('Truncated: %s', history.truncated ? 'YES' : 'NO');
  console.log('\nMessages:');
  for (const msg of history.messages) {
    console.log('  [%s] %s', msg.role.toUpperCase(), msg.content);
  }

  // Cleanup: Delete test conversation
  console.log('\n' + '-'.repeat(70));
  console.log('CLEANUP');
  console.log('-'.repeat(70));

  await supabase.from('conversations').delete().eq('id', conversationId);
  console.log('Deleted test conversation');

  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);