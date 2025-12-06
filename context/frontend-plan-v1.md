# Corrado RAG — Frontend Build Plan

**Version**: 1.1  
**Last Updated**: December 2024  
**Status**: Ready for Implementation

---

## Executive Summary

This document outlines the complete frontend build plan for Corrado RAG, a document Q&A system with intelligent ingestion. The frontend consists of three core areas: **Chat** (Q&A with source citations), **Training** (document ingestion), and **Settings** (configuration). The design uses a minimal charcoal-on-beige aesthetic with streaming responses and source attribution similar to Claude's interface.

---

## Architecture Overview

```
app/                    → Routes (URLs users visit) + API endpoints
components/             → Reusable UI building blocks
src/                    → Backend logic (pipelines + database utilities)
```

| Directory | What's in it | Who uses it |
|-----------|-------------|-------------|
| `app/` | Pages + API routes | Users visit these, frontend calls API |
| `components/` | Visual building blocks | Pages assemble these |
| `src/file-client/` | Ingestion pipeline | API routes call this |
| `src/chat-client/` | RAG pipeline | API routes call this |
| `src/lib/` | Shared database ops (settings, templates) | API routes call this |

---

## Design System

### Colors
```
Primary Text:     #4a4a4a (Charcoal)
Background:       #ffffe2 (Beige/Cream)
Accent:           TBD (for buttons, links, highlights)
Error:            TBD
Success:          TBD
```

### Typography
```
Headers:          'Array', sans-serif
Body Text:        'Khand', sans-serif
Code/Monospace:   System monospace
```

### Design Philosophy
- Minimal, clean interface
- Generous whitespace
- No unnecessary ornamentation
- Focus on content and functionality
- Similar feel to Claude's chat interface

---

## Navigation Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  CORRADO                           [Chat] [Training] [Settings] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                         Page Content                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Logo/wordmark on left
- Three navigation items on right
- Simple top bar, no sidebar for v1
- Active page indicated with underline or bold

---

## Page 1: Chat (`/chat`)

### Purpose
Primary interface for asking questions about trained documents. Streaming responses with expandable source citations.

### Layout
Full-height chat interface with messages in a centered column (max-width ~800px). Input bar fixed at bottom.

