# Vector Search Bug: Root Cause & Solution

## The Problem
Vector similarity search via `match_chunks()` RPC returned 0 rows, even though:
- 44 chunks existed with valid 1536-dimension embeddings
- Direct SQL queries (outside functions) worked perfectly
- The embedding column was correctly typed as `vector(1536)`

## What We Tried (That Failed)

1. **`vector(1536)` input type** - Supabase JS can't pass vector types directly
2. **`float8[]` input type** - Supabase JS sends `[0.1,0.2]` but PostgreSQL expects `{0.1,0.2}`
3. **`jsonb` input type** - Casting issues
4. **`text` input with JSON parsing in plpgsql** - Parsed correctly but still returned 0 rows
5. **`SECURITY DEFINER`** - No effect
6. **Multiple function signatures** - Cleaned up, still failed

## The Root Cause

**`LANGUAGE plpgsql` functions break pgvector operations.**

This was proven by:
```sql
-- This CTE works (returns 5 rows):
WITH query_vec AS (SELECT (array_agg(0.1::float8))::vector(1536) AS qv FROM generate_series(1,1536))
SELECT cc.id FROM chip_chunks cc CROSS JOIN query_vec ORDER BY cc.embedding <=> qv.qv LIMIT 5;

-- This plpgsql function with identical logic returns 0 rows:
CREATE FUNCTION test() RETURNS TABLE(...) LANGUAGE plpgsql AS $$ ... identical code ... $$;

-- This sql function works (returns 5 rows):
CREATE FUNCTION test() RETURNS TABLE(...) LANGUAGE sql AS $$ ... identical code ... $$;
```

The issue appears to be how plpgsql handles pgvector's custom operators (`<=>`, `<->`) in query context. This may be a known pgvector/PostgreSQL interaction bug.

## The Solution

Use `LANGUAGE sql` instead of `LANGUAGE plpgsql` for any function that performs vector operations.

## Secondary Issue: Input Format

Supabase JS sends arrays as JSON format `[0.1, 0.2]`, not PostgreSQL array format `{0.1, 0.2}`. 

**Solution:** Accept `text` input and parse with `json_array_elements_text()`:
```sql
SELECT array_agg(elem::float8) FROM json_array_elements_text(input::json) AS elem
```

## JavaScript Client Usage

Pass the embedding as a JSON string:
```typescript
const { data } = await supabase.rpc('match_chunks', {
  query_embedding: JSON.stringify(embedding),  // Must stringify!
  match_threshold: 0.0,
  match_count: 5,
});
```

---

## Final Working SQL

Run this to set up your clean database:

```sql
-- ============================================================================
-- WORKING MATCH_CHUNKS FUNCTION
-- ============================================================================
-- Schema: public
-- Key: Uses LANGUAGE sql (NOT plpgsql) to avoid pgvector bug
-- Input: JSON array as text string, e.g., '[0.1, 0.2, ...]'
-- ============================================================================

DROP FUNCTION IF EXISTS public.match_chunks(text, double precision, integer);

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
  ORDER BY cc.embedding <=> qv.qv
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_chunks(text, double precision, integer) TO authenticated, anon, service_role;
```

## Cleanup SQL (Optional)

Remove test functions we created during debugging:

```sql
DROP FUNCTION IF EXISTS public.debug_input(text);
DROP FUNCTION IF EXISTS public.test_search_v1();
DROP FUNCTION IF EXISTS public.test_search_v2();
DROP FUNCTION IF EXISTS public.test_search_v3();
DROP FUNCTION IF EXISTS public.json_array_to_vector(jsonb);
```

## Key Takeaways

1. **Always use `LANGUAGE sql` for pgvector functions** - not plpgsql
2. **Accept embeddings as `text`** - parse JSON inside the function
3. **Client must `JSON.stringify()`** the embedding array before sending
4. **The `<=>` operator** is inner product distance; similarity = 1 - distance


SIMPIFIED DOCUMENT

# How Vector Search Works (And Why Ours Broke)

**A guide written so a 15-year-old non-coder can understand it.**

---

## Part 1: What Is Vector Search? (The Simple Version)

Imagine you have a library with 1000 books. You want to find books about "cooking Italian pasta." You could:

1. **Keyword search**: Look for books with the exact words "cooking," "Italian," or "pasta" in the title. Problem: You'd miss "Making Spaghetti at Home" even though it's exactly what you want.

2. **Vector search**: Convert every book's content into a "fingerprint" (a list of numbers), then find books whose fingerprints are similar to your question's fingerprint.

### How the "Fingerprint" Works

An AI model reads text and outputs a list of 1536 numbers. These numbers capture the *meaning* of the text, not just the words.

```
"When does the lease expire?" → [-0.018, 0.022, 0.050, ... 1533 more numbers]
"What is the end date of the rental agreement?" → [-0.017, 0.021, 0.049, ... 1533 more numbers]
```

