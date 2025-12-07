// ============================================================================
// TEMPLATE EDIT MODAL COMPONENT
// ============================================================================
//
// Modal for creating or editing document type templates.
// Includes:
// - Type name input
// - Chip fields list with add/remove
// - Extraction prompt textarea (optional)
// - Save/Cancel/Delete actions
//
// Delete shows warning if documents use this type (handled by API)
// Field names are validated and converted to snake_case
//
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import type { Template } from './TemplateCard';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface TemplateEditModalProps {
  template: Template | null; // null = creating new
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: Omit<Template, 'id' | 'created_at'> & { id?: string }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function TemplateEditModal({
  template,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: TemplateEditModalProps): React.ReactElement | null {
  const [typeName, setTypeName] = useState('');
  const [chipFields, setChipFields] = useState<string[]>([]);
  const [newField, setNewField] = useState('');
  const [extractionPrompt, setExtractionPrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = template !== null;

  // Populate form when template changes
  useEffect(() => {
    if (template) {
      setTypeName(template.type_name);
      setChipFields(template.chip_fields);
      setExtractionPrompt(template.extraction_prompt ?? '');
    } else {
      setTypeName('');
      setChipFields([]);
      setExtractionPrompt('');
    }
    setNewField('');
    setError(null);
  }, [template, isOpen]);

  // Don't render if not open
  if (!isOpen) return null;

  function handleAddField(): void {
    // Convert to snake_case
    const field = newField
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    
    if (!field) return;
    if (chipFields.includes(field)) {
      setError('Field already exists');
      return;
    }
    setChipFields([...chipFields, field]);
    setNewField('');
    setError(null);
  }

  function handleRemoveField(index: number): void {
    setChipFields(chipFields.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddField();
    }
  }

  async function handleSave(): Promise<void> {
    const name = typeName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name) {
      setError('Type name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        id: template?.id,
        type_name: name,
        chip_fields: chipFields,
        extraction_prompt: extractionPrompt.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!template || !onDelete) return;
    if (!confirm('Are you sure you want to delete this document type? This cannot be undone.')) return;

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete(template.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Edit Document Type' : 'Add Document Type'}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] text-xl"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Error */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Type Name */}
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Type Name
            </label>
            <input
              type="text"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              placeholder="e.g., lease, invoice, contract"
              className="w-full px-3 py-2 text-sm"
            />
          </div>

          {/* Chip Fields */}
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Identifier Fields (chips)
            </label>
            
            {/* Existing fields */}
            {chipFields.length > 0 && (
              <div className="mb-2 space-y-1">
                {chipFields.map((field, index) => (
                  <div
                    key={field}
                    className="flex items-center justify-between px-3 py-1.5 text-sm bg-[var(--color-border)]/30 rounded"
                  >
                    <span className="font-mono text-xs">{field}</span>
                    <button
                      onClick={() => handleRemoveField(index)}
                      className="text-[var(--color-text-muted)] hover:text-red-600 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new field */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add new field..."
                className="flex-1 px-3 py-1.5 text-sm"
              />
              <button
                onClick={handleAddField}
                className="px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              >
                + Add
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Field names will be converted to snake_case
            </p>
          </div>

          {/* Extraction Prompt */}
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              Extraction Prompt (optional)
            </label>
            <textarea
              value={extractionPrompt}
              onChange={(e) => setExtractionPrompt(e.target.value)}
              placeholder="Custom prompt for extracting information from this document type..."
              rows={3}
              className="w-full px-3 py-2 text-sm resize-y"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)]">
          <div>
            {isEditing && onDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="text-sm text-red-600 hover:text-red-700"
              >
                {isDeleting ? 'Deleting...' : 'Delete Type'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSaving || isDeleting}
              className="px-4 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isDeleting}
              className="px-4 py-1.5 text-sm bg-[var(--color-text-primary)] text-[var(--color-background)] rounded"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}