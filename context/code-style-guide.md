# Corrado RAG — Code Style Guide

This document defines the coding conventions for this project. Follow these guidelines to maintain consistency and readability.

---

## File Header Format

Every file should start with a large header block explaining its purpose:

\`\`\`typescript
// ============================================================================
// FILE PURPOSE IN ALL CAPS
// ============================================================================
//
// Brief description of what this file does and why it exists.
//
// SECTION 1 TITLE:
// - Explanation point 1
// - Explanation point 2
//
// SECTION 2 TITLE:
// - More details
// - Usage examples
//
// EXAMPLE:
// const result = someFunction();
//
// ============================================================================
\`\`\`

---

## Section Dividers

Use clear dividers to separate logical sections within a file:

\`\`\`typescript
// ----------------------------------------------------------------------------
// SECTION NAME
// ----------------------------------------------------------------------------
// Brief description of what this section contains
\`\`\`

---

## Inline Comments

- **Prioritize clarity over brevity**
- Explain *why* something is done, not just *what* is happening
- Use comments for non-obvious logic or business decisions

\`\`\`typescript
// Good: Explains WHY
// We use service_role key because vector operations require elevated permissions

// Bad: Just describes WHAT
// Gets the service role key
\`\`\`

---

## Naming Conventions

### Files
- Lowercase with hyphens: `get-template.ts`, `save-chunks.ts`
- Name describes the primary function: `extractor.ts` extracts text

### Functions
- Verb-first, camelCase: `extractText()`, `embedChunks()`, `saveDocument()`
- Be specific: `getTemplateByType()` not `getTemplate()`

### Variables
- Descriptive camelCase: `cleanedText`, `chipFields`, `conversationId`
- Avoid abbreviations unless very common: `doc` is fine, `d` is not

### Types/Interfaces
- PascalCase: `Document`, `ChipChunk`, `FileTypeTemplate`
- Singular names: `Message` not `Messages`

---

## Function Documentation

Every exported function should have a comment block:

\`\`\`typescript
/**
 * Extracts raw text from a PDF file
 * 
 * @param filePath - Absolute path to the PDF file
 * @returns Extracted text as a single string
 * @throws Error if PDF is corrupted or unreadable
 */
export async function extractPdfText(filePath: string): Promise<string> {
  // Implementation...
}
\`\`\`

---

## Error Handling Style

Be explicit about what can go wrong:

\`\`\`typescript
try {
  const result = await riskyOperation();
} catch (error) {
  // Specific error context
  console.error('Failed to extract text from PDF:', error);
  throw new Error(`PDF extraction failed: ${error.message}`);
}
\`\`\`

---

## Import Organization

Group imports in this order:
1. External packages
2. Internal utilities/clients
3. Types
4. Relative imports

\`\`\`typescript
// External packages
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Internal utilities
import { supabase } from '@/supabase';

// Types
import type { Document, Chips } from '@/types';

// Relative imports
import { extractText } from './extractor';
\`\`\`

---

## TypeScript Strictness

- Always define return types explicitly
- Avoid `any` - use `unknown` if type is truly unknown
- Use optional chaining: `doc?.file_type` instead of `doc && doc.file_type`

\`\`\`typescript
// Good: Explicit return type
async function getDocument(id: string): Promise<Document | null> {
  // ...
}

// Bad: Inferred return type
async function getDocument(id: string) {
  // ...
}
\`\`\`

---

## Console Logging

Use consistent prefixes for different log types:

\`\`\`typescript
console.log('[EXTRACTOR] Starting text extraction...');
console.log('[CLASSIFIER] Detected file type:', fileType);
console.error('[EMBEDDER] Failed to generate embeddings:', error);
\`\`\`

---

## Constants

Define constants at the top of files or in a dedicated constants file:

\`\`\`typescript
// Magic numbers become named constants
const CHUNK_SIZE = 500;           // words per chunk
const CHUNKS_PER_QUERY = 5;       // number of results to retrieve
const EMBEDDING_DIMENSIONS = 1536; // OpenAI text-embedding-3-small
\`\`\`

---

## When to Create New Files

- One primary responsibility per file
- If a file exceeds ~300 lines, consider splitting
- Shared utilities go in dedicated files (not copied between files)

---

## Test Script Naming

Test scripts should mirror the module they test:

- Module: `src/file-client/extractor.ts`
- Test: `tests/test-extraction.js`

---

## Git Commit Messages

- Start with a verb: "Add", "Fix", "Update", "Refactor"
- Be specific: "Add PDF text extraction" not "Add feature"
- Reference the module: "[extractor] Fix OCR error handling"

---

## Summary

**Core Principles:**
1. **Clarity over cleverness** - Code should be immediately understandable
2. **Comments explain why** - Not just what the code does
3. **Explicit is better than implicit** - Don't make others guess
4. **Consistency matters** - Follow these patterns everywhere

If you're unsure about a style choice, prioritize readability.