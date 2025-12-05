// ============================================================================
// TEST SCRIPT: CHAT (TERMINAL INTERACTIVE)
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-chat.ts
//
// This script provides an interactive terminal interface to test the chat
// pipeline against your vectorized documents in Supabase.
//
// COMMANDS:
//   /new          - Start a new conversation
//   /retrieve     - Test retrieval only (no LLM call)
//   /stats        - Show database stats
//   /history      - Show current conversation history
//   /exit or /q   - Exit the program
//   /help         - Show commands
//
// ANY OTHER INPUT is treated as a question to the RAG system.
//
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

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
  console.log('✓ Loaded environment from .env.local');
}

// Now import modules
import { 
  chat, 
  chatWithNewConversation, 
  retrieveOnly,
  createConversation,
  getConversationHistory,
} from '../src/chat-client/orchestrator';
import { getChunkStats } from '../src/chat-client/retrieval';

// ----------------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------------

let currentConversationId: string | null = null;

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  CORRADO RAG - CHAT TEST');
  console.log('█'.repeat(60));

  // Check env vars
  const required = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('\n❌ Missing environment variables:');
    missing.forEach(k => console.error('   - %s', k));
    process.exit(1);
  }

  console.log('\n✓ All environment variables loaded');

  // Show initial stats
  try {
    const stats = await getChunkStats();
    console.log('\n📊 Database Stats:');
    console.log('   Documents: %d', stats.totalDocuments);
    console.log('   Chunks: %d', stats.totalChunks);
    console.log('   Avg chunks/doc: %d', stats.avgChunksPerDoc);
  } catch (error) {
    console.log('\n⚠️  Could not fetch database stats (this is okay for first run)');
  }

  console.log('\n' + '-'.repeat(60));
  console.log('Commands: /new, /retrieve, /stats, /history, /help, /exit');
  console.log('-'.repeat(60));
  console.log('\nType a question or command:\n');

  // Start interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    const prefix = currentConversationId 
      ? `[${currentConversationId.substring(0, 8)}...]` 
      : '[no conversation]';
    rl.question(`${prefix} > `, handleInput);
  };

  const handleInput = async (input: string) => {
    const trimmed = input.trim();
    
    if (!trimmed) {
      prompt();
      return;
    }

    try {
      // Handle commands
      if (trimmed.startsWith('/')) {
        await handleCommand(trimmed);
      } else {
        // Regular chat
        await handleChat(trimmed);
      }
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    }

    prompt();
  };

  prompt();
}

// ----------------------------------------------------------------------------
// COMMAND HANDLERS
// ----------------------------------------------------------------------------

async function handleCommand(cmd: string): Promise<void> {
  const [command, ...args] = cmd.split(' ');

  switch (command.toLowerCase()) {
    case '/new':
      await startNewConversation();
      break;

    case '/retrieve':
    case '/r':
      const query = args.join(' ');
      if (!query) {
        console.log('\nUsage: /retrieve <query>');
        console.log('Example: /retrieve What is the monthly rent?');
      } else {
        await testRetrieval(query);
      }
      break;

    case '/stats':
      await showStats();
      break;

    case '/history':
    case '/h':
      await showHistory();
      break;

    case '/exit':
    case '/quit':
    case '/q':
      console.log('\nGoodbye! 👋\n');
      process.exit(0);

    case '/help':
    case '/?':
      showHelp();
      break;

    default:
      console.log('\nUnknown command: %s', command);
      console.log('Type /help for available commands');
  }
}

async function handleChat(message: string): Promise<void> {
  console.log('\n' + '─'.repeat(60));
  
  let result;
  
  if (currentConversationId) {
    // Continue existing conversation
    result = await chat(currentConversationId, message, {
      skipSave: false, // Save to DB
    });
  } else {
    // Start new conversation
    result = await chatWithNewConversation(message, {
      skipSave: false,
    });
    currentConversationId = result.conversationId;
    console.log('\n📝 Started new conversation: %s', currentConversationId);
  }

  // Print response
  console.log('\n' + '─'.repeat(60));
  console.log('ASSISTANT:');
  console.log('─'.repeat(60));
  console.log('\n%s\n', result.response);

  // Print summary
  console.log('─'.repeat(60));
  console.log('📊 Chunks: %d | Tokens: %d in / %d out | Cost: %s | Time: %ss',
    result.retrieval?.chunks.length || 0,
    result.llm.inputTokens,
    result.llm.outputTokens,
    result.estimatedCost,
    (result.timing.total / 1000).toFixed(1)
  );
  console.log('─'.repeat(60) + '\n');
}

async function startNewConversation(): Promise<void> {
  const conv = await createConversation();
  currentConversationId = conv.id;
  console.log('\n✓ Started new conversation: %s\n', conv.id);
}

async function testRetrieval(query: string): Promise<void> {
  console.log('\n' + '─'.repeat(60));
  console.log('RETRIEVAL TEST');
  console.log('─'.repeat(60));
  console.log('Query: %s', query);
  console.log('');

  const result = await retrieveOnly(query, { topK: 5 });

  console.log('\nFound %d chunks (in %dms):\n', result.chunks.length, result.totalTime);

  for (const chunk of result.chunks) {
    console.log('─'.repeat(40));
    console.log('Similarity: %s%%', (chunk.similarity * 100).toFixed(1));
    console.log('Document: %s', chunk.document_name || chunk.document_id);
    console.log('Chunk #%d', chunk.chunk_index);
    console.log('');
    // Show first 500 chars of content
    const preview = chunk.content.substring(0, 500);
    console.log(preview);
    if (chunk.content.length > 500) {
      console.log('... [%d more chars]', chunk.content.length - 500);
    }
    console.log('');
  }

  if (result.chunks.length === 0) {
    console.log('No chunks found above similarity threshold.');
    console.log('Try a different query or lower the similarity threshold.');
  }
}

async function showStats(): Promise<void> {
  console.log('\n📊 Database Stats:');
  
  try {
    const stats = await getChunkStats();
    console.log('   Documents: %d', stats.totalDocuments);
    console.log('   Chunks: %d', stats.totalChunks);
    console.log('   Avg chunks/doc: %d', stats.avgChunksPerDoc);
  } catch (error) {
    console.log('   Error fetching stats:', error instanceof Error ? error.message : error);
  }
  
  console.log('');
}

async function showHistory(): Promise<void> {
  if (!currentConversationId) {
    console.log('\nNo active conversation. Start one with /new or ask a question.\n');
    return;
  }

  console.log('\n📜 Conversation History (%s):', currentConversationId);
  console.log('─'.repeat(60));

  const messages = await getConversationHistory(currentConversationId);

  if (messages.length === 0) {
    console.log('(empty)\n');
    return;
  }

  for (const msg of messages) {
    const role = msg.role.toUpperCase().padEnd(10);
    const preview = msg.content.substring(0, 100);
    console.log('[%s] %s%s', role, preview, msg.content.length > 100 ? '...' : '');
  }
  
  console.log('');
}

function showHelp(): void {
  console.log(`
COMMANDS:
  /new              Start a new conversation
  /retrieve <q>     Test retrieval without LLM (shows chunks)
  /stats            Show database statistics
  /history          Show current conversation history
  /help             Show this help message
  /exit             Exit the program

TIPS:
  - Just type a question to chat with the RAG system
  - First question automatically starts a new conversation
  - Use /retrieve to debug retrieval quality
  - Conversation history is saved to Supabase
`);
}

// ----------------------------------------------------------------------------
// RUN
// ----------------------------------------------------------------------------

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});