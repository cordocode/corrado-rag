// ============================================================================
// RAG OPTIMIZATION TEST RUNNER
// ============================================================================
//
// USAGE:
//   npx tsx tests/rag-optimization/run-tests.ts
//
// WHAT IT DOES:
// 1. Extracts all PDFs ONCE, caches to /users/cordo/documents/lease_txt/
// 2. For each of 16 configs:
//    - Clears chip_chunks
//    - Chunks cached text with current params
//    - Embeds and saves to Supabase
//    - Runs 9 test questions
//    - Logs results
// 3. Generates HTML report
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
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        process.env[trimmed.substring(0, idx)] = trimmed.substring(idx + 1);
      }
    }
  }
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Your pipeline modules (fixed imports - no ../../)
import { extractText } from '../../src/file-client/extractor';
import { cleanText } from '../../src/file-client/cleaner';
import { classifyDocument, MOCK_TEMPLATES } from '../../src/file-client/classifier';

// Test modules
import { TEST_CASES, findAnswerRank, TestCase } from './test-cases';
import { TEST_CONFIGS, TestConfig, getChipFields } from './test-configs';
import { chunkForTest, ChunkerConfig } from './test-chunker';

// ----------------------------------------------------------------------------
// PATHS
// ----------------------------------------------------------------------------

const LEASE_PDF_PATH = '/users/cordo/documents/LEASES';
const LEASE_TXT_CACHE = '/users/cordo/documents/lease_txt';

// ----------------------------------------------------------------------------
// GLOBALS
// ----------------------------------------------------------------------------

let supabase: SupabaseClient;
let openai: OpenAI;

interface CachedDoc {
  fileName: string;
  cleanedText: string;
  chips: Record<string, string>;
}

let cachedDocs: CachedDoc[] = [];

interface ResultRecord {
  config: TestConfig;
  chunksCreated: number;
  avgWords: number;
  questionResults: Array<{
    testCase: TestCase;
    found: boolean;
    rank: number | null;
    similarity: number | null;
  }>;
  found: number;
  avgRank: number;
}

const allResults: ResultRecord[] = [];

// ----------------------------------------------------------------------------
// INIT
// ----------------------------------------------------------------------------

function init(): void {
  supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  openai = new OpenAI();
  console.log('[INIT] Supabase and OpenAI initialized');
}

// ----------------------------------------------------------------------------
// EXTRACTION CACHE
// ----------------------------------------------------------------------------

async function extractAndCacheAll(pdfPaths: string[]): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 0: EXTRACT & CACHE (%d PDFs)', pdfPaths.length);
  console.log('='.repeat(60));

  // Create cache dir if needed
  if (!fs.existsSync(LEASE_TXT_CACHE)) {
    fs.mkdirSync(LEASE_TXT_CACHE, { recursive: true });
    console.log('[CACHE] Created: %s', LEASE_TXT_CACHE);
  }

  for (let i = 0; i < pdfPaths.length; i++) {
    const pdfPath = pdfPaths[i];
    const fileName = path.basename(pdfPath, '.pdf');
    const cachePath = path.join(LEASE_TXT_CACHE, `${fileName}.json`);

    console.log('\n[EXTRACT] %d/%d: %s', i + 1, pdfPaths.length, fileName);

    // Check cache
    if (fs.existsSync(cachePath)) {
      console.log('[EXTRACT] Using cached version');
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      cachedDocs.push(cached);
      continue;
    }

    // Extract fresh
    console.log('[EXTRACT] Running Vision extraction...');
    const startTime = Date.now();
    
    const rawText = await extractText(pdfPath);
    console.log('[EXTRACT] Raw: %d chars', rawText.length);
    
    const cleanedText = cleanText(rawText);
    console.log('[EXTRACT] Cleaned: %d chars', cleanedText.length);
    
    // Classify to get chips
    const classification = await classifyDocument(cleanedText, MOCK_TEMPLATES);
    console.log('[EXTRACT] Classified as: %s', classification.file_type);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('[EXTRACT] Done in %ss', elapsed);

    // Cache it
    const cached: CachedDoc = {
      fileName: path.basename(pdfPath),
      cleanedText,
      chips: classification.chips,
    };
    fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2));
    console.log('[EXTRACT] Cached to: %s', cachePath);
    
    cachedDocs.push(cached);

    // Small delay between extractions
    await sleep(1000);
  }

  console.log('\n[EXTRACT] All %d documents cached', cachedDocs.length);
}