### Visual Structure
```
┌─────────────────────────────────────────────────────────────────┐
│  CORRADO                           [Chat] [Training] [Settings] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  USER                                                     │ │
│  │  When does the Blue Tree lease expire?                    │ │
│  │                                                           │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │                                                           │ │
│  │  ASSISTANT                                                │ │
│  │  The Blue Tree lease at 595 Double Eagle Court in Reno   │ │
│  │  expires on December 31, 2025. The lease specifies a     │ │
│  │  rentable square footage of 8,521 square feet.           │ │
│  │                                                           │ │
│  │  ▼ Sources (3 chunks used)         ← EXPANDABLE DROPDOWN │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │ 📄 Blue_Tree_Lease.pdf — Chunk 3                    │ │ │
│  │  │ Similarity: 0.872                                   │ │ │
│  │  │ ─────────────────────────────────────────────────── │ │ │
│  │  │ [DOCUMENT CONTEXT]                                  │ │ │
│  │  │ Property Address: 595 Double Eagle Court...         │ │ │
│  │  │ Tenant Name: Carefree Practice Resources, LLC       │ │ │
│  │  │ [CONTENT]                                           │ │ │
│  │  │ The lease term shall commence on January 1, 2024    │ │ │
│  │  │ and terminate on December 31, 2025...               │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │ 📄 Blue_Tree_Lease.pdf — Chunk 7                    │ │ │
│  │  │ Similarity: 0.821                                   │ │ │
│  │  │ ... (collapsed by default, click to expand)         │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Ask a question about your documents...          [Send]  │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Features

#### Streaming Responses
- Text appears word-by-word as Claude generates it (like Claude's interface)
- Cursor/blinking indicator while streaming
- Sources dropdown appears after streaming completes
- User can scroll while streaming continues

#### Source Citations (Expandable Dropdown)
- Located below each assistant response
- Header shows: "▼ Sources (N chunks used)" — collapsed by default
- Click to expand and see all chunks used
- Each chunk card shows:
  - Document name (original filename)
  - Chunk index number
  - Similarity score (0.000 - 1.000)
  - Full chunk content (scrollable if long)
- Chunks ordered by similarity (highest first)
- Individual chunks can be collapsed/expanded

#### Conversation Management
- "New Chat" button in top right of chat area
- Conversations persist in database by user
- On page load: continue last conversation OR start new (TBD)
- v2: Conversation list in sidebar to switch between chats

#### Message Display
- Clear visual distinction between user and assistant messages
- Timestamps optional (v2)
- Copy button on assistant messages (v2)

### Components Needed
```
components/chat/
├── ChatWindow.tsx          # Container for message thread
├── MessageBubble.tsx       # Single message (user or assistant)
├── MessageInput.tsx        # Input bar with send button
├── SourcesDropdown.tsx     # Expandable sources section
└── SourceCard.tsx          # Individual chunk display
```

---

## Page 2: Training (`/training`)

### Purpose
Upload documents to "train" the model. Users should feel like they're building their own custom AI, not just uploading files.

### Layout
Centered content with prominent dropzone, processing queue below, and trained documents list at bottom.

### Visual Structure
```
┌─────────────────────────────────────────────────────────────────┐
│  CORRADO                           [Chat] [Training] [Settings] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      TRAIN YOUR MODEL                           │
│            Upload documents to expand your AI's knowledge       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │                         📄                                │ │
│  │                                                           │ │
│  │            Drop files here to train your model            │ │
│  │                   or click to browse                      │ │
│  │                                                           │ │
│  │                  Supported: PDF, TXT                      │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  TRAINING IN PROGRESS                                           │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                       [X] │ │
│  │  📄 new-lease-agreement.pdf                               │ │
│  │                                                           │ │
│  │  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  35%        │ │
│  │                                                           │ │
│  │  ✨ Extracting key data points...                         │ │
│  │                                                           │ │
│  │  ─────────────────────────────────────────────────────── │ │
│  │                                                           │ │
│  │  Type: Lease (auto-detected)                              │ │
│  │                                                           │ │
│  │  IDENTIFIED:                                              │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │ property_address: 595 Double Eagle Court, Reno, NV │ │ │
│  │  │ tenant_name: Carefree Practice Resources, LLC      │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  │  CUSTOM IDENTIFIERS:                            [+ Add]   │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │ trade_name: Blue Tree              [x]             │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  TRAINED DOCUMENTS (15)                                         │
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ 📄          │ │ 📄          │ │ 📄          │ │ 📄        │ │
│  │ EP Minerals │ │ Blue Tree   │ │ Family      │ │ Scenth... │ │
│  │ Lease       │ │ Lease       │ │ Dollar      │ │ Lease     │ │
│  │ Jan 15      │ │ Jan 15      │ │ Jan 15      │ │ Jan 15    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                                                 │
│                         [View All Documents →]                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Features

#### File Upload
- Drag-and-drop zone with visual feedback on hover
- Click to open file browser
- Accept multiple files at once (queued for processing)
- Supported formats: PDF, TXT (extensible)
- File size limit: TBD (consider Vercel limits for v2)

#### Processing Queue
- Files queue up and process one at a time
- **[X] Cancel button** in top-right of each processing item
  - Clicking cancels ingestion mid-process
  - Cleans up any partial data (document record, chunks)
  - Shows "Cancelled" briefly, then removes from queue
