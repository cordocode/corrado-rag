// ============================================================================
// USER SETTINGS (DATABASE OPERATIONS)
// ============================================================================
//
// CRUD operations for the user_settings table.
// Manages per-user RAG configuration like chunk count, threshold, and prompts.
//
// USAGE:
// import { getUserSettings, updateUserSettings } from '@/src/lib/settings';
// const settings = await getUserSettings(userId);
// await updateUserSettings(userId, { chunks_per_query: 10 });
//
// ============================================================================

import { supabase } from '../supabase';
import {
  DEFAULT_USER_ID,
  DEFAULT_CHUNKS_PER_QUERY,
  DEFAULT_SIMILARITY_THRESHOLD,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_CHAT_MODEL,
} from './constants';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface UserSettings {
  id: string;
  user_id: string;
  chunks_per_query: number;
  similarity_threshold: number;
  system_prompt: string | null;
  chat_model: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsUpdate {
  chunks_per_query?: number;
  similarity_threshold?: number;
  system_prompt?: string | null;
  chat_model?: string;
}

// ----------------------------------------------------------------------------
// READ OPERATIONS
// ----------------------------------------------------------------------------

/**
 * Gets user settings, creating default settings if none exist
 * 
 * @param userId - UUID of the user (defaults to localhost user)
 * @returns UserSettings with all fields populated
 */
export async function getUserSettings(
  userId: string = DEFAULT_USER_ID
): Promise<UserSettings> {
  console.log('[SETTINGS] Fetching settings for user: %s', userId);

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned, which we handle below
    console.error('[SETTINGS] Error fetching settings:', error);
    throw new Error(`Failed to fetch settings: ${error.message}`);
  }

  // If no settings exist, create default settings
  if (!data) {
    console.log('[SETTINGS] No settings found, creating defaults...');
    return await createDefaultSettings(userId);
  }

  console.log('[SETTINGS] Found settings: chunks=%d, threshold=%s',
    data.chunks_per_query, data.similarity_threshold);

  return data;
}

/**
 * Gets settings with defaults applied for null values
 * Use this when you need guaranteed non-null values
 * 
 * @param userId - UUID of the user
 * @returns Settings with defaults applied
 */
export async function getEffectiveSettings(
  userId: string = DEFAULT_USER_ID
): Promise<{
  chunks_per_query: number;
  similarity_threshold: number;
  system_prompt: string;
  chat_model: string;
}> {
  const settings = await getUserSettings(userId);

  return {
    chunks_per_query: settings.chunks_per_query ?? DEFAULT_CHUNKS_PER_QUERY,
    similarity_threshold: settings.similarity_threshold ?? DEFAULT_SIMILARITY_THRESHOLD,
    system_prompt: settings.system_prompt ?? DEFAULT_SYSTEM_PROMPT,
    chat_model: settings.chat_model ?? DEFAULT_CHAT_MODEL,
  };
}

// ----------------------------------------------------------------------------
// WRITE OPERATIONS
// ----------------------------------------------------------------------------

/**
 * Updates user settings
 * 
 * @param userId - UUID of the user
 * @param updates - Partial settings to update
 * @returns Updated settings
 */
export async function updateUserSettings(
  userId: string = DEFAULT_USER_ID,
  updates: UserSettingsUpdate
): Promise<UserSettings> {
  console.log('[SETTINGS] Updating settings for user: %s', userId);
  console.log('[SETTINGS] Updates:', updates);

  const { data, error } = await supabase
    .from('user_settings')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[SETTINGS] Error updating settings:', error);
    throw new Error(`Failed to update settings: ${error.message}`);
  }

  console.log('[SETTINGS] Settings updated successfully');
  return data;
}

/**
 * Resets system prompt to default
 * 
 * @param userId - UUID of the user
 * @returns Updated settings
 */
export async function resetSystemPrompt(
  userId: string = DEFAULT_USER_ID
): Promise<UserSettings> {
  console.log('[SETTINGS] Resetting system prompt to default');

  return await updateUserSettings(userId, {
    system_prompt: null, // null means "use default"
  });
}

/**
 * Resets all settings to defaults
 * 
 * @param userId - UUID of the user
 * @returns Updated settings
 */
export async function resetAllSettings(
  userId: string = DEFAULT_USER_ID
): Promise<UserSettings> {
  console.log('[SETTINGS] Resetting all settings to defaults');

  return await updateUserSettings(userId, {
    chunks_per_query: DEFAULT_CHUNKS_PER_QUERY,
    similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
    system_prompt: null,
    chat_model: DEFAULT_CHAT_MODEL,
  });
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Creates default settings for a user
 * Called automatically by getUserSettings when no settings exist
 */
async function createDefaultSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .insert({
      user_id: userId,
      chunks_per_query: DEFAULT_CHUNKS_PER_QUERY,
      similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
      system_prompt: null,
      chat_model: DEFAULT_CHAT_MODEL,
    })
    .select()
    .single();

  if (error) {
    console.error('[SETTINGS] Error creating default settings:', error);
    throw new Error(`Failed to create settings: ${error.message}`);
  }

  console.log('[SETTINGS] Created default settings');
  return data;
}

/**
 * Returns the default values (useful for "Reset to Default" UI)
 */
export function getDefaultSettings(): {
  chunks_per_query: number;
  similarity_threshold: number;
  system_prompt: string;
  chat_model: string;
} {
  return {
    chunks_per_query: DEFAULT_CHUNKS_PER_QUERY,
    similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    chat_model: DEFAULT_CHAT_MODEL,
  };
}