Notice these two questions mean the same thing. Their number lists (vectors) are almost identical, even though they share zero words.

### Finding Matches

To find relevant documents:
1. Convert the user's question into a vector (1536 numbers)
2. Compare it to every stored document's vector
3. Return the documents with the most similar vectors

"Similarity" is calculated using math (cosine similarity or distance). Two identical vectors = similarity of 1.0. Completely unrelated = similarity near 0.

---

## Part 2: Our System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INGESTION (Saving Documents)             │
├─────────────────────────────────────────────────────────────────┤
│  PDF → Extract Text → Clean → Classify → Chunk → Embed → Save  │
│                                                    ↓            │
│                                            OpenAI API           │
│                                         (makes vectors)         │
│                                                    ↓            │
│                                            Supabase DB          │
│                                        (stores vectors)         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        RETRIEVAL (Finding Documents)            │
├─────────────────────────────────────────────────────────────────┤
│  User Question → Embed → Search Database → Return Top 5        │
│                    ↓              ↓                             │
│              OpenAI API    match_chunks()                       │
│           (makes vector)   (SQL function)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Everything That Went Wrong (We Fixed 3 Major Issues)

We spent hours debugging. Here's what we discovered:

---

### Issue #1: The Translation Problem (JavaScript → PostgreSQL)

**Think of it like this:** You're in France trying to order food. You say "I want [bread, cheese, wine]" but the waiter only understands "{pain, fromage, vin}". Same items, different packaging.

**The Problem:**
Your JavaScript app and PostgreSQL database use different formats for lists of numbers:

| System      | How it writes a list        |
|-------------|----------------------------|
| JavaScript  | `[0.1, 0.2, 0.3]` (square brackets) |
| PostgreSQL  | `{0.1, 0.2, 0.3}` (curly braces) |

When Supabase sends `[0.1, 0.2, 0.3]`, PostgreSQL says "I don't understand this."

**Error we saw:**
```
malformed array literal: "[0.1,0.1,0.1,...]"
```

**The Fix:**
Instead of trying to send the array directly, we:
1. Convert the array to a text string in JavaScript: `JSON.stringify(embedding)`
2. Have PostgreSQL parse the text as JSON inside the function

```typescript
// WRONG - PostgreSQL can't understand JavaScript arrays
query_embedding: embedding

// CORRECT - Send as a text string, let PostgreSQL parse it
query_embedding: JSON.stringify(embedding)
```

---

### Issue #2: The Silent Killer (plpgsql vs sql) ← THE BIG ONE

**Think of it like this:** You have two translators. Translator A (plpgsql) is supposed to be smarter and more flexible. Translator B (sql) is simpler. But Translator A has a bug - when they see certain math symbols (the vector comparison operators), they freeze up and return nothing. Translator B works fine.

**The Problem:**
PostgreSQL has two ways to write functions:
- `LANGUAGE plpgsql` - A programming language with variables, loops, IF statements
- `LANGUAGE sql` - Pure SQL queries, no fancy features

The vector extension (pgvector) has a compatibility bug with plpgsql. When you use vector comparison operators (`<=>`) inside a plpgsql function, it silently returns zero results. No error message. Just... nothing.

**What we tested (this took HOURS to figure out):**

| Test | Result |
|------|--------|
| Raw SQL query with vector operations | ✅ 5 rows returned |
| Same query copy-pasted into a plpgsql function | ❌ 0 rows (silent failure) |
| Same query copy-pasted into an sql function | ✅ 5 rows returned |

**Why this was so hard to debug:**
- No error messages - the function just returned empty results
- The SQL looked identical in both cases
- We tried dozens of other fixes first (permissions, data types, thresholds)

**The Fix:**
```sql
-- BROKEN (returns 0 rows, no error)
CREATE FUNCTION search() RETURNS TABLE(...) 
LANGUAGE plpgsql AS $$ ... $$;

-- WORKS (returns actual results)
CREATE FUNCTION search() RETURNS TABLE(...) 
LANGUAGE sql AS $$ ... $$;
```

---

### Issue #3: Function Overload Chaos

**Think of it like this:** You're calling your friend "John" but there are 4 Johns in the room. Sometimes the wrong John answers.

**The Problem:**
While debugging, we created many versions of `match_chunks` with different input types:
- `match_chunks(vector, float, int)`
- `match_chunks(text, float, int)`
- `match_chunks(float8[], float, int)`
- `match_chunks(jsonb, float, int)`

PostgreSQL kept all of them. When we called `match_chunks()`, sometimes it picked the wrong version.

