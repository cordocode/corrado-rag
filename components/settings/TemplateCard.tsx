// ============================================================================
// TEMPLATE CARD COMPONENT
// ============================================================================
//
// Displays a single document type template with:
// - Type name (uppercase)
// - Chip fields as comma-separated list
// - Edit button
//
// ============================================================================

'use client';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface Template {
  id: string;
  type_name: string;
  chip_fields: string[];
  extraction_prompt: string | null;
  created_at: string;
}

interface TemplateCardProps {
  template: Template;
  onEdit: (template: Template) => void;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function TemplateCard({
  template,
  onEdit,
}: TemplateCardProps): React.ReactElement {
  return (
    <div className="py-3 border-b border-[var(--color-border)] last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-[var(--color-text-primary)] uppercase tracking-wide">
            {template.type_name}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)] truncate">
            {template.chip_fields.length > 0
              ? `Identifiers: ${template.chip_fields.join(', ')}`
              : 'No identifiers defined'}
          </p>
        </div>
        <button
          onClick={() => onEdit(template)}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          Edit
        </button>
      </div>
    </div>
  );
}