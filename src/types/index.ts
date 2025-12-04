// ============================================================================
// TYPESCRIPT TYPE DEFINITIONS
// ============================================================================
//
// This file defines TypeScript interfaces that mirror our Supabase database
// tables. These are NOT defining new document types for the system - they're
// just telling TypeScript what shape our data has.
//
// WHY WE NEED THIS:
// - TypeScript needs to know what properties exist on objects
// - Provides autocomplete in your code editor
// - Catches errors at compile time (e.g., typos in property names)
// - Makes refactoring safer
//
// RELATIONSHIP TO DATABASE:
// - Database has actual tables (file_type_templates, documents, etc.)
// - These interfaces describe the structure of rows from those tables
// - When you query the database, the results match these types
//
// EXAMPLE:
// const doc: Document = await supabase.from('documents').select('*').single();
// // TypeScript now knows doc.original_name exists
// // TypeScript will error if you try doc.nonexistent_field
//
// ============================================================================

// ----------------------------------------------------------------------------
// FILE TYPE TEMPLATES
// ----------------------------------------------------------------------------
// Represents a row from the 'file_type_templates' table
// These define what kinds of documents the system can process (lease, misc, etc.)
// and what metadata fields (chips) should be extracted from each type
export interface FileTypeTemplate {
  id: string;                    // UUID primary key
  type_name: string;              // e.g., "lease", "misc"
  chip_fields: string[];          // Array of field names to extract
  extraction_prompt?: string;     // Optional custom prompt for LLM
  created_at: string;             // Timestamp when template was created
}

// ----------------------------------------------------------------------------
// DOCUMENTS
// ----------------------------------------------------------------------------
// Represents a row from the 'documents' table
// This is the master record for each uploaded file
export interface Document {
  id: string;                    // UUID primary key
  original_name: string;          // Original filename from upload
  clean_name?: string;            // Cleaned/normalized filename
  file_type?: string;             // References file_type_templates.type_name
  file_url?: string;              // URL to file in Supabase Storage (optional)
  full_text?: string;             // Complete extracted text content
  status: string;                 // Processing status: pending, processing, complete, error
  uploaded_at: string;            // Timestamp of upload
  processed_at?: string;          // Timestamp when processing completed
}

// ----------------------------------------------------------------------------
// CHIP-CHUNKS
// ----------------------------------------------------------------------------
// Represents a row from the 'chip_chunks' table
// Each document gets split into multiple chunks, each with chips prepended
// These chunks get embedded and stored for vector similarity search
export interface ChipChunk {
  id: string;                    // UUID primary key
  document_id: string;            // Foreign key to documents table
  content: string;                // The actual text: [CHIPS] + [CONTENT]
  chunk_index?: number;           // Position in document (0, 1, 2, ...)
  embedding?: number[];           // 1536-dimensional vector from OpenAI
  created_at: string;             // Timestamp when chunk was created
}

// ----------------------------------------------------------------------------
// CONVERSATIONS
// ----------------------------------------------------------------------------
// Represents a row from the 'conversations' table
// Each conversation is a thread of messages between user and assistant
export interface Conversation {
  id: string;                    // UUID primary key
  created_at: string;             // Timestamp when conversation started
}

// ----------------------------------------------------------------------------
// MESSAGES
// ----------------------------------------------------------------------------
// Represents a row from the 'messages' table
// Individual messages within a conversation
export interface Message {
  id: string;                    // UUID primary key
  conversation_id: string;        // Foreign key to conversations table
  role: 'user' | 'assistant';     // Who sent this message
  content: string;                // The actual message text
  created_at: string;             // Timestamp when message was sent
}

// ----------------------------------------------------------------------------
// CHIPS
// ----------------------------------------------------------------------------
// NOT a database table - this is a flexible object type for extracted metadata
// The keys are determined by the chip_fields from file_type_templates
// For a lease: { property_address: "123 Main St", tenant_name: "John", ... }
// For misc: { document_title: "Contract", date: "2024-01-01", ... }
export interface Chips {
  [key: string]: string;          // Key-value pairs of extracted metadata
}