// ============================================================================
// TEXT CHUNKER (CHIP-CHUNK GENERATOR)
// ============================================================================
//
// This module splits cleaned document text into chunks and prepends chip
// metadata to each chunk. The result is "chip-chunks" ready for embedding.
//
// Pipeline position:
//   extractor.ts → cleaner.ts → classifier.ts → chunker.ts → embedder.ts
//
// WHAT IT DOES:
// 1. Takes cleaned text + extracted chips from classifier
// 2. Splits text into ~300-500 word chunks
// 3. Prepends chip header to each chunk
// 4. Returns array of chip-chunks ready for embedding
//
// WHY CHIPS IN EVERY CHUNK:
// The "chip-chunk" format embeds document identity directly into the vector
// space. When you search for "John Smith's lease", the chip header makes
// chunks from John Smith's lease more semantically similar to the query.
// This is more robust than metadata filtering because:
// - No separate filter logic needed
// - Works across any vector database
// - Similarity naturally incorporates document context
//
// CHUNK FORMAT:
// [DOCUMENT CONTEXT]
// Property Address: 595 Double Eagle Court, Reno, NV 89521-6009
// Tenant Name: EP Minerals, LLC
// ...
// [CONTENT]
// The actual document text for this chunk...
//
// USAGE:
// import { chunkDocument } from './chunker';
// const chunks = chunkDocument(cleanedText, classificationResult.chips);
//
// ============================================================================

import { Chips } from '../types';

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------

export interface ChunkerOptions {
  // Target words per chunk (default: 400, range: 300-500)
  targetChunkWords?: number;
  
  // Minimum words per chunk - prevents tiny final chunks (default: 100)
  minChunkWords?: number;
  
  // Overlap words between chunks for continuity (default: 50)
  overlapWords?: number;
  
  // Use section breaks (---) as preferred split points (default: true)
  respectSectionBreaks?: boolean;
  
  // Include chunk index in output (default: true)
  includeChunkIndex?: boolean;
}

const DEFAULT_OPTIONS: ChunkerOptions = {
  targetChunkWords: 400,
  minChunkWords: 100,
  overlapWords: 50,
  respectSectionBreaks: true,
  includeChunkIndex: true,
};

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ChipChunk {
  content: string;           // Full chunk content with chip header prepended
  chunkIndex: number;        // Position in document (0, 1, 2, ...)
  wordCount: number;         // Words in the content portion (excluding header)
  startChar: number;         // Character offset in original text
  endChar: number;           // Character offset in original text
}

export interface ChunkingResult {
  chunks: ChipChunk[];
  totalChunks: number;
  averageWords: number;
  chipHeader: string;        // The header that was prepended to each chunk
}

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Splits document text into chip-chunks
 * 
 * @param text - Cleaned document text
 * @param chips - Extracted metadata from classifier
 * @param options - Chunking configuration
 * @returns ChunkingResult with array of chip-chunks
 */
export function chunkDocument(
  text: string,
  chips: Chips,
  options: ChunkerOptions = {}
): ChunkingResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  console.log('[CHUNKER] Starting chunking...');
  console.log('[CHUNKER] Text length: %d chars', text.length);
  console.log('[CHUNKER] Target chunk size: %d words', opts.targetChunkWords);
  console.log('[CHUNKER] Overlap: %d words', opts.overlapWords);

  // Build the chip header
  const chipHeader = buildChipHeader(chips);
  console.log('[CHUNKER] Chip header: %d chars', chipHeader.length);

  // Split into raw chunks
  const rawChunks = splitIntoChunks(text, opts);
  console.log('[CHUNKER] Raw chunks created: %d', rawChunks.length);

  // Prepend chip header to each chunk
  const chipChunks: ChipChunk[] = rawChunks.map((chunk, index) => ({
    content: `${chipHeader}\n${chunk.text}`,
    chunkIndex: index,
    wordCount: chunk.wordCount,
    startChar: chunk.startChar,
    endChar: chunk.endChar,
  }));

  // Calculate stats
  const totalWords = chipChunks.reduce((sum, c) => sum + c.wordCount, 0);
  const averageWords = Math.round(totalWords / chipChunks.length);

  console.log('[CHUNKER] Complete. %d chunks, avg %d words each', 
    chipChunks.length, averageWords);

  return {
    chunks: chipChunks,
    totalChunks: chipChunks.length,
    averageWords,
    chipHeader,
  };
}

// ----------------------------------------------------------------------------
// CHIP HEADER BUILDER
// ----------------------------------------------------------------------------

/**
 * Builds the chip header that gets prepended to each chunk
 */
