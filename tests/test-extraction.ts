// ============================================================================
// TEST SCRIPT: EXTRACTOR (CLAUDE VISION)
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-extraction.ts /path/to/file.pdf
//
// EXAMPLE:
//   npx tsx tests/test-extraction.ts /users/cordo/documents/RAG-TESTS/lease_1.pdf
//
// COST: ~$0.002/page with Haiku. 18-page lease ≈ $0.04
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

import { extractText } from '../src/file-client/extractor';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('TEXT EXTRACTION TEST');
  console.log('='.repeat(60) + '\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not found in .env.local');
    process.exit(1);
  }

  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx tests/test-extraction.ts /path/to/file.pdf');
    process.exit(1);
  }

  console.log('File:', filePath);
  console.log('Model: claude-3-5-haiku-20241022 (cheap & fast)');
  console.log('\n' + '-'.repeat(60) + '\n');

  try {
    const startTime = Date.now();
    const text = await extractText(filePath);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '-'.repeat(60));
    console.log('RESULTS');
    console.log('-'.repeat(60));
    console.log('Time: %ss', duration);
    console.log('Characters: %s', text.length.toLocaleString());
    console.log('Words: %s', text.split(/\s+/).filter(w => w).length.toLocaleString());
    console.log('Tables found: %d', (text.match(/\[TABLE\]/g) || []).length);
    console.log('Handwritten items: %d', (text.match(/\[HANDWRITTEN:/g) || []).length);

    // Save to file
    const outputPath = path.join(process.cwd(), 'extraction-output.txt');
    fs.writeFileSync(outputPath, text);
    console.log('\nOutput saved to: %s', outputPath);

    // Print first 3000 chars
    console.log('\n' + '-'.repeat(60));
    console.log('PREVIEW (first 3000 chars)');
    console.log('-'.repeat(60) + '\n');
    console.log(text.substring(0, 3000));
    if (text.length > 3000) {
      console.log('\n... [%s more chars in extraction-output.txt]', (text.length - 3000).toLocaleString());
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ FAILED:', error);
    process.exit(1);
  }
}

main();