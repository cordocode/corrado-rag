-- ============================================================================
-- CORRADO RAG - COMPLETE DATABASE SCHEMA
-- ============================================================================
--
-- This is the complete schema for the Corrado RAG system.
-- Run this in Supabase SQL Editor for a fresh project.
--
-- WHAT THIS CREATES:
-- 1. pgvector extension (for embeddings)
-- 2. file_type_templates table (document type definitions)
-- 3. documents table (uploaded files)
-- 4. chip_chunks table (embedded text chunks)
-- 5. conversations table (chat sessions)
-- 6. messages table (chat messages)
-- 7. match_chunks function (vector similarity search)
--
-- ============================================================================


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable pgvector for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================================
-- FILE TYPE TEMPLATES
-- ============================================================================
-- Defines document types and what metadata (chips) to extract from each.
-- The chip_fields array lists the fields that will be extracted and
-- prepended to each chunk for semantic search.

CREATE TABLE file_type_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name text UNIQUE NOT NULL,
  chip_fields jsonb NOT NULL,
  extraction_prompt text,
  created_at timestamptz DEFAULT now()
);

-- Seed: Lease template
INSERT INTO file_type_templates (type_name, chip_fields, extraction_prompt) VALUES (
  'lease',
  '["property_address", "unit_number", "tenant_name", "landlord", "lease_start", "lease_end", "monthly_rent", "security_deposit"]',
  'Extract lease agreement details including property, parties, dates, and financial terms.'
);

-- Seed: Misc template (fallback for unrecognized documents)
INSERT INTO file_type_templates (type_name, chip_fields, extraction_prompt) VALUES (
  'misc',
  '["document_title", "date", "parties_involved", "summary"]',
  'Extract general document information.'
);


-- ============================================================================
-- DOCUMENTS
-- ============================================================================
-- Master record for each uploaded file. Tracks processing status and
-- stores the full extracted text.

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name text NOT NULL,
  clean_name text,
  file_type text REFERENCES file_type_templates(type_name),
  file_url text,
  full_text text,
  status text DEFAULT 'pending',
  uploaded_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Index for status queries (e.g., find all pending documents)
CREATE INDEX idx_documents_status ON documents(status);


-- ============================================================================
-- CHIP-CHUNKS
-- ============================================================================
-- Document chunks with chip metadata prepended. Each chunk contains:
-- [DOCUMENT CONTEXT] header with extracted metadata
-- [CONTENT] section with actual document text
--
-- The embedding is a 1536-dimensional vector from OpenAI text-embedding-3-small

CREATE TABLE chip_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  chunk_index int,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

-- IVFFlat index for fast approximate nearest neighbor search
-- Uses cosine similarity (vector_cosine_ops)
CREATE INDEX idx_chip_chunks_embedding ON chip_chunks 
  USING ivfflat (embedding vector_cosine_ops);

-- Index for document lookups
CREATE INDEX idx_chip_chunks_document ON chip_chunks(document_id);


-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
-- Chat sessions. Each conversation contains multiple messages.

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);


-- ============================================================================
-- MESSAGES
-- ============================================================================
-- Individual messages within a conversation.
-- Role is either 'user' or 'assistant'.

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fetching conversation history
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);


-- ============================================================================
-- VECTOR SEARCH FUNCTION
-- ============================================================================
-- Enables semantic similarity search via supabase.rpc('match_chunks', {...})
--
-- The Supabase JS client doesn't natively support pgvector operators,
-- so we wrap the search in a database function.
--
-- USAGE:
--   SELECT * FROM match_chunks(
--     query_embedding := '[0.1, 0.2, ...]'::vector,
--     match_threshold := 0.3,
--     match_count := 5
--   );

CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  similarity float,
  document_name text,
  file_type text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.document_id,
    cc.content,
    cc.chunk_index,
    1 - (cc.embedding <=> query_embedding) AS similarity,
    d.original_name AS document_name,
    d.file_type
  FROM chip_chunks cc
  LEFT JOIN documents d ON cc.document_id = d.id
  WHERE 1 - (cc.embedding <=> query_embedding) >= match_threshold
  ORDER BY cc.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION match_chunks(vector, float, int) TO authenticated;
GRANT EXECUTE ON FUNCTION match_chunks(vector, float, int) TO anon;
GRANT EXECUTE ON FUNCTION match_chunks(vector, float, int) TO service_role;


-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Schema created successfully!';
  RAISE NOTICE '  - file_type_templates (2 seed records)';
  RAISE NOTICE '  - documents';
  RAISE NOTICE '  - chip_chunks (with vector index)';
  RAISE NOTICE '  - conversations';
  RAISE NOTICE '  - messages';
  RAISE NOTICE '  - match_chunks() function';
END $$;