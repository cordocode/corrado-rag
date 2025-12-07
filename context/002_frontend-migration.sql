-- ============================================================================
-- CORRADO RAG - FRONTEND MIGRATION
-- ============================================================================
--
-- Run this in Supabase SQL Editor
--
-- CHANGES:
-- 1. Creates 'users' table
-- 2. Creates default localhost user for v1
-- 3. Creates 'user_settings' table
-- 4. Adds user_id to 'conversations' table
-- 5. Adds user_id and custom_chips to 'documents' table
--
-- ============================================================================


-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- For v1, we use a single default user. Auth comes in v2.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Create default localhost user for v1
INSERT INTO users (id, email) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'localhost@corrado.local'
) ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- USER SETTINGS TABLE
-- ============================================================================
-- Stores per-user RAG configuration

CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  chunks_per_query int DEFAULT 5,
  similarity_threshold float DEFAULT 0.0,
  system_prompt text,
  chat_model text DEFAULT 'claude-sonnet-4-20250514',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create default settings for localhost user
INSERT INTO user_settings (user_id) VALUES (
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (user_id) DO NOTHING;


-- ============================================================================
-- ALTER CONVERSATIONS TABLE
-- ============================================================================
-- Add user_id foreign key

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- Assign existing conversations to default user
UPDATE conversations 
SET user_id = '00000000-0000-0000-0000-000000000001' 
WHERE user_id IS NULL;


-- ============================================================================
-- ALTER DOCUMENTS TABLE
-- ============================================================================
-- Add user_id foreign key and custom_chips for user-added metadata

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS custom_chips jsonb DEFAULT '{}';

-- Assign existing documents to default user
UPDATE documents 
SET user_id = '00000000-0000-0000-0000-000000000001' 
WHERE user_id IS NULL;


-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);


-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these to verify the migration worked:
--
-- SELECT * FROM users;
-- SELECT * FROM user_settings;
-- SELECT user_id FROM conversations LIMIT 5;
-- SELECT user_id, custom_chips FROM documents LIMIT 5;
--
-- ============================================================================