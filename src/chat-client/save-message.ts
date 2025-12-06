// ============================================================================
// SAVE MESSAGE (DATABASE PERSISTENCE)
// ============================================================================
//
// This module saves messages to the database for conversation history.
//
// Pipeline position:
//   retrieval.ts → get-history.ts → prompt.ts → llm.ts → save-message.ts
//
// WHAT IT DOES:
// 1. Takes a conversation ID, role, and content
// 2. Inserts into the messages table
// 3. Returns the created message ID
//
// USAGE:
// import { saveMessage } from './save-message';
// await saveMessage(conversationId, 'user', 'What is the rent?');
// await saveMessage(conversationId, 'assistant', 'The rent is $2,150.');
//
// ============================================================================

import { supabase } from '../supabase';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface SavedMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------------

/**
 * Saves a single message to the database
 * 
 * @param conversationId - UUID of the conversation
 * @param role - 'user' or 'assistant'
 * @param content - The message content
 * @returns SavedMessage with ID and timestamp
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<SavedMessage> {
  console.log('[SAVE-MESSAGE] Saving %s message (%d chars)', role, content.length);

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
    })
    .select('id, conversation_id, role, content, created_at')
    .single();

  if (error) {
    console.error('[SAVE-MESSAGE] Error:', error);
    throw new Error(`Failed to save message: ${error.message}`);
  }

  console.log('[SAVE-MESSAGE] Saved message: %s', data.id);

  return {
    id: data.id,
    conversationId: data.conversation_id,
    role: data.role,
    content: data.content,
    createdAt: data.created_at,
  };
}

/**
 * Saves both user and assistant messages in one call
 * 
 * @param conversationId - UUID of the conversation
 * @param userContent - The user's message
 * @param assistantContent - The assistant's response
 * @returns Both saved messages
 */
export async function saveMessagePair(
  conversationId: string,
  userContent: string,
  assistantContent: string
): Promise<{ userMessage: SavedMessage; assistantMessage: SavedMessage }> {
  console.log('[SAVE-MESSAGE] Saving message pair...');

  const { data, error } = await supabase
    .from('messages')
    .insert([
      { conversation_id: conversationId, role: 'user', content: userContent },
      { conversation_id: conversationId, role: 'assistant', content: assistantContent },
    ])
    .select('id, conversation_id, role, content, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SAVE-MESSAGE] Error:', error);
    throw new Error(`Failed to save messages: ${error.message}`);
  }

  if (!data || data.length !== 2) {
    throw new Error('Expected 2 messages to be saved');
  }

  const userMsg = data.find(m => m.role === 'user')!;
  const assistantMsg = data.find(m => m.role === 'assistant')!;

  console.log('[SAVE-MESSAGE] Saved user: %s, assistant: %s', userMsg.id, assistantMsg.id);

  return {
    userMessage: {
      id: userMsg.id,
      conversationId: userMsg.conversation_id,
      role: userMsg.role,
      content: userMsg.content,
      createdAt: userMsg.created_at,
    },
    assistantMessage: {
      id: assistantMsg.id,
      conversationId: assistantMsg.conversation_id,
      role: assistantMsg.role,
      content: assistantMsg.content,
      createdAt: assistantMsg.created_at,
    },
  };
}