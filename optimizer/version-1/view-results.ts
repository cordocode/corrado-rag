// ============================================================================
// VIEW TEST RESULTS
// ============================================================================
//
// USAGE: npx tsx tests/rag-optimization/view-results.ts
//
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';

// Load env
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) {
      const i = t.indexOf('=');
      if (i > 0) process.env[t.substring(0, i)] = t.substring(i + 1);
    }
  }
}

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main(): Promise<void> {
  // Fetch runs
  const { data: runs } = await supabase
    .from('rag_test_runs')
    .select('*')
    .order('created_at', { ascending: true });

  if (!runs?.length) {
    console.log('No test runs found. Run the tests first.');
    return;
  }

  console.log('\n' + '═'.repeat(90));
  console.log('RAG TEST RESULTS');
  console.log('═'.repeat(90));

  const analyses = [];

  for (const run of runs) {
    const { data: results } = await supabase
      .from('rag_test_results')
      .select('*')
      .eq('test_run_id', run.id);

    const found = results?.filter(r => r.answer_found).length || 0;
    const total = results?.length || 0;
    const ranks = results?.filter(r => r.answer_rank).map(r => r.answer_rank) || [];
    const avgRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;

    analyses.push({ run, found, total, avgRank });
  }

  // Sort by found desc, then avgRank asc
  analyses.sort((a, b) => {
    if (b.found !== a.found) return b.found - a.found;
    return a.avgRank - b.avgRank;
  });

  console.log('\n%-4s %-32s %6s %6s %6s %8s %10s',
    'Rank', 'Config', 'Chunks', 'Words', 'Found', 'AvgRank', 'Model');
  console.log('-'.repeat(90));

  analyses.forEach((a, i) => {
    const model = a.run.embedding_model.includes('large') ? 'LARGE' : 'small';
    console.log('%-4d %-32s %6d %6d %6s %8.2f %10s',
      i + 1,
      a.run.name,
      a.run.total_chunks_created,
      Math.round(a.run.avg_chunk_words),
      `${a.found}/${a.total}`,
      a.avgRank,
      model
    );
  });

  console.log('-'.repeat(90));

  // Parameter analysis
  console.log('\n' + '═'.repeat(90));
  console.log('PARAMETER IMPACT (small model only)');
  console.log('═'.repeat(90));

  const small = analyses.filter(a => !a.run.embedding_model.includes('large'));

  const byParam = (key: string, values: any[]) => {
    for (const val of values) {
      const matches = small.filter(a => a.run[key] === val);
      const avgFound = matches.reduce((s, m) => s + m.found, 0) / matches.length;
      console.log('  %s = %s: avg found = %.1f/%d',
        key, String(val).padEnd(15), avgFound, matches[0]?.total || 0);
    }
  };

  console.log('\nChunk Size:');
  byParam('chunk_size_words', [200, 500]);

  console.log('\nOverlap:');
  byParam('chunk_overlap_words', [0, 50]);

  console.log('\nChip Count:');
  byParam('chip_count', [2, 5]);

  console.log('\nChip Position:');
  byParam('chip_position', ['prepend', 'prepend_append']);

  // Best config
  const best = analyses[0];
  console.log('\n' + '═'.repeat(90));
  console.log('🏆 BEST: %s', best.run.name);
  console.log('   Found: %d/%d, Avg Rank: %.2f', best.found, best.total, best.avgRank);
  console.log('═'.repeat(90) + '\n');
}

main().catch(console.error);