- Each file shows:
  - Filename
  - Progress bar (percentage)
  - Current stage animation
  - Auto-detected document type (read-only)
  - Extracted chip values (as they're identified)
  - Option to add custom identifiers

#### Processing Stage Animations
Cycle through these messages during ingestion to create the feeling of sophisticated AI training:

```
Stage 1: "Analyzing document structure..."
Stage 2: "Extracting key data points..."
Stage 3: "Understanding context and relationships..."
Stage 4: "Building knowledge connections..."
Stage 5: "Optimizing for intelligent retrieval..."
Stage 6: "Finalizing training..."
```

- Stages cycle every 3-5 seconds
- Accompanied by subtle animation (spinner, pulsing dots, etc.)
- Progress bar advances based on actual pipeline progress

#### Classification Display (Read-Only)
- AI automatically classifies document type
- "Type: Lease (auto-detected)" shown during/after classification
- User CANNOT change the type — AI classification is final
- This simplifies the pipeline and maintains consistency

#### Identified Chips (Auto-Extracted)
- Once classification completes, shows extracted chip values
- Based on the type's `chip_fields` from `file_type_templates`
- Example for Lease type:
  ```
  property_address: 595 Double Eagle Court, Reno, NV
  tenant_name: Carefree Practice Resources, LLC
  ```
- Values are read-only (extracted by AI)
- Displayed in a clean key: value format

#### Custom Identifiers (User-Added)
- **[+ Add]** button lets user add custom chip key-value pairs
- Solves the legal name vs. trade name problem!
  - AI extracts: `tenant_name: Carefree Practice Resources, LLC`
  - User adds: `trade_name: Blue Tree`
- Each custom identifier shows:
  - Key input (e.g., "trade_name", "nickname", "property_nickname")
  - Value input (e.g., "Blue Tree")
  - [x] Remove button
- Custom chips are merged with auto-extracted chips
- All chips (auto + custom) are prepended to each chunk
- User can add identifiers during processing OR after (on document detail)

#### How Custom Chips Work in Pipeline
1. Classification extracts chips based on type's `chip_fields`
2. User adds custom chips via UI
3. Before chunking, custom chips are merged into chips object
4. All chips (auto + custom) become the chip header in each chunk
5. Custom chips stored in new column: `documents.custom_chips` (jsonb)

#### Trained Documents Grid
- Shows all successfully ingested documents
- Card display with:
  - Document icon
  - Filename (truncated)
  - Document type label
  - Date trained
- Click card to view details:
  - Full filename
  - Document type
  - Extracted chips (metadata)
  - Number of chunks created
  - Full text preview (stored in `documents.full_text`)
  - Delete button
- Pagination or infinite scroll for many documents

### Components Needed
```
components/training/
├── FileDropzone.tsx        # Drag-and-drop upload area
├── ProcessingQueue.tsx     # List of files being processed
├── ProcessingItem.tsx      # Single file in queue with [X] cancel
├── StageAnimation.tsx      # Animated processing stages
├── ChipsDisplay.tsx        # Shows auto-extracted chip values
├── CustomChipInput.tsx     # Add custom key-value chip
├── TrainedDocuments.tsx    # Grid of completed documents
├── DocumentCard.tsx        # Single document in grid
└── DocumentDetailModal.tsx # Full document info + edit custom chips + delete
```

---

## Page 3: Settings (`/settings`)

### Purpose
Configure RAG parameters, manage document types, and (v2) select AI models.

### Layout
Sectioned panels, each collapsible or always visible.

### Visual Structure
```
┌─────────────────────────────────────────────────────────────────┐
│  CORRADO                           [Chat] [Training] [Settings] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SETTINGS                                                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  RETRIEVAL CONFIGURATION                                  │ │
│  │                                                           │ │
│  │  Chunks per query                                         │ │
│  │  ┌─────┐                                                  │ │
│  │  │  5  │  ← Dropdown or number input (1-20)              │ │
│  │  └─────┘                                                  │ │
│  │  How many document chunks to retrieve for each question   │ │
│  │                                                           │ │
│  │  Similarity threshold                                     │ │
│  │  ┌─────┐                                                  │ │
│  │  │ 0.0 │  ← Slider or input (0.0 - 1.0)                  │ │
│  │  └─────┘                                                  │ │
│  │  Minimum similarity score for a chunk to be included      │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  SYSTEM PROMPT                                            │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │ You are a helpful assistant that answers questions │ │ │
│  │  │ about documents.                                    │ │ │
│  │  │                                                     │ │ │
│  │  │ You have access to relevant document excerpts      │ │ │
│  │  │ provided below. Use these to answer the user's     │ │ │
│  │  │ questions accurately.                               │ │ │
│  │  │                                                     │ │ │
│  │  │ INSTRUCTIONS:                                       │ │ │
│  │  │ - Answer based on the provided document context    │ │ │
│  │  │ - If the answer is in the documents, cite which    │ │ │
│  │  │   document it came from...                         │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  │  [Reset to Default]                            [Save]     │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  MODEL SELECTION (Coming Soon)                            │ │
│  │                                                           │ │
│  │  Chat Model                                               │ │
│  │  ┌──────────────────────────────────────────────┐        │ │
│  │  │  Claude Sonnet 4 (claude-sonnet-4-20250514)  🔒       │ │
│  │  └──────────────────────────────────────────────┘        │ │
│  │                                                           │ │
│  │  Embedding Model                                          │ │
│  │  ┌──────────────────────────────────────────────┐        │ │
│  │  │  text-embedding-3-small                      🔒       │ │
│  │  └──────────────────────────────────────────────┘        │ │
│  │                                                           │ │
│  │  Model selection will be available in a future update.   │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  DOCUMENT TYPES                           [+ Add Type]    │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  LEASE                                      [Edit]  │ │ │
│  │  │  Identifiers: property_address, tenant_name         │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  MISC                                       [Edit]  │ │ │
│  │  │  Identifiers: document_title, date,                 │ │ │
│  │  │               parties_involved, summary             │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Features

#### Retrieval Configuration
- **Chunks per query**: Dropdown or number input (1-20, default 5)
- **Similarity threshold**: Slider or input (0.0-1.0, default 0.0)
- Changes save automatically or via Save button
- Stored in `user_settings` table by user

#### System Prompt
- Textarea with current system prompt
- Editable by user
- [Reset to Default] restores hardcoded prompt from `prompt.ts`
- [Save] persists to database
- Supports markdown/formatting in the prompt

#### Model Selection (v2)
- Dropdown for chat model (Claude Sonnet, Haiku, Opus, etc.)
- Dropdown for embedding model (if we support multiple)
- Locked/disabled for v1 with "Coming Soon" message
- Prep the UI now so it's easy to enable later

#### Document Types (File Type Templates)
- List all types from `file_type_templates` table
- Each type shows:
  - Type name (e.g., "LEASE", "MISC")
  - Chip fields (identifiers) as tags or comma list
- [Edit] opens modal to modify type
- [+ Add Type] creates new type

#### Type Edit Modal
```
┌─────────────────────────────────────────────────────────────────┐
│  Edit Document Type                                     [X]     │
│                                                                 │
│  Type Name                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ lease                                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Identifier Fields (chips)                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ property_address                               [x]      │   │
│  │ tenant_name                                    [x]      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Add new field...                               [+]      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Extraction Prompt (optional)                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Extract lease agreement details including property,     │   │
│  │ parties, dates, and financial terms.                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Delete Type]                              [Cancel] [Save]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Delete shows warning if documents use this type
- Field names should be snake_case (validate)

