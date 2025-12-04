// ============================================================================
// TEST SCRIPT: CLASSIFIER
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-classifier.ts /path/to/cleaned-output.txt
//
// EXAMPLE:
//   npx tsx tests/test-classifier.ts ./cleaned-output.txt
//
// COST: ~$0.001 per classification with Haiku
//
// This tests the classifier module which determines document type
// and extracts chip values in a single LLM call.
//
// OUTPUT:
// - Prints classification results to console
// - Saves full result to classification-output.json
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

import { classifyDocument, MOCK_TEMPLATES, ClassificationResult } from '../src/file-client/classifier';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('DOCUMENT CLASSIFIER TEST');
  console.log('='.repeat(60) + '\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not found in .env.local');
    process.exit(1);
  }

  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx tests/test-classifier.ts /path/to/cleaned-output.txt');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error('ERROR: File not found:', filePath);
    process.exit(1);
  }

  console.log('Input file:', filePath);
  console.log('Model: claude-3-5-haiku-20241022');
  console.log('\n' + '-'.repeat(60));
  console.log('AVAILABLE TEMPLATES');
  console.log('-'.repeat(60) + '\n');

  for (const template of MOCK_TEMPLATES) {
    console.log('Type: %s', template.type_name);
    console.log('  Fields: %s', template.chip_fields.join(', '));
    console.log('');
  }

  console.log('-'.repeat(60));
  console.log('CLASSIFYING...');
  console.log('-'.repeat(60) + '\n');

  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const startTime = Date.now();
    
    const result = await classifyDocument(text, MOCK_TEMPLATES);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '-'.repeat(60));
    console.log('RESULTS');
    console.log('-'.repeat(60) + '\n');

    console.log('Time: %ss', duration);
    console.log('File Type: %s', result.file_type);
    console.log('Confidence: %s%%', (result.confidence * 100).toFixed(0));
    
    if (result.reasoning) {
      console.log('Reasoning: %s', result.reasoning);
    }

    console.log('\n' + '-'.repeat(60));
    console.log('EXTRACTED CHIPS');
    console.log('-'.repeat(60) + '\n');

    const maxKeyLength = Math.max(...Object.keys(result.chips).map(k => k.length));
    for (const [key, value] of Object.entries(result.chips)) {
      const paddedKey = key.padEnd(maxKeyLength);
      const displayValue = value || '(not found)';
      console.log('  %s : %s', paddedKey, displayValue);
    }

    // Save full result to JSON
    const outputPath = path.join(process.cwd(), 'classification-output.json');
    const outputData = {
      input_file: filePath,
      timestamp: new Date().toISOString(),
      result
    };
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log('\nFull result saved to: %s', outputPath);

    // Also show the chip-chunk format preview
    console.log('\n' + '-'.repeat(60));
    console.log('CHIP-CHUNK HEADER PREVIEW');
    console.log('-'.repeat(60) + '\n');
    console.log('This header will be prepended to each chunk:\n');
    console.log(formatChipsForChunk(result.chips));

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ FAILED:', error);
    process.exit(1);
  }
}

/**
 * Formats chips into the header format that will be prepended to chunks
 * This is a preview of what the chunker will produce
 */
function formatChipsForChunk(chips: Record<string, string>): string {
  const lines = ['[DOCUMENT CONTEXT]'];
  
  for (const [key, value] of Object.entries(chips)) {
    if (value) {
      // Convert snake_case to Title Case
      const label = key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      lines.push(`${label}: ${value}`);
    }
  }
  
  lines.push('[CONTENT]');
  return lines.join('\n');
}

main();