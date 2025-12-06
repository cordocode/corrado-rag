-- ============================================================================
-- CORRADO RAG - DATABASE SCHEMA
-- ============================================================================
--
-- Last updated: 2025-01-XX (after optimizer cleanup)
--
-- TABLES:
-- 1. file_type_templates - Document type definitions + chip fields
-- 2. documents - Uploaded files and processing status
-- 3. chip_chunks - Embedded text chunks with chip headers
-- 4. conversations - Chat sessions
-- 5. messages - Individual chat messages
--
-- FUNCTIONS:
-- 1. match_chunks - Vector similarity search
--
-- ============================================================================


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================================
-- FILE TYPE TEMPLATES
-- ============================================================================
-- Defines document types and what metadata (chips) to extract from each.
-- Chips are prepended (and appended) to each chunk for semantic search.

CREATE TABLE file_type_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name text UNIQUE NOT NULL,
  chip_fields jsonb NOT NULL,
  extraction_prompt text,
  created_at timestamptz DEFAULT now()
);

-- Current templates:
-- lease: ["property_address", "tenant_name"]
-- misc: ["document_title", "date", "parties_involved", "summary"]


-- ============================================================================
-- DOCUMENTS
-- ============================================================================
-- Master record for each uploaded file.

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name text NOT NULL,
  clean_name text,
  file_type text REFERENCES file_type_templates(type_name),
  file_url text,
  full_text text,
  status text DEFAULT 'pending',  -- pending, processing, complete, error
  uploaded_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_documents_status ON documents(status);


-- ============================================================================
-- CHIP-CHUNKS
-- ============================================================================
-- Document chunks with chip metadata prepended and appended.
-- Embedding is 1536-dimensional vector from OpenAI text-embedding-3-small.

CREATE TABLE chip_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  chunk_index int,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chip_chunks_embedding ON chip_chunks 
  USING ivfflat (embedding vector_cosine_ops);
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

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);


-- ============================================================================
-- VECTOR SEARCH FUNCTION
-- ============================================================================
-- Semantic similarity search. Accepts embedding as JSON text string.
-- CRITICAL: Uses LANGUAGE sql (not plpgsql) to avoid pgvector bug.

CREATE OR REPLACE FUNCTION public.match_chunks(
  query_embedding text,
  match_threshold double precision DEFAULT 0.0,
  match_count integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  similarity double precision,
  document_name text,
  file_type text
)
LANGUAGE sql
AS $$
  WITH parsed AS (
    SELECT array_agg(elem::float8) AS float_array
    FROM json_array_elements_text(query_embedding::json) AS elem
  ),
  query_vec AS (
    SELECT float_array::vector(1536) AS qv FROM parsed
  )
  SELECT 
    cc.id,
    cc.document_id,
    cc.content,
    cc.chunk_index,
    (1.0 - (cc.embedding <=> qv.qv))::double precision AS similarity,
    d.original_name AS document_name,
    d.file_type
  FROM chip_chunks cc
  CROSS JOIN query_vec qv
  LEFT JOIN documents d ON cc.document_id = d.id
  WHERE cc.embedding IS NOT NULL
    AND (1.0 - (cc.embedding <=> qv.qv)) >= match_threshold
  ORDER BY cc.embedding <=> qv.qv
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_chunks(text, double precision, integer) 
  TO authenticated, anon, service_role;


-- ============================================================================
-- USAGE NOTES
-- ============================================================================
--
-- From JavaScript/TypeScript, call match_chunks like this:
--
--   const { data } = await supabase.rpc('match_chunks', {
--     query_embedding: JSON.stringify(embeddingArray),  // MUST stringify
--     match_threshold: 0.0,
--     match_count: 5,
--   });
--
-- Parameters are controlled in src/chat-client/retrieval.ts
--
-- ============================================================================