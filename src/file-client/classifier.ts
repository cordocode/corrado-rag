// ============================================================================
// DOCUMENT CLASSIFIER + CHIP EXTRACTOR
// ============================================================================
//
// This module classifies documents and extracts chip values in a SINGLE LLM call.
// It combines what the original architecture had as classifier.ts + chips.ts
// for efficiency (one API call instead of two).
//
// Pipeline position:
//   extractor.ts → cleaner.ts → classifier.ts → chunker.ts → embedder.ts
//
// WHAT IT DOES:
// 1. Fetches all file type templates from Supabase (or uses mock data in tests)
// 2. Sends document text + all possible types to Claude Haiku
// 3. Claude picks the best matching type AND extracts chip values
// 4. Returns both for use in chunking
//
// WHY COMBINE CLASSIFICATION + EXTRACTION:
// - Original plan: classify → fetch template → extract chips (2 LLM calls)
// - This approach: fetch all templates → classify + extract (1 LLM call)
// - Saves ~$0.001 per document and reduces latency
//
// TEMPLATES:
// Templates define what types of documents exist and what metadata (chips)
// to extract from each type. They're stored in the file_type_templates table.
//
// Example templates:
// - lease: property_address, tenant_name, landlord, lease_start, lease_end, etc.
// - misc: document_title, date, parties_involved, summary
//
// USAGE:
// import { classifyDocument } from './classifier';
// const result = await classifyDocument(cleanedText, templates);
// // result = { file_type: "lease", confidence: 0.95, chips: { property_address: "123 Main St", ... } }
//
// TEST USAGE:
// import { classifyFromFile } from './classifier';
// const result = await classifyFromFile('./cleaned-output.txt');
//
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { FileTypeTemplate, Chips } from '../types';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

// Using Haiku for speed and cost efficiency
const CLAUDE_MODEL = 'claude-3-5-haiku-20241022';

// Max characters of document text to send to Claude
// Full leases can be 50k+ chars, but we only need the key sections for classification
// The first ~15k chars usually contain all the identifying info (parties, dates, etc.)
const MAX_TEXT_FOR_CLASSIFICATION = 15000;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface ClassificationResult {
  file_type: string;                    // The determined file type (e.g., "lease", "misc")
  confidence: number;                   // 0-1 confidence score
  chips: Chips;                         // Extracted metadata key-value pairs
  reasoning?: string;                   // Optional: why this type was chosen
}

// ----------------------------------------------------------------------------
// CLAUDE CLIENT
// ----------------------------------------------------------------------------

const anthropic = new Anthropic();

// ----------------------------------------------------------------------------
// MOCK TEMPLATES (FOR TESTING)
// ----------------------------------------------------------------------------
// In production, these come from the file_type_templates table in Supabase
// These match what's in the database schema from the architecture doc

export const MOCK_TEMPLATES: FileTypeTemplate[] = [
  {
    id: 'template-lease',
    type_name: 'lease',
    chip_fields: [
      'property_address',
      'unit_number', 
      'tenant_name',
      'landlord',
      'lease_start',
      'lease_end',
      'monthly_rent',
      'security_deposit'
    ],
    extraction_prompt: 'Extract lease agreement details including property, parties, dates, and financial terms.',
    created_at: new Date().toISOString()
  },
  {
    id: 'template-misc',
    type_name: 'misc',
    chip_fields: [
      'document_title',
      'date',
      'parties_involved',
      'summary'
    ],
    extraction_prompt: 'Extract general document information.',
    created_at: new Date().toISOString()
  }
];

// ----------------------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------------------

/**
 * Classifies a document and extracts chip values in one LLM call
 * 
 * @param text - Cleaned document text
 * @param templates - Available file type templates (from Supabase or mock)
 * @returns Classification result with file_type, confidence, and chips
 */