### Components Needed
```
components/settings/
├── SettingsSection.tsx     # Collapsible section wrapper
├── RetrievalSettings.tsx   # Chunks, threshold controls
├── SystemPromptEditor.tsx  # Prompt textarea
├── ModelSelector.tsx       # Model dropdowns (v2)
├── TemplateList.tsx        # List of document types
├── TemplateCard.tsx        # Single type display
└── TemplateEditModal.tsx   # Create/edit type modal
```

---

## Database Schema Changes

### New Table: `users`
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,                    -- For auth (v2)
  created_at timestamptz DEFAULT now()
);

-- For v1 localhost, create a single default user:
INSERT INTO users (id, email) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'localhost@corrado.local'
);
```

### New Table: `user_settings`
```sql
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  chunks_per_query int DEFAULT 5,
  similarity_threshold float DEFAULT 0.0,
  system_prompt text,                   -- NULL = use default
  chat_model text DEFAULT 'claude-sonnet-4-20250514',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
```

### Modify: `conversations`
```sql
ALTER TABLE conversations 
ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- For existing conversations, assign to default user
UPDATE conversations SET user_id = '00000000-0000-0000-0000-000000000001';
```

### Modify: `documents`
```sql
ALTER TABLE documents 
ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE,
ADD COLUMN custom_chips jsonb DEFAULT '{}';  -- User-added identifiers

