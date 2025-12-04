// ============================================================================
// TEST SCRIPT: CLEANER
// ============================================================================
//
// USAGE:
//   npx tsx tests/test-cleaner.ts /path/to/extraction-output.txt
//
// EXAMPLE:
//   npx tsx tests/test-cleaner.ts ./extraction-output.txt
//
// This tests the cleaner module against extracted text to verify
// it properly removes artifacts while preserving content.
//
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { cleanText, getCleaningStats, hasSpecialMarkers, getSectionBreaks } from '../src/file-client/cleaner';

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('TEXT CLEANER TEST');
  console.log('='.repeat(60) + '\n');

  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx tests/test-cleaner.ts /path/to/extraction-output.txt');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error('ERROR: File not found:', filePath);
    process.exit(1);
  }

  console.log('Input file:', filePath);
  console.log('\n' + '-'.repeat(60) + '\n');

  try {
    // Read raw extracted text
    const rawText = fs.readFileSync(filePath, 'utf-8');
    console.log('Raw text length: %s chars', rawText.length.toLocaleString());

    // Check for special markers before cleaning
    const markersBefore = hasSpecialMarkers(rawText);
    console.log('Special markers found:');
    console.log('  Tables: %d', markersBefore.tables);
    console.log('  Handwritten: %d', markersBefore.handwritten);

    // Clean the text
    console.log('\n' + '-'.repeat(60));
    console.log('CLEANING...');
    console.log('-'.repeat(60) + '\n');

    const cleanedText = cleanText(rawText);

    // Get stats
    const stats = getCleaningStats(rawText, cleanedText);
    console.log('Results:');
    console.log('  Original length: %s chars', stats.originalLength.toLocaleString());
    console.log('  Cleaned length: %s chars', stats.cleanedLength.toLocaleString());
    console.log('  Reduction: %s', stats.reduction);
    console.log('  Page markers removed: %d', stats.pagesRemoved);

    // Check markers preserved
    const markersAfter = hasSpecialMarkers(cleanedText);
    console.log('\nSpecial markers preserved:');
    console.log('  Tables: %d', markersAfter.tables);
    console.log('  Handwritten: %d', markersAfter.handwritten);

    // Section breaks
    const sectionBreaks = getSectionBreaks(cleanedText);
    console.log('\nSection breaks inserted: %d', sectionBreaks.length);

    // Save cleaned output
    const outputPath = path.join(process.cwd(), 'cleaned-output.txt');
    fs.writeFileSync(outputPath, cleanedText);
    console.log('\nCleaned output saved to: %s', outputPath);

    // Show preview
    console.log('\n' + '-'.repeat(60));
    console.log('PREVIEW (first 2000 chars of cleaned text)');
    console.log('-'.repeat(60) + '\n');
    console.log(cleanedText.substring(0, 2000));
    if (cleanedText.length > 2000) {
      console.log('\n... [%s more chars in cleaned-output.txt]', (cleanedText.length - 2000).toLocaleString());
    }

    // Show what was removed (sample)
    console.log('\n' + '-'.repeat(60));
    console.log('SAMPLE OF REMOVED CONTENT');
    console.log('-'.repeat(60) + '\n');
    
    // Find page markers that were removed
    const pageMarkers = rawText.match(/^---\s*PAGE\s+\d+\s*---\s*$/gm) || [];
    if (pageMarkers.length > 0) {
      console.log('Page markers removed (%d total):', pageMarkers.length);
      console.log('  Example: "%s"', pageMarkers[0]);
    }

    // Find instruction echo if any
    const instructionMatch = rawText.match(/INSTRUCTIONS:[\s\S]*?(?=\n\n[A-Z]|\n---)/);
    if (instructionMatch) {
      console.log('\nInstruction echo removed:');
      console.log('  "%s..."', instructionMatch[0].substring(0, 100));
    }

    // Find footer patterns
    const footerPatterns = rawText.match(/^[a-z]+\.[a-z]+\.[a-z]+\s*$/gmi) || [];
    if (footerPatterns.length > 0) {
      console.log('\nFooter patterns removed (%d total):', footerPatterns.length);
      footerPatterns.slice(0, 3).forEach(f => console.log('  "%s"', f.trim()));
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