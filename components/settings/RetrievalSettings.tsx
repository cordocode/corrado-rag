// ============================================================================
// RETRIEVAL SETTINGS COMPONENT
// ============================================================================
//
// Controls for:
// - Chunks per query (1-20)
// - Similarity threshold (0.0-1.0)
//
// ============================================================================

'use client';

import { useState } from 'react';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface RetrievalSettingsProps {
  chunksPerQuery: number;
  similarityThreshold: number;
  onSave: (chunks: number, threshold: number) => Promise<void>;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function RetrievalSettings({
  chunksPerQuery,
  similarityThreshold,
  onSave,
}: RetrievalSettingsProps): React.ReactElement {
  const [chunks, setChunks] = useState(chunksPerQuery);
  const [threshold, setThreshold] = useState(similarityThreshold);
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = chunks !== chunksPerQuery || threshold !== similarityThreshold;

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    try {
      await onSave(chunks, threshold);
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset(): void {
    setChunks(chunksPerQuery);
    setThreshold(similarityThreshold);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4">
        Retrieval Configuration
      </h2>

      <div className="space-y-4">
        {/* Chunks per query */}
        <div>
          <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
            Chunks per query
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={20}
              value={chunks}
              onChange={(e) => setChunks(Number(e.target.value))}
              className="w-20 px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-[var(--color-text-muted)]">
              1–20 chunks retrieved for each question
            </span>
          </div>
        </div>

        {/* Similarity threshold */}
        <div>
          <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
            Similarity threshold
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-20 px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-[var(--color-text-muted)]">
              0.0–1.0 minimum similarity to include
            </span>
          </div>
        </div>

        {/* Save / Reset buttons */}
        {hasChanges && (
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-sm bg-[var(--color-text-primary)] text-[var(--color-background)] rounded"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}