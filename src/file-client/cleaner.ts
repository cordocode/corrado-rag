// ============================================================================
// TEXT CLEANER (PRE-CHUNK PREPARATION)
// ============================================================================
//
// This module cleans and normalizes extracted text before chunking.
// It sits between extraction and chunking in the ingestion pipeline:
//
//   extractor.ts → cleaner.ts → classifier.ts → chips.ts → chunker.ts
//
// WHAT IT DOES:
// 1. Removes extraction artifacts (page markers, instruction echo, footers)
// 2. Normalizes whitespace while preserving paragraph structure
// 3. Preserves special markers ([TABLE], [HANDWRITTEN]) for downstream use
// 4. Optionally marks section boundaries for smarter chunking
//
// WHY THIS MATTERS:
// - Cleaner text = better embeddings = better retrieval
// - Removing noise prevents chunks from containing irrelevant content
// - Preserving structure helps the chunker make intelligent splits
//
// USAGE:
// import { cleanText } from './cleaner';
// const cleaned = cleanText(rawExtractedText);
//
// ============================================================================

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------

export interface CleanerOptions {
  // Replace page markers with section breaks (useful for chunking hints)
  preservePageBreaksAsSectionMarkers?: boolean;
  
  // Remove [TABLE] and [HANDWRITTEN] markers (default: keep them)
  stripSpecialMarkers?: boolean;
  
  // Aggressive whitespace normalization (may affect table formatting)
  aggressiveWhitespace?: boolean;
}

const DEFAULT_OPTIONS: CleanerOptions = {
  preservePageBreaksAsSectionMarkers: true,
  stripSpecialMarkers: false,
  aggressiveWhitespace: false,
};

// ----------------------------------------------------------------------------
// PATTERNS TO REMOVE
// ----------------------------------------------------------------------------

// Page markers from extractor: "--- PAGE 1 ---", "--- PAGE 12 ---", etc.
const PAGE_MARKER_PATTERN = /^---\s*PAGE\s+\d+\s*---\s*$/gm;

// Instruction echo - when Claude repeats the extraction prompt
// This catches the common patterns we've seen in output
const INSTRUCTION_ECHO_PATTERNS = [
  // Full instruction block
  /INSTRUCTIONS:\s*\n(?:.*\n)*?.*\[END TABLE\]\s*\n?/gi,
  // Partial instruction fragments
  /^\d+\.\s*TABLES:\s*Format tables clearly:.*$/gm,
  /^\s*\|\s*Column\s*\d+\s*\|.*\|.*$/gm, // Example table from instructions
  /^\s*\|\s*-+\s*\|.*$/gm, // Table separator from instructions (when not in real table)
  /^\s*\|\s*value\s*\|.*value.*\|.*$/gm, // Example values from instructions
  
  // Mid-document instruction echo (numbered items with instruction content)
  // Pattern: "2. HANDWRITING: Mark handwritten text:\n  [HANDWRITTEN: content here]"
  /\d+\.\s*HANDWRITING:\s*Mark handwritten text:\s*\n\s*\[HANDWRITTEN:\s*content here\]\s*\n?/gi,
  // Pattern: "3. Keep section numbers (1.01, 1.02) and formatting intact."
  /\d+\.\s*Keep section numbers.*formatting intact\.?\s*\n?/gi,
  // Pattern: "4. Return ONLY the extracted text, no commentary."
  /\d+\.\s*Return ONLY the extracted text.*\n?/gi,
  // Pattern: "Output the extracted text only"
  /\d+\.\s*Output the extracted text.*\n?/gi,
  // Generic: Preserve paragraph breaks and logical structure
  /\d+\.\s*Preserve paragraph breaks.*\n?/gi,
];

// Footer patterns - document management systems, page numbers, etc.
// These appear at the bottom of pages and add noise
const FOOTER_PATTERNS = [
  // Standalone page numbers (just a number on its own line)
  /^\s*\d{1,3}\s*$/gm,
  // Document management footers like "lease.mgr.epminerals"
  /^[a-z]+\.[a-z]+\.[a-z]+\s*$/gmi,
  // Common footer patterns
  /^Page\s+\d+\s+of\s+\d+\s*$/gmi,
  /^-\s*\d+\s*-\s*$/gm, // Centered page numbers like "- 5 -"
];

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Cleans extracted text for chunking
 * 
 * @param text - Raw text from extractor
 * @param options - Cleaning options
 * @returns Cleaned text ready for chunking
 */