-- For existing documents, assign to default user
UPDATE documents SET user_id = '00000000-0000-0000-0000-000000000001';
```

**Note on `custom_chips`**: This stores user-added identifiers that supplement the auto-extracted chips. Example:
```json
{
  "trade_name": "Blue Tree",
  "property_nickname": "Reno Office"
}
```
These are merged with auto-extracted chips during chunking/re-chunking.

### Note on File Storage
The `documents` table already stores:
- `full_text` — Complete extracted text content
- `file_url` — URL to original file (currently unused)

For v1, we display `full_text` in document details. For v2, we can populate `file_url` with Supabase Storage links for original file downloads.

---

## API Routes

All routes live in `app/api/`. Each `route.ts` file handles multiple HTTP methods (GET, POST, PUT, DELETE) based on the request.

### Chat
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chat` | POST | Send message, receive streaming response with sources |

**Request Body:**
```json
{
  "conversationId": "uuid or null",
  "message": "When does the Blue Tree lease expire?"
}
```

**Response:** Server-Sent Events (streaming)
```
data: {"type": "token", "content": "The"}
data: {"type": "token", "content": " Blue"}
data: {"type": "token", "content": " Tree"}
...
data: {"type": "done", "sources": [...], "conversationId": "uuid"}
```

### Conversations
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/conversations` | GET | List user's conversations |
| `/api/conversations` | POST | Create new conversation |
| `/api/conversations` | DELETE | Delete conversation (pass id in body) |

### Documents
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/documents` | GET | List user's trained documents |
| `/api/documents` | GET | Get document details (pass id as query param) |
| `/api/documents` | DELETE | Delete document + chunks (pass id in body) |

### Upload/Ingestion
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/upload` | POST | Upload file, start ingestion |
| `/api/upload` | GET | Poll ingestion progress + chips (pass id as query param) |
| `/api/upload` | DELETE | Cancel ingestion, cleanup partial data (pass id in body) |
| `/api/upload` | PUT | Add/update custom chips (pass id + chips in body) |

**Upload Request:** FormData with file
**Status Response:**
```json
{
  "status": "processing",
  "progress": 65,
  "stage": "Building knowledge connections...",
  "documentId": "uuid",
  "fileType": "lease",
  "extractedChips": {
    "property_address": "595 Double Eagle Court, Reno, NV",
    "tenant_name": "Carefree Practice Resources, LLC"
  },
  "customChips": {
    "trade_name": "Blue Tree"
  }
}
```

**Cancel Response:**
```json
{
  "success": true,
  "message": "Training cancelled",
  "cleaned": {
    "document": true,
    "chunks": 0
  }
}
```

### Templates
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/templates` | GET | List all file type templates |
| `/api/templates` | POST | Create new template |
| `/api/templates` | PUT | Update template (pass id in body) |
| `/api/templates` | DELETE | Delete template (pass id in body) |

