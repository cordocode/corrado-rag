// ============================================================================
// DIAGNOSTIC: SUPABASE CONNECTION & DATA CHECK
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-db-diagnostic.ts
//
// This script checks:
// 1. Can we connect to Supabase at all?
// 2. What's actually in each table?
// 3. Can we read a raw chunk?
// 4. Does the match_chunks function work?
//
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) {
        process.env[key] = valueParts.join('=');
      }
    }
  }
}

import { createClient } from '@supabase/supabase-js';

async function main(): Promise<void> {
  console.log('\n' + '█'.repeat(60));
  console.log('█  SUPABASE DIAGNOSTIC');
  console.log('█'.repeat(60) + '\n');

  // -------------------------------------------------------------------------
  // CHECK ENV VARS
  // -------------------------------------------------------------------------
  console.log('1. ENVIRONMENT VARIABLES');
  console.log('-'.repeat(60));
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('NEXT_PUBLIC_SUPABASE_URL: %s', url ? `${url.substring(0, 30)}...` : '❌ MISSING');
  console.log('SUPABASE_SERVICE_ROLE_KEY: %s', key ? `${key.substring(0, 20)}...` : '❌ MISSING');
  
  if (!url || !key) {
    console.error('\n❌ Missing credentials. Check .env.local');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // CREATE CLIENT
  // -------------------------------------------------------------------------
  console.log('\n2. CREATING SUPABASE CLIENT');
  console.log('-'.repeat(60));
  
  const supabase = createClient(url, key);
  console.log('✓ Client created');

  // -------------------------------------------------------------------------
  // TEST: FILE_TYPE_TEMPLATES
  // -------------------------------------------------------------------------
  console.log('\n3. TABLE: file_type_templates');
  console.log('-'.repeat(60));
  
  const { data: templates, error: templateError } = await supabase
    .from('file_type_templates')
    .select('*');
  
  if (templateError) {
    console.log('❌ Error: %s', templateError.message);
  } else {
    console.log('✓ Found %d templates', templates?.length || 0);
    templates?.forEach(t => console.log('   - %s (%d fields)', t.type_name, t.chip_fields?.length || 0));
  }

  // -------------------------------------------------------------------------
  // TEST: DOCUMENTS
  // -------------------------------------------------------------------------
  console.log('\n4. TABLE: documents');
  console.log('-'.repeat(60));
  
  const { data: docs, error: docError } = await supabase
    .from('documents')
    .select('id, original_name, file_type, status, uploaded_at');
  
  if (docError) {
    console.log('❌ Error: %s', docError.message);
  } else {
    console.log('✓ Found %d documents', docs?.length || 0);
    docs?.forEach(d => {
      console.log('   - %s', d.original_name);
      console.log('     ID: %s', d.id);
      console.log('     Type: %s, Status: %s', d.file_type, d.status);
    });
  }

  // -------------------------------------------------------------------------
  // TEST: CHIP_CHUNKS
  // -------------------------------------------------------------------------
  console.log('\n5. TABLE: chip_chunks');
  console.log('-'.repeat(60));
  
  const { data: chunks, error: chunkError } = await supabase
    .from('chip_chunks')
    .select('id, document_id, chunk_index, content')
    .limit(3);
  
  if (chunkError) {
    console.log('❌ Error: %s', chunkError.message);
  } else {
    console.log('✓ Found chunks (showing first 3 of total)');
    
    // Get total count
    const { count } = await supabase
      .from('chip_chunks')
      .select('*', { count: 'exact', head: true });
    console.log('   Total chunks in DB: %d', count || 0);
    
    chunks?.forEach((c, i) => {
      console.log('\n   --- Chunk %d ---', i + 1);
      console.log('   ID: %s', c.id);
      console.log('   Document ID: %s', c.document_id);
      console.log('   Index: %d', c.chunk_index);
      console.log('   Content preview: %s...', c.content?.substring(0, 200));
    });
  }

  // -------------------------------------------------------------------------
  // TEST: CHUNK WITH EMBEDDING
  // -------------------------------------------------------------------------
  console.log('\n6. CHECK: Do chunks have embeddings?');
  console.log('-'.repeat(60));
  
  const { data: chunkWithEmbed, error: embedError } = await supabase
    .from('chip_chunks')
    .select('id, embedding')
    .limit(1)
    .single();
  
  if (embedError) {
    console.log('❌ Error: %s', embedError.message);
  } else if (chunkWithEmbed) {
    const hasEmbedding = chunkWithEmbed.embedding && chunkWithEmbed.embedding.length > 0;
    console.log('Chunk has embedding: %s', hasEmbedding ? '✓ YES' : '❌ NO');
    if (hasEmbedding) {
      console.log('Embedding dimensions: %d', chunkWithEmbed.embedding.length);
      console.log('First 5 values: [%s]', chunkWithEmbed.embedding.slice(0, 5).join(', '));
    }
  }

  // -------------------------------------------------------------------------
  // TEST: CONVERSATIONS
  // -------------------------------------------------------------------------
  console.log('\n7. TABLE: conversations');
  console.log('-'.repeat(60));
  
  const { data: convs, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .limit(5);
  
  if (convError) {
    console.log('❌ Error: %s', convError.message);
  } else {
    console.log('✓ Found %d conversations', convs?.length || 0);
  }

  // -------------------------------------------------------------------------
  // TEST: MATCH_CHUNKS FUNCTION (with dummy vector)
  // -------------------------------------------------------------------------
  console.log('\n8. TEST: match_chunks() function');
  console.log('-'.repeat(60));
  
  // Create a dummy 1536-dim vector of zeros
  const dummyEmbedding = new Array(1536).fill(0.01);
  
  const { data: matchResult, error: matchError } = await supabase
    .rpc('match_chunks', {
      query_embedding: dummyEmbedding,
      match_threshold: 0.0,  // No threshold - get anything
      match_count: 3
    });
  
  if (matchError) {
    console.log('❌ Error: %s', matchError.message);
    console.log('   (This might mean the function doesn\'t exist or has wrong signature)');
  } else {
    console.log('✓ Function executed successfully');
    console.log('   Results returned: %d', matchResult?.length || 0);
    matchResult?.forEach((r: any, i: number) => {
      console.log('   - Chunk %d: similarity=%s, doc=%s', i + 1, r.similarity?.toFixed(3), r.document_name);
    });
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n' + '█'.repeat(60));
  console.log('█  SUMMARY');
  console.log('█'.repeat(60));
  
  const issues: string[] = [];
  
  if (templateError) issues.push('Cannot read file_type_templates');
  if (docError) issues.push('Cannot read documents');
  if (chunkError) issues.push('Cannot read chip_chunks');
  if (!docs?.length) issues.push('No documents in database');
  if (!chunks?.length) issues.push('No chunks in database');
  if (matchError) issues.push('match_chunks function not working');
  
  if (issues.length === 0) {
    console.log('\n✅ All checks passed!\n');
  } else {
    console.log('\n❌ Issues found:');
    issues.forEach(i => console.log('   - %s', i));
    console.log('');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});