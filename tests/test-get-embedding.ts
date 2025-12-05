// ============================================================================
// GET RAW EMBEDDING STRING FOR SQL TESTING
// ============================================================================
//
// Outputs the embedding as a string you can paste directly into SQL
//
// USAGE:
//   npx tsx tests/test-get-embedding.ts
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

import OpenAI from 'openai';

async function main(): Promise<void> {
  const openai = new OpenAI();
  const query = 'when does the EP minerals lease expire';

  console.log('Query: "%s"', query);
  console.log('Embedding...\n');

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });

  const embedding = response.data[0].embedding;
  const vectorString = '[' + embedding.join(',') + ']';

  // Save to file (too long for terminal)
  const outputPath = path.join(process.cwd(), 'query-embedding.txt');
  fs.writeFileSync(outputPath, vectorString);

  console.log('Embedding dimensions: %d', embedding.length);
  console.log('First 5 values: [%s, ...]', embedding.slice(0, 5).join(', '));
  console.log('\nFull embedding saved to: %s', outputPath);
  console.log('\nNow run this SQL in Supabase (paste the file contents for EMBEDDING_HERE):\n');
  console.log(`
SELECT 
  cc.id,
  cc.chunk_index,
  d.original_name,
  1 - (cc.embedding <=> 'EMBEDDING_HERE'::vector) AS similarity
FROM chip_chunks cc
LEFT JOIN documents d ON cc.document_id = d.id
ORDER BY cc.embedding <=> 'EMBEDDING_HERE'::vector
LIMIT 10;
  `);
}

main().catch(console.error);