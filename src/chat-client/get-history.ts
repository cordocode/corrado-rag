// ============================================================================
// GET CONVERSATION HISTORY
// ============================================================================
//
// This module fetches the full message history for a conversation.
// Used to maintain context across multiple turns in the chat.
//
// Pipeline position:
//   retrieval.ts → get-history.ts → prompt.ts → llm.ts
//
// WHAT IT DOES:
// 1. Takes a conversation ID
// 2. Fetches all messages for that conversation from Supabase
// 3. Returns them in chronological order for prompt assembly
//
// WHY FULL HISTORY:
// Per the architecture doc, we include the entire conversation in the
// prompt. This gives Claude full context for follow-up questions like
// "what about unit 205?" after asking about unit 204.
//
// USAGE:
// import { getConversationHistory } from './get-history';
// const messages = await getConversationHistory(conversationId);
//
// ============================================================================

import { supabase } from '../supabase';
import { Message, Conversation } from '../types';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ConversationHistory {
  conversation: Conversation;
  messages: Message[];
}

// ----------------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------------

/**
 * Fetches all messages for a conversation in chronological order
 * 
 * @param conversationId - UUID of the conversation
 * @returns Array of messages ordered by created_at ASC
 */
export async function getConversationHistory(
  conversationId: string
): Promise<Message[]> {
  console.log('[GET-HISTORY] Fetching history for conversation: %s', conversationId);

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[GET-HISTORY] Error:', error);
    throw new Error(`Failed to fetch conversation history: ${error.message}`);
  }

  const messages = data || [];
  console.log('[GET-HISTORY] Found %d messages', messages.length);

  return messages;
}

/**
 * Fetches a conversation with its messages
 * 
 * @param conversationId - UUID of the conversation
 * @returns Conversation object with messages array
 */
export async function getConversationWithHistory(
  conversationId: string
): Promise<ConversationHistory | null> {
  console.log('[GET-HISTORY] Fetching conversation with history: %s', conversationId);

  // Get conversation
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (convError) {
    if (convError.code === 'PGRST116') {
      // Not found
      return null;
    }
    throw new Error(`Failed to fetch conversation: ${convError.message}`);
  }

  // Get messages
  const messages = await getConversationHistory(conversationId);

  return {
    conversation,
    messages,
  };
}

/**
 * Creates a new conversation
 * 
 * @returns The created conversation object
 */
export async function createConversation(): Promise<Conversation> {
  console.log('[GET-HISTORY] Creating new conversation...');

  const { data, error } = await supabase
    .from('conversations')
    .insert({})
    .select()
    .single();

  if (error) {
    console.error('[GET-HISTORY] Error creating conversation:', error);
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  console.log('[GET-HISTORY] Created conversation: %s', data.id);
  return data;
}

/**
 * Gets recent conversations
 * 
 * @param limit - Max number of conversations to return
 * @returns Array of recent conversations with message counts
 */
export async function getRecentConversations(
  limit: number = 10
): Promise<Array<Conversation & { message_count: number }>> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      messages(count)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  return (data || []).map((conv: any) => ({
    ...conv,
    message_count: conv.messages?.[0]?.count || 0,
  }));
}

/**
 * Deletes a conversation and all its messages
 * 
 * @param conversationId - UUID of the conversation to delete
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  console.log('[GET-HISTORY] Deleting conversation: %s', conversationId);

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to delete conversation: ${error.message}`);
  }

  console.log('[GET-HISTORY] Conversation deleted');
}