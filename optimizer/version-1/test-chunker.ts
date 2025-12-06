// ============================================================================
// CONFIGURABLE CHUNKER FOR TESTING
// ============================================================================
//
// Supports:
// - Variable chunk size and overlap
// - Variable chip field count
// - Prepend only OR prepend + append chip positioning
//
// ============================================================================

import { Chips } from '../../src/types';

export interface ChunkerConfig {
  targetChunkWords: number;
  overlapWords: number;
  chipFields: string[];
  chipPosition: 'prepend' | 'prepend_append';
}

export interface TestChunk {
  content: string;
  chunkIndex: number;
  wordCount: number;
}

export interface ChunkResult {
  chunks: TestChunk[];
  totalChunks: number;
  avgWords: number;
  chipHeader: string;
}

/**
 * Chunks document with test configuration
 */
export function chunkForTest(
  text: string,
  chips: Chips,
  config: ChunkerConfig
): ChunkResult {
  const chipHeader = buildHeader(chips, config.chipFields);
  const rawChunks = splitText(text, config.targetChunkWords, config.overlapWords);

  const chunks: TestChunk[] = rawChunks.map((raw, i) => {
    let content: string;
    if (config.chipPosition === 'prepend_append') {
      content = `${chipHeader}\n${raw.text}\n${chipHeader}`;
    } else {
      content = `${chipHeader}\n${raw.text}`;
    }

    return {
      content,
      chunkIndex: i,
      wordCount: raw.wordCount,
    };
  });

  const totalWords = chunks.reduce((sum, c) => sum + c.wordCount, 0);
  const avgWords = chunks.length > 0 ? Math.round(totalWords / chunks.length) : 0;

  return { chunks, totalChunks: chunks.length, avgWords, chipHeader };
}

function buildHeader(chips: Chips, fields: string[]): string {
  const lines = ['[DOCUMENT CONTEXT]'];
  for (const field of fields) {
    const val = chips[field];
    if (val?.trim()) {
      const label = field.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      lines.push(`${label}: ${val}`);
    }
  }
  lines.push('[CONTENT]');
  return lines.join('\n');
}

interface RawChunk {
  text: string;
  wordCount: number;
}

function splitText(text: string, targetWords: number, overlap: number): RawChunk[] {
  const words = text.split(/\s+/).filter(w => w);
  if (words.length <= targetWords) {
    return [{ text: text.trim(), wordCount: words.length }];
  }

  const chunks: RawChunk[] = [];
  let i = 0;
  const step = Math.max(1, targetWords - overlap);

  while (i < words.length) {
    const end = Math.min(i + targetWords, words.length);
    const chunkWords = words.slice(i, end);
    chunks.push({
      text: chunkWords.join(' '),
      wordCount: chunkWords.length,
    });
    i += step;
  }

  // Merge tiny final chunk
  if (chunks.length > 1 && chunks[chunks.length - 1].wordCount < 50) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1].text += ' ' + last.text;
    chunks[chunks.length - 1].wordCount += last.wordCount;
  }

  return chunks;
}