### Settings
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/settings` | GET | Get user settings |
| `/api/settings` | PUT | Update user settings |

---

## Backend Code Changes Required

### Changes to Existing Files

#### 1. `src/chat-client/orchestrator.ts`
**Current:** Returns `chunksUsed` count only
**Change:** Return full chunk data for source citations
```typescript
// Add to ChatResponse interface:
sources: Array<{
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}>;
```

#### 2. `src/chat-client/retrieval.ts`
**Current:** Hardcoded `CHUNKS_TO_RETRIEVE = 5` and `SIMILARITY_THRESHOLD = 0.0`
**Change:** Accept these as parameters from user settings
```typescript
export async function retrieveChunks(
  query: string,
  options: {
    chunkCount?: number;      // From user_settings
    similarityThreshold?: number;  // From user_settings
  } = {}
): Promise<RetrievalResult>
```

#### 3. `src/chat-client/prompt.ts`
**Current:** Hardcoded `SYSTEM_PROMPT` constant
**Change:** Accept system prompt as parameter
```typescript
export function buildPrompt(
  chunks: RetrievedChunk[],
  history: HistoryMessage[],
  userQuery: string,
  customSystemPrompt?: string  // From user_settings
): BuiltPrompt
```

#### 4. `src/chat-client/llm.ts`
**Current:** Hardcoded `CLAUDE_MODEL = 'claude-sonnet-4-20250514'`
**Change:** Accept model as parameter (prep for v2)
```typescript
export async function generateResponse(
  systemPrompt: string,
  messages: PromptMessage[],
  options?: {
    model?: string;  // From user_settings (v2)
  }
): Promise<LLMResponse>
```

#### 5. `src/file-client/orchestrator.ts`
**Current:** Runs synchronously, no progress updates
**Change:** Support progress callbacks, cancellation, and custom chips
```typescript
export async function ingestDocument(
  filePath: string,
  options: IngestionOptions & {
    onProgress?: (stage: string, percent: number, data?: any) => void;
    documentId?: string;  // Pre-created for status polling
    customChips?: Record<string, string>;  // User-added identifiers
    signal?: AbortSignal;  // For cancellation
  }
): Promise<IngestionResult>
```

#### 6. `src/file-client/chunker.ts`
**Current:** Only uses chips from classifier
**Change:** Merge custom chips with auto-extracted chips
```typescript
export function chunkDocument(
  text: string,
  chips: Chips,
  customChips?: Chips,  // User-added, merged with chips
  options: ChunkerOptions = {}
): ChunkingResult
```

#### 7. `src/file-client/save-document.ts`
**Current:** Saves basic document info
**Change:** Add custom_chips column support
```typescript
export async function updateDocumentChips(
  documentId: string,
  customChips: Record<string, string>
): Promise<void>
```

### New Files to Create

#### 8. `src/chat-client/stream.ts` (NEW)
**Purpose:** Handle streaming responses for the chat API
```typescript
export async function streamResponse(
  systemPrompt: string,
  messages: PromptMessage[],
  onToken: (token: string) => void,
  options?: { model?: string }
): Promise<void>
```

#### 9. `src/file-client/cancel.ts` (NEW)
**Purpose:** Clean up partial ingestion data on cancel
```typescript
export async function cancelIngestion(documentId: string): Promise<{
  success: boolean;
  chunksDeleted: number;
  documentDeleted: boolean;
}>
```

#### 10. `src/lib/settings.ts` (NEW)
**Purpose:** CRUD operations for user settings
```typescript
export async function getUserSettings(userId: string): Promise<UserSettings>
export async function updateUserSettings(userId: string, settings: Partial<UserSettings>): Promise<void>
export function getDefaultSettings(): UserSettings
```

#### 11. `src/lib/templates.ts` (NEW)
**Purpose:** CRUD operations for file type templates
```typescript
export async function getTemplates(): Promise<FileTypeTemplate[]>
export async function createTemplate(template: NewTemplate): Promise<FileTypeTemplate>
export async function updateTemplate(id: string, updates: Partial<FileTypeTemplate>): Promise<void>
export async function deleteTemplate(id: string): Promise<void>
```

#### 12. `src/lib/constants.ts` (NEW)
**Purpose:** Default values and constants
```typescript
export const DEFAULT_CHUNKS_PER_QUERY = 5;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.0;
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant...`;
export const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-20250514';
```

---

## File Structure

