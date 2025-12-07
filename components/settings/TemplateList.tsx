// ============================================================================
// TEMPLATE LIST COMPONENT
// ============================================================================
//
// Displays list of document type templates with:
// - Add Type button
// - List of TemplateCards
// - Edit modal management
//
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import TemplateCard, { type Template } from './TemplateCard';
import TemplateEditModal from './TemplateEditModal';

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function TemplateList(): React.ReactElement {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates(): Promise<void> {
    try {
      const response = await fetch('/api/templates');
      if (!response.ok) throw new Error('Failed to load templates');
      const data = await response.json();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }

  function handleAddNew(): void {
    setEditingTemplate(null);
    setIsModalOpen(true);
  }

  function handleEdit(template: Template): void {
    setEditingTemplate(template);
    setIsModalOpen(true);
  }

  function handleCloseModal(): void {
    setIsModalOpen(false);
    setEditingTemplate(null);
  }

  async function handleSave(
    template: Omit<Template, 'id' | 'created_at'> & { id?: string }
  ): Promise<void> {
    const isUpdating = !!template.id;

    const response = await fetch('/api/templates', {
      method: isUpdating ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save template');
    }

    // Reload templates
    await loadTemplates();
  }

  async function handleDelete(id: string): Promise<void> {
    const response = await fetch('/api/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete template');
    }

    // Reload templates
    await loadTemplates();
  }

  // Loading state
  if (isLoading) {
    return (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4">
          Document Types
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">Loading templates...</p>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4">
          Document Types
        </h2>
        <p className="text-sm text-red-600">Error: {error}</p>
      </section>
    );
  }

  return (
    <>
      <section>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Document Types
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Define document types and their identifier fields for automatic extraction
            </p>
          </div>
          <button
            onClick={handleAddNew}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            + Add Type
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No document types defined. Add one to get started.
          </p>
        ) : (
          <div className="border-t border-[var(--color-border)]">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </section>

      <TemplateEditModal
        template={editingTemplate}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  );
}