export async function classifyDocument(
  text: string,
  templates: FileTypeTemplate[]
): Promise<ClassificationResult> {
  console.log('[CLASSIFIER] Starting classification...');
  console.log('[CLASSIFIER] Document length: %d chars', text.length);
  console.log('[CLASSIFIER] Available types: %s', templates.map(t => t.type_name).join(', '));

  // Truncate text if too long (classification doesn't need full document)
  const textForClassification = text.length > MAX_TEXT_FOR_CLASSIFICATION
    ? text.substring(0, MAX_TEXT_FOR_CLASSIFICATION) + '\n\n[... document continues ...]'
    : text;

  console.log('[CLASSIFIER] Text for classification: %d chars', textForClassification.length);

  // Build the prompt
  const prompt = buildClassificationPrompt(textForClassification, templates);

  try {
    const startTime = Date.now();

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('[CLASSIFIER] LLM response received in %ss', duration);

    // Parse the response
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text in response');
    }

    const result = parseClassificationResponse(textContent.text, templates);
    
    console.log('[CLASSIFIER] Result: type=%s, confidence=%s', 
      result.file_type, result.confidence.toFixed(2));
    console.log('[CLASSIFIER] Chips extracted: %d fields', Object.keys(result.chips).length);

    return result;

  } catch (error) {
    console.error('[CLASSIFIER] Error:', error);
    
    // Return misc type as fallback
    return {
      file_type: 'misc',
      confidence: 0,
      chips: {
        document_title: 'Unknown Document',
        date: '',
        parties_involved: '',
        summary: 'Classification failed - document stored as miscellaneous.'
      },
      reasoning: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Convenience function for testing - reads file and uses mock templates
 */
export async function classifyFromFile(filePath: string): Promise<ClassificationResult> {
  const fs = await import('fs');
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const text = fs.readFileSync(filePath, 'utf-8');
  return classifyDocument(text, MOCK_TEMPLATES);
}

// ----------------------------------------------------------------------------
// PROMPT BUILDING
// ----------------------------------------------------------------------------

/**
 * Builds the classification + extraction prompt
 */
function buildClassificationPrompt(text: string, templates: FileTypeTemplate[]): string {
  // Build the types section
  const typesDescription = templates.map(t => {
    const fields = t.chip_fields.join(', ');
    return `TYPE: "${t.type_name}"
  Fields to extract: ${fields}
  ${t.extraction_prompt ? `Hint: ${t.extraction_prompt}` : ''}`;
  }).join('\n\n');

  return `You are a document classifier and metadata extractor. Analyze the document below and:

1. Determine which document type it matches best
2. Extract the metadata fields for that type

AVAILABLE DOCUMENT TYPES:

${typesDescription}

INSTRUCTIONS:

1. Read the document carefully
2. Choose the BEST matching type (if none fit well, use "misc")
3. Extract values for ALL fields of that type
4. If a field's value cannot be found, use empty string ""
5. For dates, use the format found in the document (don't normalize)
6. For addresses, include full address as written

Respond in this EXACT JSON format (no markdown, no code blocks, just raw JSON):

{
  "file_type": "the_chosen_type",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this type was chosen",
  "chips": {
    "field_name_1": "extracted value",
    "field_name_2": "extracted value"
  }
}

DOCUMENT TO ANALYZE:

${text}

Respond with JSON only:`;
}

// ----------------------------------------------------------------------------
// RESPONSE PARSING
// ----------------------------------------------------------------------------

/**
 * Parses the LLM response into a ClassificationResult
 */
function parseClassificationResponse(
  responseText: string,
  templates: FileTypeTemplate[]
): ClassificationResult {
  // Try to extract JSON from the response
  let jsonStr = responseText.trim();
  
  // Remove markdown code blocks if present
  jsonStr = jsonStr.replace(/^```json?\s*\n?/i, '');
  jsonStr = jsonStr.replace(/\n?```\s*$/i, '');
  jsonStr = jsonStr.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate file_type exists in templates
    const validTypes = templates.map(t => t.type_name);
    const fileType = validTypes.includes(parsed.file_type) 
      ? parsed.file_type 
      : 'misc';

    // Get the template for this type to validate chips
    const template = templates.find(t => t.type_name === fileType);
    const chips: Chips = {};

    if (template && parsed.chips) {
      // Only include fields that are in the template
      for (const field of template.chip_fields) {
        chips[field] = parsed.chips[field] || '';
      }
    }

    return {
      file_type: fileType,
      confidence: typeof parsed.confidence === 'number' 
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5,
      chips,
      reasoning: parsed.reasoning || undefined
    };

  } catch (parseError) {
    console.error('[CLASSIFIER] Failed to parse JSON response:', parseError);
    console.error('[CLASSIFIER] Raw response:', responseText.substring(0, 500));

    // Attempt basic extraction as fallback
    return extractFallback(responseText, templates);
  }
}

/**
 * Fallback extraction when JSON parsing fails
 */
function extractFallback(
  responseText: string, 
  templates: FileTypeTemplate[]
): ClassificationResult {
  // Try to at least detect the file type from the response
  const lowerResponse = responseText.toLowerCase();
  
  for (const template of templates) {
    if (lowerResponse.includes(`"${template.type_name}"`) || 
        lowerResponse.includes(`type": "${template.type_name}`)) {
      return {
        file_type: template.type_name,
        confidence: 0.3,
        chips: Object.fromEntries(template.chip_fields.map(f => [f, ''])),
        reasoning: 'Partial extraction - JSON parsing failed'
      };
    }
  }

  // Default to misc
  const miscTemplate = templates.find(t => t.type_name === 'misc');
  return {
    file_type: 'misc',
    confidence: 0.1,
    chips: miscTemplate 
      ? Object.fromEntries(miscTemplate.chip_fields.map(f => [f, '']))
      : {},
    reasoning: 'Fallback - could not parse response'
  };
}

// ----------------------------------------------------------------------------
// SUPABASE INTEGRATION (FOR PRODUCTION)
// ----------------------------------------------------------------------------

/**
 * Fetches templates from Supabase
 * TODO: Implement when wiring up full pipeline
 * 
 * @param supabase - Supabase client instance
 * @returns Array of file type templates
 */
export async function fetchTemplatesFromSupabase(
  supabase: any // SupabaseClient type
): Promise<FileTypeTemplate[]> {
  console.log('[CLASSIFIER] Fetching templates from Supabase...');
  
  const { data, error } = await supabase
    .from('file_type_templates')
    .select('*');

  if (error) {
    console.error('[CLASSIFIER] Supabase error:', error);
    throw new Error(`Failed to fetch templates: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.warn('[CLASSIFIER] No templates found in database, using defaults');
    return MOCK_TEMPLATES;
  }

  console.log('[CLASSIFIER] Loaded %d templates from Supabase', data.length);
  
  // Transform the data to match our interface
  // Note: chip_fields is stored as JSONB in Supabase, so it should already be an array
  return data.map((row: any) => ({
    id: row.id,
    type_name: row.type_name,
    chip_fields: Array.isArray(row.chip_fields) ? row.chip_fields : JSON.parse(row.chip_fields),
    extraction_prompt: row.extraction_prompt || undefined,
    created_at: row.created_at
  }));
}

// ----------------------------------------------------------------------------
// RE-EXPORTS
// ----------------------------------------------------------------------------

// Re-export types for convenience
export type { FileTypeTemplate, Chips } from '../types';