```
app/
├── layout.tsx                    # Root layout with nav, fonts
├── globals.css                   # Tailwind + custom styles + fonts
├── page.tsx                      # "/" - redirects to /chat
│
├── chat/
│   └── page.tsx                  # Chat interface (state lives here)
│
├── training/
│   └── page.tsx                  # Training/upload interface (state lives here)
│
├── settings/
│   └── page.tsx                  # Settings panels (state lives here)
│
└── api/
    ├── chat/
    │   └── route.ts              # POST: streaming chat
    ├── conversations/
    │   └── route.ts              # GET, POST, DELETE
    ├── documents/
    │   └── route.ts              # GET, DELETE
    ├── upload/
    │   └── route.ts              # POST, GET, PUT, DELETE
    ├── settings/
    │   └── route.ts              # GET, PUT
    └── templates/
        └── route.ts              # GET, POST, PUT, DELETE

components/
├── layout/
│   └── Navigation.tsx            # Top nav bar
│
├── chat/
│   ├── ChatWindow.tsx            # Message thread container
│   ├── MessageBubble.tsx         # Single message
│   ├── MessageInput.tsx          # Input bar
│   ├── SourcesDropdown.tsx       # Expandable sources
│   └── SourceCard.tsx            # Single source chunk
│
├── training/
│   ├── FileDropzone.tsx          # Upload area
│   ├── ProcessingQueue.tsx       # Queue container
│   ├── ProcessingItem.tsx        # Single file with cancel [X]
│   ├── StageAnimation.tsx        # Animated stage text
│   ├── ChipsDisplay.tsx          # Auto-extracted chips (read-only)
│   ├── CustomChipInput.tsx       # Add custom key-value chip
│   ├── TrainedDocuments.tsx      # Document grid
│   ├── DocumentCard.tsx          # Single document
│   └── DocumentDetailModal.tsx   # Details + edit custom chips
│
├── settings/
│   ├── SettingsSection.tsx       # Section wrapper
│   ├── RetrievalSettings.tsx     # Chunks/threshold
│   ├── SystemPromptEditor.tsx    # Prompt textarea
│   ├── ModelSelector.tsx         # Model dropdown
│   ├── TemplateList.tsx          # Template list
│   ├── TemplateCard.tsx          # Single template
│   └── TemplateEditModal.tsx     # Create/edit modal
│
└── ui/
    ├── Button.tsx                # Styled button
    ├── Input.tsx                 # Styled input
    ├── Textarea.tsx              # Styled textarea
    ├── Select.tsx                # Styled select
    ├── Modal.tsx                 # Modal wrapper
    ├── Card.tsx                  # Card wrapper
    └── Spinner.tsx               # Loading spinner

src/
├── file-client/                  # Ingestion pipeline (self-contained)
│   ├── orchestrator.ts           # MODIFY: add progress, cancel, custom chips
│   ├── extractor.ts
│   ├── cleaner.ts
│   ├── classifier.ts
│   ├── chunker.ts                # MODIFY: accept custom chips
│   ├── embedder.ts
│   ├── save-document.ts          # MODIFY: add updateDocumentChips
│   ├── save-chunks.ts
│   └── cancel.ts                 # NEW: cancellation logic
│
├── chat-client/                  # RAG pipeline (self-contained)
│   ├── orchestrator.ts           # MODIFY: return full sources
│   ├── retrieval.ts              # MODIFY: accept options
│   ├── get-history.ts
│   ├── prompt.ts                 # MODIFY: accept custom system prompt
│   ├── llm.ts                    # MODIFY: accept model option
│   ├── stream.ts                 # NEW: streaming support
│   └── save-message.ts
│
├── lib/                          # Shared database operations
│   ├── settings.ts               # NEW: user_settings CRUD
│   ├── templates.ts              # NEW: file_type_templates CRUD
│   └── constants.ts              # NEW: default values
│
├── supabase.ts
└── types/
    └── index.ts                  # Add new types for settings, etc.
```

---

## Build Order

### Phase 1: Foundation (Day 1)
1. Set up fonts (Array, Khand) in layout
2. Create globals.css with color variables
3. Build Navigation component
4. Create basic page shells for /chat, /training, /settings
5. Verify routing works

### Phase 2: Database + Settings (Day 1-2)
6. Run database migrations (users, user_settings, alter conversations/documents)
7. Create `src/lib/settings.ts`
8. Create `src/lib/templates.ts`
9. Create `src/lib/constants.ts`
10. Build settings API route
11. Build settings page UI
12. Test settings save/load