export function buildChipHeader(chips: Chips): string {
  const lines = ['[DOCUMENT CONTEXT]'];
  
  for (const [key, value] of Object.entries(chips)) {
    if (value && value.trim()) {
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

// ----------------------------------------------------------------------------
// TEXT SPLITTING
// ----------------------------------------------------------------------------

interface RawChunk {
  text: string;
  wordCount: number;
  startChar: number;
  endChar: number;
}

/**
 * Splits text into chunks respecting word boundaries and section breaks
 */
function splitIntoChunks(text: string, opts: ChunkerOptions): RawChunk[] {
  const targetWords = opts.targetChunkWords!;
  const minWords = opts.minChunkWords!;
  const overlapWords = opts.overlapWords!;
  const respectSections = opts.respectSectionBreaks!;

  // If respecting section breaks, split by them first
  let sections: string[];
  if (respectSections) {
    sections = text.split(/\n---\n/).map(s => s.trim()).filter(s => s);
  } else {
    sections = [text];
  }

  const chunks: RawChunk[] = [];
  let globalCharOffset = 0;

  for (const section of sections) {
    const sectionChunks = splitSectionIntoChunks(
      section,
      targetWords,
      minWords,
      overlapWords,
      globalCharOffset
    );
    chunks.push(...sectionChunks);
    
    // Update offset for next section (+5 for "\n---\n")
    globalCharOffset += section.length + 5;
  }

  // Handle tiny final chunk by merging with previous
  if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.wordCount < minWords) {
      const prevChunk = chunks[chunks.length - 2];
      prevChunk.text += '\n\n' + lastChunk.text;
      prevChunk.wordCount += lastChunk.wordCount;
      prevChunk.endChar = lastChunk.endChar;
      chunks.pop();
    }
  }

  return chunks;
}

/**
 * Splits a single section into chunks
 */
function splitSectionIntoChunks(
  text: string,
  targetWords: number,
  minWords: number,
  overlapWords: number,
  charOffset: number
): RawChunk[] {
  const words = text.split(/\s+/).filter(w => w);
  
  if (words.length <= targetWords) {
    // Section fits in one chunk
    return [{
      text: text.trim(),
      wordCount: words.length,
      startChar: charOffset,
      endChar: charOffset + text.length,
    }];
  }

  const chunks: RawChunk[] = [];
  let wordIndex = 0;
  let charIndex = 0;

  while (wordIndex < words.length) {
    // Calculate end word index for this chunk
    let endWordIndex = Math.min(wordIndex + targetWords, words.length);
    
    // Find the chunk text
    const chunkWords = words.slice(wordIndex, endWordIndex);
    const chunkText = findTextForWords(text, chunkWords, charIndex);
    
    chunks.push({
      text: chunkText.text,
      wordCount: chunkWords.length,
      startChar: charOffset + charIndex,
      endChar: charOffset + charIndex + chunkText.text.length,
    });

    // Move forward, accounting for overlap
    const step = targetWords - overlapWords;
    wordIndex += step;
    charIndex = chunkText.nextCharIndex;

    // Prevent infinite loop on very small steps
    if (step <= 0) {
      wordIndex += targetWords;
    }
  }

  return chunks;
}

/**
 * Finds the actual text segment for a set of words
 * This preserves original formatting rather than just joining words
 */
function findTextForWords(
  fullText: string,
  words: string[],
  startFrom: number
): { text: string; nextCharIndex: number } {
  if (words.length === 0) {
    return { text: '', nextCharIndex: startFrom };
  }

  // Find start of first word
  const firstWord = words[0];
  let start = fullText.indexOf(firstWord, startFrom);
  if (start === -1) start = startFrom;

  // Find end of last word
  const lastWord = words[words.length - 1];
  let searchFrom = start;
  let end = start;
  
  // Find each word to get to the last one's position
  for (const word of words) {
    const pos = fullText.indexOf(word, searchFrom);
    if (pos !== -1) {
      end = pos + word.length;
      searchFrom = end;
    }
  }

  // Extend to include any trailing punctuation or whitespace up to double newline
  while (end < fullText.length && 
         fullText[end] !== '\n' && 
         fullText[end] !== '\r') {
    end++;
  }

  const text = fullText.substring(start, end).trim();
  
  return { 
    text, 
    nextCharIndex: end 
  };
}

// ----------------------------------------------------------------------------
// UTILITY EXPORTS
// ----------------------------------------------------------------------------

/**
 * Estimates how many chunks a document will produce
 * Useful for progress indicators
 */
export function estimateChunkCount(
  text: string, 
  options: ChunkerOptions = {}
): number {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const words = text.split(/\s+/).filter(w => w).length;
  const effectiveChunkSize = opts.targetChunkWords! - opts.overlapWords!;
  return Math.ceil(words / effectiveChunkSize);
}

/**
 * Gets word count for text
 */
export function getWordCount(text: string): number {
  return text.split(/\s+/).filter(w => w).length;
}