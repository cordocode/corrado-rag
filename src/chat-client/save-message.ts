// ============================================================================
// SAVE MESSAGE (SUPABASE)
// ============================================================================
//
// This module saves messages to the database. Called after both user
// messages arrive and assistant responses are generated.
//
// Pipeline position:
//   llm.ts → save-message.ts → return to UI
//
// WHAT IT DOES:
// 1. Takes a conversation ID, role, and content
// 2. Inserts a new message record
// 3. Returns the created message with its ID and timestamp
//
// USAGE:
// import { saveMessage } from './save-message';
// const msg = await saveMessage(conversationId, 'user', 'What is the rent?');
//
// ============================================================================

import { supabase } from '../supabase';
import { Message } from '../types';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant';

// ----------------------------------------------------------------------------
// MAIN EXPORTS
// ----------------------------------------------------------------------------

/**
 * Saves a single message to the database
 * 
 * @param conversationId - UUID of the conversation
 * @param role - 'user' or 'assistant'
 * @param content - The message text
 * @returns The created message with ID and timestamp
 */
export async function saveMessage(
  conversationId: string,
  role: MessageRole,
  content: string
): Promise<Message> {
  console.log('[SAVE-MESSAGE] Saving %s message (%d chars)', role, content.length);

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
    })
    .select()
    .single();

  if (error) {
    console.error('[SAVE-MESSAGE] Error:', error);
    throw new Error(`Failed to save message: ${error.message}`);
  }

  console.log('[SAVE-MESSAGE] Saved message: %s', data.id);
  return data;
}

/**
 * Saves both user and assistant messages in a single operation
 * Useful when you want to ensure both are saved atomically
 * 
 * @param conversationId - UUID of the conversation
 * @param userContent - The user's message
 * @param assistantContent - The assistant's response
 * @returns Object with both saved messages
 */
export async function saveMessagePair(
  conversationId: string,
  userContent: string,
  assistantContent: string
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  console.log('[SAVE-MESSAGE] Saving message pair...');

  const { data, error } = await supabase
    .from('messages')
    .insert([
      { conversation_id: conversationId, role: 'user', content: userContent },
      { conversation_id: conversationId, role: 'assistant', content: assistantContent },
    ])
    .select()
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SAVE-MESSAGE] Error:', error);
    throw new Error(`Failed to save messages: ${error.message}`);
  }

  if (!data || data.length !== 2) {
    throw new Error('Expected 2 messages to be saved');
  }

  console.log('[SAVE-MESSAGE] Saved both messages');

  return {
    userMessage: data[0],
    assistantMessage: data[1],
  };
}

/**
 * Updates an existing message (e.g., for streaming updates)
 * 
 * @param messageId - UUID of the message to update
 * @param content - New content
 * @returns Updated message
 */
export async function updateMessage(
  messageId: string,
  content: string
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .update({ content })
    .eq('id', messageId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update message: ${error.message}`);
  }

  return data;
}

/**
 * Deletes a message
 * 
 * @param messageId - UUID of the message to delete
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    throw new Error(`Failed to delete message: ${error.message}`);
  }
}