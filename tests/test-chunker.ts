// ============================================================================
// TEST SCRIPT: CHUNKER
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-chunker.ts ./cleaned-output.txt ./classification-output.json
//
// This tests the chunker module which splits document text into chip-chunks
// ready for embedding.
//
// OUTPUT:
// - Prints chunking stats to console
// - Saves chunks to chunks-output.json
// - Previews first few chunks
//
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { chunkDocument, estimateChunkCount, ChunkerOptions } from '../src/file-client/chunker';
import { ClassificationResult } from '../src/file-client/classifier';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('DOCUMENT CHUNKER TEST');
  console.log('='.repeat(60) + '\n');

  const textPath = process.argv[2];
  const classificationPath = process.argv[3];

  if (!textPath || !classificationPath) {
    console.error('Usage: npx tsx tests/test-chunker.ts ./cleaned-output.txt ./classification-output.json');
    process.exit(1);
  }

  if (!fs.existsSync(textPath)) {
    console.error('ERROR: Text file not found:', textPath);
    process.exit(1);
  }

  if (!fs.existsSync(classificationPath)) {
    console.error('ERROR: Classification file not found:', classificationPath);
    process.exit(1);
  }

  console.log('Text file:', textPath);
  console.log('Classification file:', classificationPath);

  try {
    // Load inputs
    const text = fs.readFileSync(textPath, 'utf-8');
    const classificationData = JSON.parse(fs.readFileSync(classificationPath, 'utf-8'));
    const classification: ClassificationResult = classificationData.result;

    console.log('\n' + '-'.repeat(60));
    console.log('INPUT SUMMARY');
    console.log('-'.repeat(60) + '\n');

    console.log('Text length: %s chars', text.length.toLocaleString());
    console.log('Word count: ~%s', text.split(/\s+/).filter(w => w).length.toLocaleString());
    console.log('File type: %s', classification.file_type);
    console.log('Chips: %d fields', Object.keys(classification.chips).length);

    // Estimate chunks
    const estimate = estimateChunkCount(text);
    console.log('Estimated chunks: ~%d', estimate);

    console.log('\n' + '-'.repeat(60));
    console.log('CHUNKING OPTIONS');
    console.log('-'.repeat(60) + '\n');

    const options: ChunkerOptions = {
      targetChunkWords: 400,
      minChunkWords: 100,
      overlapWords: 50,
      respectSectionBreaks: true,
    };

    console.log('Target words per chunk: %d', options.targetChunkWords);
    console.log('Minimum words per chunk: %d', options.minChunkWords);
    console.log('Overlap words: %d', options.overlapWords);
    console.log('Respect section breaks: %s', options.respectSectionBreaks);

    console.log('\n' + '-'.repeat(60));
    console.log('CHUNKING...');
    console.log('-'.repeat(60) + '\n');

    const startTime = Date.now();
    const result = chunkDocument(text, classification.chips, options);
    const duration = ((Date.now() - startTime)).toFixed(0);

    console.log('\n' + '-'.repeat(60));
    console.log('RESULTS');
    console.log('-'.repeat(60) + '\n');

    console.log('Time: %sms', duration);
    console.log('Total chunks: %d', result.totalChunks);
    console.log('Average words per chunk: %d', result.averageWords);

    // Word count distribution
    const wordCounts = result.chunks.map(c => c.wordCount);
    const minWords = Math.min(...wordCounts);
    const maxWords = Math.max(...wordCounts);
    console.log('Word count range: %d - %d', minWords, maxWords);

    console.log('\n' + '-'.repeat(60));
    console.log('CHIP HEADER');
    console.log('-'.repeat(60) + '\n');
    console.log(result.chipHeader);

    console.log('\n' + '-'.repeat(60));
    console.log('CHUNK PREVIEWS');
    console.log('-'.repeat(60));

    // Show first 3 chunks
    const previewCount = Math.min(3, result.chunks.length);
    for (let i = 0; i < previewCount; i++) {
      const chunk = result.chunks[i];
      console.log('\n--- Chunk %d/%d (%d words) ---\n', 
        i + 1, result.totalChunks, chunk.wordCount);
      
      // Show first 500 chars of content
      const preview = chunk.content.substring(0, 800);
      console.log(preview);
      if (chunk.content.length > 800) {
        console.log('\n... [%d more chars]', chunk.content.length - 800);
      }
    }

    if (result.totalChunks > previewCount) {
      console.log('\n... [%d more chunks]', result.totalChunks - previewCount);
    }

    // Save full output
    const outputPath = path.join(process.cwd(), 'chunks-output.json');
    const outputData = {
      input_text_file: textPath,
      input_classification_file: classificationPath,
      timestamp: new Date().toISOString(),
      options,
      summary: {
        totalChunks: result.totalChunks,
        averageWords: result.averageWords,
        minWords,
        maxWords,
        chipHeaderLength: result.chipHeader.length,
      },
      chipHeader: result.chipHeader,
      chunks: result.chunks.map(c => ({
        chunkIndex: c.chunkIndex,
        wordCount: c.wordCount,
        contentLength: c.content.length,
        content: c.content,
      })),
    };
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log('\n' + '-'.repeat(60));
    console.log('Full output saved to: %s', outputPath);

    // Also save just the chunk contents as a simple text file for review
    const textOutputPath = path.join(process.cwd(), 'chunks-output.txt');
    const textOutput = result.chunks.map((c, i) => 
      `${'='.repeat(60)}\nCHUNK ${i + 1}/${result.totalChunks} (${c.wordCount} words)\n${'='.repeat(60)}\n\n${c.content}`
    ).join('\n\n');
    fs.writeFileSync(textOutputPath, textOutput);
    console.log('Text preview saved to: %s', textOutputPath);

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ FAILED:', error);
    process.exit(1);
  }
}

main();