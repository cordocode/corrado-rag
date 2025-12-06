// ============================================================================
// CONVERSATION HISTORY (DATABASE FETCH)
// ============================================================================
//
// This module retrieves conversation history from the messages table.
// Used to maintain context across a multi-turn conversation.
//
// Pipeline position:
//   retrieval.ts → get-history.ts → prompt.ts → llm.ts → save-message.ts
//
// WHAT IT DOES:
// 1. Takes a conversation ID
// 2. Fetches all messages for that conversation
// 3. Returns them ordered by creation time (oldest first)
//
// USAGE:
// import { getConversationHistory } from './get-history';
// const messages = await getConversationHistory('uuid-here');
//
// ============================================================================

import { supabase } from '../supabase';

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------

/** Maximum messages to retrieve (prevents token explosion on long conversations) */
const MAX_MESSAGES = 50;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ConversationHistory {
  conversationId: string;
  messages: HistoryMessage[];
  messageCount: number;
  truncated: boolean;
}

// ----------------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------------

/**
 * Retrieves conversation history for a given conversation ID
 * 
 * @param conversationId - UUID of the conversation
 * @param options - Optional overrides
 * @returns ConversationHistory with messages in chronological order
 */
export async function getConversationHistory(
  conversationId: string,
  options: {
    maxMessages?: number;
  } = {}
): Promise<ConversationHistory> {
  const maxMessages = options.maxMessages ?? MAX_MESSAGES;

  console.log('[HISTORY] Fetching history for conversation: %s', conversationId);

  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(maxMessages);

  if (error) {
    console.error('[HISTORY] Supabase error:', error);
    throw new Error(`Failed to fetch history: ${error.message}`);
  }

  const messages: HistoryMessage[] = (data || []).map((row: any) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }));

  const truncated = messages.length === maxMessages;

  console.log('[HISTORY] Retrieved %d messages%s', 
    messages.length, 
    truncated ? ' (truncated)' : ''
  );

  return {
    conversationId,
    messages,
    messageCount: messages.length,
    truncated,
  };
}

/**
 * Creates a new conversation and returns its ID
 */
export async function createConversation(): Promise<string> {
  console.log('[HISTORY] Creating new conversation...');

  const { data, error } = await supabase
    .from('conversations')
    .insert({})
    .select('id')
    .single();

  if (error) {
    console.error('[HISTORY] Failed to create conversation:', error);
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  console.log('[HISTORY] Created conversation: %s', data.id);
  return data.id;
}

/**
 * Checks if a conversation exists
 */
export async function conversationExists(conversationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .single();

  if (error) {
    return false;
  }

  return !!data;
}

/**
 * Returns current configuration
 */
export function getHistoryConfig(): { maxMessages: number } {
  return { maxMessages: MAX_MESSAGES };
}