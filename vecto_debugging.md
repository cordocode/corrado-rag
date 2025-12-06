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