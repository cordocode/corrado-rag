// ============================================================================
// SYSTEM PROMPT EDITOR COMPONENT
// ============================================================================
//
// Textarea for editing the system prompt used in chat.
// Shows character count and has save/cancel/reset controls.
// Reset to Default restores the hardcoded prompt from prompt.ts
//
// ============================================================================

'use client';

import { useState } from 'react';

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

// Default system prompt (should match src/chat-client/prompt.ts)
const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions about documents.

You have access to relevant document excerpts provided below. Use these to answer the user's questions accurately.

INSTRUCTIONS:
- Answer based on the provided document context
- If the answer is in the documents, cite which document it came from
- If you cannot find the answer in the provided context, say so clearly
- Be concise but thorough`;

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface SystemPromptEditorProps {
  systemPrompt: string | null;
  onSave: (prompt: string | null) => Promise<void>;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function SystemPromptEditor({
  systemPrompt,
  onSave,
}: SystemPromptEditorProps): React.ReactElement {
  const [prompt, setPrompt] = useState(systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
  const [isSaving, setIsSaving] = useState(false);

  const originalPrompt = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const hasChanges = prompt !== originalPrompt;
  const isDefault = prompt === DEFAULT_SYSTEM_PROMPT;

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    try {
      // Save null if it matches default (use default), otherwise save the prompt
      const valueToSave = prompt === DEFAULT_SYSTEM_PROMPT ? null : prompt.trim();
      await onSave(valueToSave);
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset(): void {
    setPrompt(originalPrompt);
  }

  function handleResetToDefault(): void {
    setPrompt(DEFAULT_SYSTEM_PROMPT);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-4">
        System Prompt
      </h2>

      <div className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a system prompt to guide the assistant's responses..."
          rows={8}
          className="w-full px-3 py-2 text-sm resize-y min-h-[160px]"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--color-text-muted)]">
              {prompt.length} characters
            </span>
            {!isDefault && (
              <button
                onClick={handleResetToDefault}
                disabled={isSaving}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              >
                Reset to Default
              </button>
            )}
          </div>

          {hasChanges && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="px-3 py-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-1 text-sm bg-[var(--color-text-primary)] text-[var(--color-background)] rounded"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}