// ----------------------------------------------------------------------------
// DATABASE
// ----------------------------------------------------------------------------

async function clearChunks(): Promise<void> {
  console.log('[DB] Clearing chip_chunks...');
  const { error } = await supabase
    .from('chip_chunks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (error) throw new Error(`Clear failed: ${error.message}`);
  console.log('[DB] Cleared');
}

async function getOrCreateDocument(fileName: string): Promise<string> {
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('original_name', fileName)
    .single();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('documents')
    .insert({ original_name: fileName, status: 'complete' })
    .select('id')
    .single();

  if (error) throw new Error(`Create doc failed: ${error.message}`);
  return data.id;
}

async function saveChunks(
  docId: string,
  chunks: Array<{ content: string; chunkIndex: number; embedding: number[] }>
): Promise<void> {
  // Batch in groups of 50
  for (let i = 0; i < chunks.length; i += 50) {
    const batch = chunks.slice(i, i + 50).map(c => ({
      document_id: docId,
      content: c.content,
      chunk_index: c.chunkIndex,
      embedding: c.embedding,
    }));
    
    const { error } = await supabase.from('chip_chunks').insert(batch);
    if (error) throw new Error(`Save chunks failed: ${error.message}`);
  }
}

async function createTestRun(config: TestConfig, totalChunks: number, avgWords: number): Promise<string> {
  const { data, error } = await supabase
    .from('rag_test_runs')
    .insert({
      name: config.name,
      chunk_size_words: config.chunkSizeWords,
      chunk_overlap_words: config.chunkOverlapWords,
      chip_count: config.chipCount,
      chip_position: config.chipPosition,
      embedding_model: config.embeddingModel,
      total_chunks_created: totalChunks,
      avg_chunk_words: avgWords,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Create test run failed: ${error.message}`);
  return data.id;
}

async function saveTestResult(
  runId: string,
  testCase: TestCase,
  found: boolean,
  rank: number | null,
  similarity: number | null,
  topSims: number[]
): Promise<void> {
  const { error } = await supabase.from('rag_test_results').insert({
    test_run_id: runId,
    question_id: testCase.id,
    question: testCase.question,
    expected_answer: testCase.expectedAnswerText,
    answer_found: found,
    answer_rank: rank,
    similarity_at_rank: similarity,
    top_5_similarities: topSims,
  });
  if (error) throw new Error(`Save result failed: ${error.message}`);
}

// ----------------------------------------------------------------------------
// EMBEDDING
// ----------------------------------------------------------------------------

async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    
    const sorted = response.data.sort((a, b) => a.index - b.index);
    embeddings.push(...sorted.map(d => d.embedding));
    
    // Rate limit buffer
    if (i + 100 < texts.length) await sleep(200);
  }
  
  return embeddings;
}

async function embedQuery(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// ----------------------------------------------------------------------------
// VECTOR SEARCH
// ----------------------------------------------------------------------------

interface SearchResult {
  content: string;
  similarity: number;
}

async function searchChunks(queryEmbedding: number[]): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: 0.0,
    match_count: 5,
  });

  if (error) throw new Error(`Search failed: ${error.message}`);
  return (data || []).map((r: any) => ({ content: r.content, similarity: r.similarity }));
}

// ----------------------------------------------------------------------------
// INGESTION (uses cached docs)
// ----------------------------------------------------------------------------

async function ingestWithConfig(config: TestConfig): Promise<{ totalChunks: number; avgWords: number }> {
  const chipFields = getChipFields(config.chipCount);
  
  let totalChunks = 0;
  let totalWords = 0;

  for (let i = 0; i < cachedDocs.length; i++) {
    const doc = cachedDocs[i];
    console.log('[INGEST] %d/%d: %s', i + 1, cachedDocs.length, doc.fileName);

    // Chunk with config params
    const chunkerConfig: ChunkerConfig = {
      targetChunkWords: config.chunkSizeWords,
      overlapWords: config.chunkOverlapWords,
      chipFields,
      chipPosition: config.chipPosition,
    };
    
    const chunkResult = chunkForTest(doc.cleanedText, doc.chips, chunkerConfig);
    console.log('[INGEST]   %d chunks, avg %d words', chunkResult.totalChunks, chunkResult.avgWords);

    // Embed
    const contents = chunkResult.chunks.map(c => c.content);
    const embeddings = await embedTexts(contents);

    // Get/create document
    const docId = await getOrCreateDocument(doc.fileName);

    // Save chunks
    const chunksWithEmbeddings = chunkResult.chunks.map((c, j) => ({
      content: c.content,
      chunkIndex: c.chunkIndex,
      embedding: embeddings[j],
    }));
    await saveChunks(docId, chunksWithEmbeddings);

    totalChunks += chunkResult.totalChunks;
    totalWords += chunkResult.totalChunks * chunkResult.avgWords;
  }

  const avgWords = totalChunks > 0 ? Math.round(totalWords / totalChunks) : 0;
  return { totalChunks, avgWords };
}

// ----------------------------------------------------------------------------
// TEST EXECUTION
// ----------------------------------------------------------------------------

async function runTests(runId: string): Promise<{ found: number; avgRank: number; questionResults: ResultRecord['questionResults'] }> {
  let foundCount = 0;
  let rankSum = 0;
  const questionResults: ResultRecord['questionResults'] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    console.log('[TEST] %s: %s', testCase.id, testCase.description);

    // Embed question
    const queryEmb = await embedQuery(testCase.question);

    // Search
    const results = await searchChunks(queryEmb);
    console.log('[TEST]   Top similarity: %.4f', results[0]?.similarity || 0);

    // AI validation to find rank
    const chunksWithRank = results.map((r, idx) => ({ content: r.content, rank: idx + 1 }));
    const rank = await findAnswerRank(testCase.question, testCase.expectedAnswerText, chunksWithRank);

    const found = rank !== null;
    const simAtRank = found ? results[rank - 1].similarity : null;
    const topSims = results.map(r => r.similarity);

    // Log result
    if (found) {
      console.log('[TEST]   ✓ Found at rank %d (sim: %.4f)', rank, simAtRank);
      foundCount++;
      rankSum += rank;
    } else {
      console.log('[TEST]   ✗ Not found in top 5');
    }

    // Save to DB
    await saveTestResult(runId, testCase, found, rank, simAtRank, topSims);

    questionResults.push({ testCase, found, rank, similarity: simAtRank });

    // Small delay for Haiku rate limit
    await sleep(500);
  }

  const avgRank = foundCount > 0 ? rankSum / foundCount : 0;
  return { found: foundCount, avgRank, questionResults };
}

// ----------------------------------------------------------------------------
// SINGLE CONFIG RUN
// ----------------------------------------------------------------------------

async function runConfig(config: TestConfig, configIndex: number): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('CONFIG %d/%d: %s', configIndex + 1, TEST_CONFIGS.length, config.name);
  console.log('='.repeat(60));
  console.log('  Chunk size: %d words', config.chunkSizeWords);
  console.log('  Overlap: %d words', config.chunkOverlapWords);
  console.log('  Chip count: %d', config.chipCount);
  console.log('  Chip position: %s', config.chipPosition);

  // Clear chunks
  await clearChunks();

  // Ingest
  console.log('\n[INGEST] Starting...');
  const startIngest = Date.now();
  const { totalChunks, avgWords } = await ingestWithConfig(config);
  const ingestTime = ((Date.now() - startIngest) / 1000).toFixed(1);
  console.log('[INGEST] Complete: %d chunks in %ss', totalChunks, ingestTime);

  // Create test run record
  const runId = await createTestRun(config, totalChunks, avgWords);

  // Run tests
  console.log('\n[TEST] Running %d questions...', TEST_CASES.length);
  const startTest = Date.now();
  const { found, avgRank, questionResults } = await runTests(runId);
  const testTime = ((Date.now() - startTest) / 1000).toFixed(1);
  
  console.log('\n[RESULT] Found: %d/%d, Avg Rank: %.2f, Time: %ss', 
    found, TEST_CASES.length, avgRank, testTime);

  // Store for report
  allResults.push({
    config,
    chunksCreated: totalChunks,
    avgWords,
    questionResults,
    found,
    avgRank,
  });
}

// ----------------------------------------------------------------------------
// HTML REPORT
// ----------------------------------------------------------------------------

function generateHTMLReport(): void {
  const sorted = [...allResults].sort((a, b) => {
    if (b.found !== a.found) return b.found - a.found;
    return a.avgRank - b.avgRank;
  });

  const questionIds = TEST_CASES.map(tc => tc.id);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RAG Optimization Results</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { color: #38bdf8; margin-bottom: 0.5rem; }
    h2 { color: #94a3b8; margin: 2rem 0 1rem; }
    .winner { background: linear-gradient(135deg, #065f46, #064e3b); border: 1px solid #10b981; border-radius: 12px; padding: 1.5rem; margin: 1rem 0 2rem; }
    .winner h3 { color: #34d399; }
    .stats { display: flex; gap: 2rem; margin-top: 1rem; flex-wrap: wrap; }
    .stat { text-align: center; }
    .stat .val { font-size: 2rem; font-weight: bold; color: #6ee7b7; }
    .stat .lbl { color: #a7f3d0; font-size: 0.875rem; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
    .chart { background: #1e293b; border-radius: 12px; padding: 1rem; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; margin-bottom: 2rem; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #334155; color: #94a3b8; }
    .rank { display: inline-block; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 4px; font-weight: bold; font-size: 0.75rem; }
    .r1 { background: #22c55e; color: #052e16; }
    .r2 { background: #84cc16; color: #1a2e05; }
    .r3 { background: #eab308; color: #422006; }
    .r4 { background: #f97316; color: #431407; }
    .r5 { background: #ef4444; color: #450a0a; }
    .miss { color: #64748b; }
    .param { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .pcard { background: #1e293b; border-radius: 12px; padding: 1rem; }
    .pcard h4 { color: #94a3b8; margin-bottom: 0.5rem; }
    .prow { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #334155; }
    .prow:last-child { border: none; }
    .good { color: #4ade80; }
    .bad { color: #f87171; }
  </style>
</head>
<body>
  <h1>RAG Optimization Results</h1>
  <p style="color:#64748b">Tested ${allResults.length} configs × ${TEST_CASES.length} questions</p>

  <div class="winner">
    <h3>🏆 Best: ${sorted[0]?.config.name || 'N/A'}</h3>
    <div class="stats">
      <div class="stat"><div class="val">${sorted[0]?.found || 0}/${TEST_CASES.length}</div><div class="lbl">Found</div></div>
      <div class="stat"><div class="val">${sorted[0]?.avgRank.toFixed(2) || '-'}</div><div class="lbl">Avg Rank</div></div>
      <div class="stat"><div class="val">${sorted[0]?.chunksCreated || 0}</div><div class="lbl">Chunks</div></div>
      <div class="stat"><div class="val">${sorted[0]?.config.chunkSizeWords}w</div><div class="lbl">Chunk Size</div></div>
      <div class="stat"><div class="val">${sorted[0]?.config.chunkOverlapWords}w</div><div class="lbl">Overlap</div></div>
      <div class="stat"><div class="val">${sorted[0]?.config.chipCount}</div><div class="lbl">Chips</div></div>
    </div>
  </div>

  <div class="charts">
    <div class="chart"><canvas id="c1"></canvas></div>
    <div class="chart"><canvas id="c2"></canvas></div>
  </div>

  <h2>Parameter Impact</h2>
  <div class="param">
    ${paramCard('Chunk Size', 'chunkSizeWords', [200, 500])}
    ${paramCard('Overlap', 'chunkOverlapWords', [0, 50])}
    ${paramCard('Chip Count', 'chipCount', [2, 5])}
    ${paramCard('Chip Position', 'chipPosition', ['prepend', 'prepend_append'])}
  </div>

  <h2>All Configurations</h2>
  <table>
    <tr><th>#</th><th>Config</th><th>Chunks</th>${questionIds.map(q => `<th>${q}</th>`).join('')}<th>Found</th><th>Rank</th></tr>
    ${sorted.map((r, i) => `<tr>
      <td>${i + 1}</td>
      <td>${r.config.name}</td>
      <td>${r.chunksCreated}</td>
      ${r.questionResults.map(qr => qr.found ? `<td><span class="rank r${qr.rank}">${qr.rank}</span></td>` : `<td class="miss">✗</td>`).join('')}
      <td>${r.found}/${TEST_CASES.length}</td>
      <td>${r.avgRank.toFixed(2)}</td>
    </tr>`).join('')}
  </table>

  <script>
    new Chart(document.getElementById('c1'), {
      type: 'bar',
      data: { labels: ${JSON.stringify(sorted.map(r => r.config.name))}, datasets: [{ data: ${JSON.stringify(sorted.map(r => r.found))}, backgroundColor: ${JSON.stringify(sorted.map(r => r.found >= 7 ? '#22c55e' : r.found >= 5 ? '#eab308' : '#ef4444'))} }] },
      options: { plugins: { legend: { display: false }, title: { display: true, text: 'Questions Found', color: '#e2e8f0' } }, scales: { y: { max: ${TEST_CASES.length}, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8', maxRotation: 45 } } } }
    });
    new Chart(document.getElementById('c2'), {
      type: 'bar',
      data: { labels: ${JSON.stringify(sorted.map(r => r.config.name))}, datasets: [{ data: ${JSON.stringify(sorted.map(r => r.avgRank))}, backgroundColor: '#38bdf8' }] },
      options: { plugins: { legend: { display: false }, title: { display: true, text: 'Avg Rank (lower=better)', color: '#e2e8f0' } }, scales: { y: { max: 5, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8', maxRotation: 45 } } } }
    });
  </script>
</body>
</html>`;

  function paramCard(label: string, key: string, vals: any[]): string {
    const impacts = vals.map(v => {
      const m = allResults.filter(r => (r.config as any)[key] === v);
      const avg = m.length ? m.reduce((s, x) => s + x.found, 0) / m.length : 0;
      return { v, avg };
    });
    const max = Math.max(...impacts.map(i => i.avg));
    const min = Math.min(...impacts.map(i => i.avg));
    return `<div class="pcard"><h4>${label}</h4>${impacts.map(i => 
      `<div class="prow"><span>${i.v}</span><span class="${i.avg === max ? 'good' : i.avg === min ? 'bad' : ''}">${i.avg.toFixed(1)}/${TEST_CASES.length}</span></div>`
    ).join('')}</div>`;
  }

  const outPath = path.join(process.cwd(), 'rag-optimization-results.html');
  fs.writeFileSync(outPath, html);
  console.log('\n[REPORT] Saved: %s', outPath);
}

// ----------------------------------------------------------------------------
// UTILS
// ----------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('\n' + '='.repeat(60));
  console.log('RAG OPTIMIZATION TEST HARNESS');
  console.log('='.repeat(60));
  console.log('Lease PDFs: %s', LEASE_PDF_PATH);
  console.log('Text cache: %s', LEASE_TXT_CACHE);
  console.log('Configs to test: %d', TEST_CONFIGS.length);
  console.log('Questions per config: %d', TEST_CASES.length);

  // Verify paths
  if (!fs.existsSync(LEASE_PDF_PATH)) {
    console.error('\n[ERROR] Lease directory not found: %s', LEASE_PDF_PATH);
    process.exit(1);
  }

  // Find PDFs
  const pdfs = fs.readdirSync(LEASE_PDF_PATH)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(LEASE_PDF_PATH, f));

  console.log('PDFs found: %d', pdfs.length);
  pdfs.forEach(p => console.log('  - %s', path.basename(p)));

  if (pdfs.length === 0) {
    console.error('\n[ERROR] No PDFs found');
    process.exit(1);
  }

  // Init
  init();

  // Phase 0: Extract and cache (only runs once per PDF)
  await extractAndCacheAll(pdfs);

  // Phase 1: Run all configs
  for (let i = 0; i < TEST_CONFIGS.length; i++) {
    await runConfig(TEST_CONFIGS[i], i);
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log('Total time: %s minutes', elapsed);

  // Sort and show winner
  const sorted = [...allResults].sort((a, b) => {
    if (b.found !== a.found) return b.found - a.found;
    return a.avgRank - b.avgRank;
  });

  console.log('\n🏆 WINNER: %s', sorted[0].config.name);
  console.log('   Found: %d/%d', sorted[0].found, TEST_CASES.length);
  console.log('   Avg Rank: %.2f', sorted[0].avgRank);
  console.log('   Params: %dw chunks, %dw overlap, %d chips, %s',
    sorted[0].config.chunkSizeWords,
    sorted[0].config.chunkOverlapWords,
    sorted[0].config.chipCount,
    sorted[0].config.chipPosition
  );

  // Generate report
  generateHTMLReport();

  console.log('\n✅ Done!\n');
}

main().catch(err => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});