### Phase 3: Chat Core (Day 2-3)
13. Modify `src/chat-client/orchestrator.ts` to return sources
14. Modify `src/chat-client/retrieval.ts` to accept options
15. Modify `src/chat-client/prompt.ts` to accept custom prompt
16. Create `src/chat-client/stream.ts` for streaming
17. Build chat API route with streaming
18. Build ChatWindow, MessageBubble components
19. Build MessageInput component
20. Wire up basic chat (no sources yet)
21. Test streaming works

### Phase 4: Chat Sources (Day 3)
22. Build SourcesDropdown component
23. Build SourceCard component
24. Add sources to chat response
25. Test source display
26. Add conversation management (new chat button)

### Phase 5: Training Core (Day 4)
27. Build FileDropzone component
28. Build upload API route
29. Build ProcessingQueue, ProcessingItem components (with [X] cancel)
30. Build StageAnimation component
31. Create `src/file-client/cancel.ts`
32. Modify `src/file-client/orchestrator.ts` for progress/cancel
33. Wire up file upload + processing + cancellation
34. Test basic ingestion with cancel

### Phase 6: Training Polish (Day 4-5)
35. Build ChipsDisplay component (auto-extracted, read-only)
36. Build CustomChipInput component (add key-value pairs)
37. Modify `src/file-client/chunker.ts` for custom chips
38. Wire up custom chips to status polling + save
39. Build TrainedDocuments grid
40. Build DocumentCard, DocumentDetailModal (with custom chip editing)
41. Build documents API route
42. Wire up document list + delete + custom chip updates
43. Test full training flow with custom identifiers

### Phase 7: Templates (Day 5)
44. Build templates API route
45. Build TemplateList, TemplateCard components
46. Build TemplateEditModal
47. Wire up template CRUD
48. Test template management

### Phase 8: Polish (Day 6)
49. Error handling throughout
50. Loading states everywhere
51. Empty states (no documents, no conversations)
52. Mobile responsiveness check
53. Final style tweaks
54. Code cleanup + comments

---

## Open Questions / Decisions Needed

1. **Conversation List**: For v1, show list of past conversations in sidebar, or just "New Chat" + continue last?

2. **Document Detail View**: Modal overlay, or separate page (`/training/[id]`)?

3. **Settings Auto-save**: Save on change, or explicit Save button?

4. **Upload Progress**: Real-time progress (websocket/SSE), or polling? (Polling is simpler for v1)

5. **Error Display**: Toast notifications, inline errors, or both?

6. **Empty States**: What to show when no documents trained, no conversations, etc.?

7. **Accent Color**: Need to pick an accent color for buttons, links, active states. Suggestions: deep teal, terracotta, muted gold?

8. **Custom Chips Timing**: Can users add custom chips only during processing, or also edit them later on trained documents? (Plan assumes both)

9. **Re-chunking**: If user adds custom chips to an already-trained document, do we re-chunk with new chips, or just store for future reference? (Re-chunking is more accurate but expensive)

---

## V2 Features (Not in This Build)

- User authentication (Supabase Auth or Clerk)
- Multiple user support
- Conversation list/history sidebar
- Model selection (Sonnet/Haiku/Opus)
- Original file storage + download
- Batch upload from Dropbox/Google Drive
- Create new document type during upload
- Chunk overlap configuration
- Embedding model selection
- Usage analytics
- Export conversations
- Share conversations
- API key management

---

## Success Criteria

The frontend is complete when:

1. ✅ User can navigate between Chat, Training, and Settings
2. ✅ User can ask questions and receive streaming responses
3. ✅ Each response shows expandable source citations
4. ✅ User can upload documents and see training progress
5. ✅ User can view and delete trained documents
6. ✅ User can modify RAG settings (chunks, threshold, prompt)
7. ✅ User can view and edit document type templates
8. ✅ All data persists in Supabase
9. ✅ Interface matches design system (charcoal/beige, Array/Khand)
10. ✅ No console errors, graceful error handling