export function cleanText(text: string, options: CleanerOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  let cleaned = text;
  
  // Step 1: Remove instruction echo (do this first, before other cleaning)
  cleaned = removeInstructionEcho(cleaned);
  
  // Step 2: Handle page markers
  if (opts.preservePageBreaksAsSectionMarkers) {
    // Replace page markers with subtle section breaks
    // The chunker can use these as natural split points
    cleaned = cleaned.replace(PAGE_MARKER_PATTERN, '\n---\n');
  } else {
    // Remove page markers entirely
    cleaned = cleaned.replace(PAGE_MARKER_PATTERN, '\n');
  }
  
  // Step 3: Remove footer noise
  for (const pattern of FOOTER_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Step 4: Handle special markers
  if (opts.stripSpecialMarkers) {
    cleaned = cleaned.replace(/\[TABLE\]\s*/g, '');
    cleaned = cleaned.replace(/\[END TABLE\]\s*/g, '');
    cleaned = cleaned.replace(/\[HANDWRITTEN:[^\]]*\]\s*/g, '');
  }
  
  // Step 5: Normalize whitespace
  cleaned = normalizeWhitespace(cleaned, opts.aggressiveWhitespace);
  
  // Step 6: Final trim
  cleaned = cleaned.trim();
  
  return cleaned;
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Removes instruction echo from Claude's extraction output
 * This happens when Claude accidentally includes parts of the extraction prompt
 */
function removeInstructionEcho(text: string): string {
  let cleaned = text;
  
  for (const pattern of INSTRUCTION_ECHO_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Also remove any block that looks like it's repeating the extraction prompt
  // Look for "INSTRUCTIONS:" followed by numbered items about tables/handwriting
  const instructionBlockPattern = /INSTRUCTIONS:[\s\S]*?(?=\n\n[A-Z]|\n\n\d+\.(?!\s*TABLES)|\n---\n|$)/gi;
  cleaned = cleaned.replace(instructionBlockPattern, '');
  
  return cleaned;
}

/**
 * Normalizes whitespace while preserving intentional formatting
 */
function normalizeWhitespace(text: string, aggressive: boolean = false): string {
  let normalized = text;
  
  // Always: Normalize line endings to \n
  normalized = normalized.replace(/\r\n/g, '\n');
  normalized = normalized.replace(/\r/g, '\n');
  
  // Always: Remove trailing whitespace from lines
  normalized = normalized.replace(/[ \t]+$/gm, '');
  
  // Always: Collapse 3+ newlines to 2 (preserve paragraph breaks)
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  
  if (aggressive) {
    // Aggressive: Collapse multiple spaces to single space
    // Warning: This can break table alignment
    normalized = normalized.replace(/[ \t]{2,}/g, ' ');
    
    // Aggressive: Remove leading whitespace from lines (except in tables)
    // We need to be careful not to break table formatting
    const lines = normalized.split('\n');
    const processedLines = lines.map(line => {
      // Don't touch lines that look like table rows
      if (line.trim().startsWith('|') || line.includes('|---|')) {
        return line;
      }
      return line.trimStart();
    });
    normalized = processedLines.join('\n');
  } else {
    // Non-aggressive: Just collapse runs of spaces (not tabs) to max 2
    // This preserves some formatting while reducing excessive whitespace
    normalized = normalized.replace(/ {3,}/g, '  ');
  }
  
  return normalized;
}

// ----------------------------------------------------------------------------
// UTILITY EXPORTS
// ----------------------------------------------------------------------------

/**
 * Extracts section breaks from cleaned text
 * Useful for chunking strategies that want to respect document structure
 */
export function getSectionBreaks(text: string): number[] {
  const breaks: number[] = [];
  const lines = text.split('\n');
  
  let charIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      breaks.push(charIndex);
    }
    charIndex += lines[i].length + 1; // +1 for newline
  }
  
  return breaks;
}

/**
 * Checks if text contains special markers that should be preserved
 */
export function hasSpecialMarkers(text: string): { tables: number; handwritten: number } {
  const tables = (text.match(/\[TABLE\]/g) || []).length;
  const handwritten = (text.match(/\[HANDWRITTEN:/g) || []).length;
  return { tables, handwritten };
}

/**
 * Quick stats about the cleaning process
 */
export function getCleaningStats(original: string, cleaned: string): {
  originalLength: number;
  cleanedLength: number;
  reduction: string;
  pagesRemoved: number;
} {
  const pagesRemoved = (original.match(PAGE_MARKER_PATTERN) || []).length;
  const reduction = ((1 - cleaned.length / original.length) * 100).toFixed(1);
  
  return {
    originalLength: original.length,
    cleanedLength: cleaned.length,
    reduction: `${reduction}%`,
    pagesRemoved,
  };
}