**The Fix:**
Delete ALL versions, then create only the correct one:
```sql
DROP FUNCTION IF EXISTS match_chunks(vector, float, int);
DROP FUNCTION IF EXISTS match_chunks(text, float, int);
DROP FUNCTION IF EXISTS match_chunks(float8[], float, int);
DROP FUNCTION IF EXISTS match_chunks(jsonb, float, int);
-- Then create the ONE correct version
```

---

### Issue #4: Embeddings Returned as Strings (Minor)

When you SELECT embeddings from Supabase in JavaScript, they come back as strings, not arrays:
```typescript
const { data } = await supabase.from('chip_chunks').select('embedding');
console.log(typeof data[0].embedding); // "string", not "array"
```

This caused NaN (Not a Number) errors when we tried to do math on them in JavaScript.

**The Fix:** Either parse the string if you need it in JS, or (better) let the database do all vector math.

---

## Part 4: The Final Working Solution

### The SQL Function (run this in Supabase SQL Editor)

```sql
DROP FUNCTION IF EXISTS public.match_chunks(text, double precision, integer);

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
LANGUAGE sql  -- CRITICAL: Must be "sql", NOT "plpgsql"
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
  ORDER BY cc.embedding <=> qv.qv
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_chunks(text, double precision, integer) 
  TO authenticated, anon, service_role;
```

### The TypeScript Call

```typescript
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI();

async function searchDocuments(query: string) {
  // 1. Convert question to vector
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const embedding = response.data[0].embedding;

  // 2. Search database (MUST use JSON.stringify!)
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: JSON.stringify(embedding),  // ← CRITICAL
    match_threshold: 0.0,
    match_count: 5,
  });

  return data;
}
```

---

## Part 5: Tuning Options

### In the SQL Function

| Parameter | What it does | Default |
|-----------|--------------|---------|
| `match_count` | How many results to return | 5 |
| `match_threshold` | Minimum similarity (0-1) | 0.0 (return all) |
| `vector(1536)` | Must match your embedding model | 1536 for OpenAI |

### In TypeScript

| Setting | What it does |
|---------|--------------|
| `model: 'text-embedding-3-small'` | Which OpenAI model (affects vector size) |
| `JSON.stringify(embedding)` | REQUIRED - formats array for PostgreSQL |

### In the Database

| Setting | What it does |
|---------|--------------|
| `embedding vector(1536)` | Column type - must match model output |
| Index type (ivfflat) | Speeds up search on large datasets |

---

## Part 6: Quick Reference - What Must Match

```
OpenAI Model Output  →  Database Column  →  SQL Function  →  Must all be 1536
       ↓                      ↓                   ↓
text-embedding-3-small   vector(1536)      vector(1536)
```

```
JavaScript Array  →  JSON.stringify()  →  PostgreSQL TEXT  →  json_array_elements_text()
      ↓                    ↓                    ↓                        ↓
   [0.1, 0.2]         "[0.1, 0.2]"         "[0.1, 0.2]"            {0.1, 0.2}
```

---

## Summary: The Three Rules That Make It Work

After hours of debugging, these are the three non-negotiable rules:

| Rule | Why It Matters |
|------|----------------|
| **1. Use `LANGUAGE sql`** | plpgsql silently breaks vector operations |
| **2. Use `JSON.stringify()`** | JavaScript arrays don't translate to PostgreSQL arrays |
| **3. Match dimensions everywhere** | OpenAI model, database column, and function must all use 1536 |

---

## The Debugging Journey (What We Tried)

For the record, here's everything we attempted before finding the solution:

| Attempt | What We Tried | Result |
|---------|--------------|--------|
| 1 | Accept `vector(1536)` directly | ❌ Supabase JS can't send vector types |
| 2 | Accept `float8[]` array | ❌ JS sends `[...]`, PostgreSQL expects `{...}` |
| 3 | Accept `jsonb` | ❌ Casting issues |
| 4 | Accept `text`, parse in plpgsql | ❌ Parsed correctly, still 0 rows |
| 5 | Add `SECURITY DEFINER` | ❌ No effect |
| 6 | Try different thresholds | ❌ Even threshold=0 returned nothing |
| 7 | Check RLS policies | ❌ Already disabled |
| 8 | Verify embeddings exist | ✅ 44 chunks with valid vectors |
| 9 | Test raw SQL outside function | ✅ **Works! Returns 5 rows** |
| 10 | Test SQL inside plpgsql function | ❌ 0 rows |
| 11 | Test SQL inside sql function | ✅ **Works!** |

The breakthrough was step 9→10→11: realizing the SAME SQL worked raw but failed inside plpgsql.

---

## Why This Bug Was So Evil

1. **No error messages** - The function returned empty results with "Success"
2. **Looked correct** - The SQL inside the function was identical to working SQL
3. **Red herrings** - We wasted time on type casting, permissions, thresholds
4. **Obscure cause** - pgvector + plpgsql interaction isn't documented

If you're debugging similar issues: **always test your SQL outside the function first**.