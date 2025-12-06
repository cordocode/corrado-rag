// ============================================================================
// APPLICATION CONSTANTS
// ============================================================================
//
// Central location for default values used throughout the application.
// These defaults are used when user_settings doesn't have a custom value.
//
// WHY CENTRALIZED:
// - Single source of truth for defaults
// - Easy to update without hunting through multiple files
// - Settings UI can show "Reset to Default" using these values
//
// ============================================================================

// ----------------------------------------------------------------------------
// DEFAULT USER
// ----------------------------------------------------------------------------
// For v1, we use a single hardcoded user. Auth comes in v2.

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';

// ----------------------------------------------------------------------------
// RETRIEVAL SETTINGS
// ----------------------------------------------------------------------------

/** Number of chunks to retrieve per query (1-20) */
export const DEFAULT_CHUNKS_PER_QUERY = 5;

/** Minimum similarity score for chunk inclusion (0.0-1.0) */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.0;

// ----------------------------------------------------------------------------
// MODEL SETTINGS
// ----------------------------------------------------------------------------

/** Claude model for chat responses */
export const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-20250514';

/** OpenAI model for embeddings */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Embedding dimensions (must match database column) */
export const EMBEDDING_DIMENSIONS = 1536;

// ----------------------------------------------------------------------------
// SYSTEM PROMPT
// ----------------------------------------------------------------------------
// This prompt instructs Claude how to behave when answering questions.
// Users can customize this in Settings, or reset to this default.

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions about documents.

You have access to relevant document excerpts provided below. Use these to answer the user's questions accurately.

INSTRUCTIONS:
- Answer based on the provided document context
- If the answer is in the documents, cite which document it came from
- If the answer is NOT in the provided context, say so clearly
- Be concise but complete
- If asked about specific terms, dates, or numbers, quote them exactly from the documents

DOCUMENT CONTEXT:
{chunks}

Answer the user's question based on the above context.`;

// ----------------------------------------------------------------------------
// CHUNKING SETTINGS
// ----------------------------------------------------------------------------
// These match the optimal parameters from RAG optimization testing

/** Target words per chunk */
export const DEFAULT_CHUNK_SIZE_WORDS = 200;

/** Overlap words between chunks */
export const DEFAULT_CHUNK_OVERLAP_WORDS = 25;

/** Chip position: 'prepend' or 'prepend_append' */
export const DEFAULT_CHIP_POSITION = 'prepend_append' as const;

// ----------------------------------------------------------------------------
// UI SETTINGS
// ----------------------------------------------------------------------------

/** Max messages to load from conversation history */
export const MAX_CONVERSATION_MESSAGES = 50;

/** Polling interval for upload progress (ms) */
export const UPLOAD_POLL_INTERVAL_MS = 1000;