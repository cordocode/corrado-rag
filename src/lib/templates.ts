// ============================================================================
// FILE TYPE TEMPLATES (DATABASE OPERATIONS)
// ============================================================================
//
// CRUD operations for the file_type_templates table.
// Templates define document types and what metadata (chips) to extract.
//
// USAGE:
// import { getTemplates, createTemplate, updateTemplate } from '@/src/lib/templates';
// const templates = await getTemplates();
// await createTemplate({ type_name: 'invoice', chip_fields: ['vendor', 'amount'] });
//
// ============================================================================

import { supabase } from '../supabase';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface FileTypeTemplate {
  id: string;
  type_name: string;
  chip_fields: string[];
  extraction_prompt: string | null;
  created_at: string;
}

export interface CreateTemplateInput {
  type_name: string;
  chip_fields: string[];
  extraction_prompt?: string | null;
}

export interface UpdateTemplateInput {
  type_name?: string;
  chip_fields?: string[];
  extraction_prompt?: string | null;
}

// ----------------------------------------------------------------------------
// READ OPERATIONS
// ----------------------------------------------------------------------------

/**
 * Gets all file type templates
 * 
 * @returns Array of all templates, ordered by type_name
 */
export async function getTemplates(): Promise<FileTypeTemplate[]> {
  console.log('[TEMPLATES] Fetching all templates...');

  const { data, error } = await supabase
    .from('file_type_templates')
    .select('*')
    .order('type_name', { ascending: true });

  if (error) {
    console.error('[TEMPLATES] Error fetching templates:', error);
    throw new Error(`Failed to fetch templates: ${error.message}`);
  }

  console.log('[TEMPLATES] Found %d templates', data?.length || 0);
  return data || [];
}

/**
 * Gets a single template by ID
 * 
 * @param id - UUID of the template
 * @returns Template or null if not found
 */
export async function getTemplateById(id: string): Promise<FileTypeTemplate | null> {
  console.log('[TEMPLATES] Fetching template: %s', id);

  const { data, error } = await supabase
    .from('file_type_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[TEMPLATES] Error fetching template:', error);
    throw new Error(`Failed to fetch template: ${error.message}`);
  }

  return data || null;
}

/**
 * Gets a single template by type name
 * 
 * @param typeName - The type_name (e.g., 'lease', 'misc')
 * @returns Template or null if not found
 */
export async function getTemplateByName(typeName: string): Promise<FileTypeTemplate | null> {
  console.log('[TEMPLATES] Fetching template by name: %s', typeName);

  const { data, error } = await supabase
    .from('file_type_templates')
    .select('*')
    .eq('type_name', typeName)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[TEMPLATES] Error fetching template:', error);
    throw new Error(`Failed to fetch template: ${error.message}`);
  }

  return data || null;
}

// ----------------------------------------------------------------------------
// WRITE OPERATIONS
// ----------------------------------------------------------------------------

/**
 * Creates a new file type template
 * 
 * @param input - Template data
 * @returns Created template
 */
export async function createTemplate(input: CreateTemplateInput): Promise<FileTypeTemplate> {
  console.log('[TEMPLATES] Creating template: %s', input.type_name);

  // Validate type_name is lowercase and snake_case
  const normalizedTypeName = input.type_name.toLowerCase().replace(/\s+/g, '_');

  const { data, error } = await supabase
    .from('file_type_templates')
    .insert({
      type_name: normalizedTypeName,
      chip_fields: input.chip_fields,
      extraction_prompt: input.extraction_prompt || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[TEMPLATES] Error creating template:', error);
    
    // Handle duplicate type_name
    if (error.code === '23505') {
      throw new Error(`Template "${normalizedTypeName}" already exists`);
    }
    
    throw new Error(`Failed to create template: ${error.message}`);
  }

  console.log('[TEMPLATES] Created template: %s', data.id);
  return data;
}

/**
 * Updates an existing template
 * 
 * @param id - UUID of the template
 * @param updates - Partial template data to update
 * @returns Updated template
 */
export async function updateTemplate(
  id: string,
  updates: UpdateTemplateInput
): Promise<FileTypeTemplate> {
  console.log('[TEMPLATES] Updating template: %s', id);

  // Normalize type_name if provided
  const normalizedUpdates = { ...updates };
  if (updates.type_name) {
    normalizedUpdates.type_name = updates.type_name.toLowerCase().replace(/\s+/g, '_');
  }

  const { data, error } = await supabase
    .from('file_type_templates')
    .update(normalizedUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[TEMPLATES] Error updating template:', error);
    
    // Handle duplicate type_name
    if (error.code === '23505') {
      throw new Error(`Template "${normalizedUpdates.type_name}" already exists`);
    }
    
    throw new Error(`Failed to update template: ${error.message}`);
  }

  console.log('[TEMPLATES] Updated template: %s', data.type_name);
  return data;
}

/**
 * Deletes a template
 * 
 * @param id - UUID of the template
 * @returns Object indicating success and any warnings
 */
export async function deleteTemplate(id: string): Promise<{
  success: boolean;
  documentsAffected: number;
}> {
  console.log('[TEMPLATES] Deleting template: %s', id);

  // First, check if any documents use this template
  const template = await getTemplateById(id);
  if (!template) {
    throw new Error('Template not found');
  }

  const { count } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('file_type', template.type_name);

  const documentsAffected = count || 0;

  if (documentsAffected > 0) {
    console.log('[TEMPLATES] Warning: %d documents use this template', documentsAffected);
  }

  // Delete the template (documents will have orphaned file_type references)
  const { error } = await supabase
    .from('file_type_templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[TEMPLATES] Error deleting template:', error);
    throw new Error(`Failed to delete template: ${error.message}`);
  }

  console.log('[TEMPLATES] Deleted template');
  return { success: true, documentsAffected };
}

// ----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Validates chip field names (should be snake_case)
 * 
 * @param fields - Array of field names
 * @returns Normalized field names
 */
export function normalizeChipFields(fields: string[]): string[] {
  return fields.map(field => 
    field.toLowerCase().trim().replace(/\s+/g, '_')
  ).filter(field => field.length > 0);
}

/**
 * Checks if a type name is available
 * 
 * @param typeName - Proposed type name
 * @returns true if available, false if already exists
 */
export async function isTypeNameAvailable(typeName: string): Promise<boolean> {
  const normalized = typeName.toLowerCase().replace(/\s+/g, '_');
  const existing = await getTemplateByName(normalized);
  return existing === null;
}