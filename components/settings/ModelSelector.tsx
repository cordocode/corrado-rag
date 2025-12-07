// ============================================================================
// MODEL SELECTOR COMPONENT
// ============================================================================
//
// Displays current model selection.
// LOCKED for v1 with "Coming Soon" message.
// Prep the UI now so it's easy to enable later.
//
// ============================================================================

'use client';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Fast and capable' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most intelligent' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Quick responses' },
];

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface ModelSelectorProps {
  currentModel: string;
  onSave: (model: string) => Promise<void>;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function ModelSelector({
  currentModel,
}: ModelSelectorProps): React.ReactElement {
  const selectedModel = AVAILABLE_MODELS.find((m) => m.id === currentModel);

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4">
        Model Selection
        <span className="ml-2 text-xs font-normal">(Coming Soon)</span>
      </h2>

      <div className="space-y-4 opacity-60">
        {/* Chat Model */}
        <div>
          <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
            Chat Model
          </label>
          <div className="flex items-center gap-2">
            <div className="w-full max-w-xs px-3 py-2 text-sm bg-[var(--color-border)]/30 border border-[var(--color-border)] rounded cursor-not-allowed">
              {selectedModel?.name ?? currentModel}
              <span className="ml-2 text-[var(--color-text-muted)]">🔒</span>
            </div>
          </div>
          {selectedModel && (
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {selectedModel.description}
            </p>
          )}
        </div>

        {/* Embedding Model */}
        <div>
          <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
            Embedding Model
          </label>
          <div className="flex items-center gap-2">
            <div className="w-full max-w-xs px-3 py-2 text-sm bg-[var(--color-border)]/30 border border-[var(--color-border)] rounded cursor-not-allowed">
              text-embedding-3-small
              <span className="ml-2 text-[var(--color-text-muted)]">🔒</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            OpenAI embedding model
          </p>
        </div>

        <p className="text-xs text-[var(--color-text-muted)] pt-2">
          Model selection will be available in a future update.
        </p>
      </div>
    </section>
  );
}