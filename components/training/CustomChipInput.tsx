// ============================================================================
// CUSTOM CHIP INPUT COMPONENT
// ============================================================================
//
// Allows adding custom key-value chips to a document.
// - Shows existing custom chips with remove buttons
// - Input fields for adding new chips
//
// ============================================================================

'use client';

import { useState } from 'react';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface CustomChipInputProps {
  chips: Record<string, string>;
  onChange: (chips: Record<string, string>) => void;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function CustomChipInput({
  chips,
  onChange,
}: CustomChipInputProps): React.ReactElement {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  function handleAdd(): void {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, '_');
    const value = newValue.trim();

    if (!key || !value) return;

    onChange({ ...chips, [key]: value });
    setNewKey('');
    setNewValue('');
  }

  function handleRemove(key: string): void {
    const updated = { ...chips };
    delete updated[key];
    onChange(updated);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  const entries = Object.entries(chips);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
          Custom Identifiers:
        </p>
        <button
          onClick={handleAdd}
          disabled={!newKey.trim() || !newValue.trim()}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] disabled:opacity-50"
        >
          + Add
        </button>
      </div>

      {/* Existing custom chips */}
      {entries.length > 0 && (
        <div className="space-y-1 mb-3">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 text-sm bg-[var(--color-border)]/30 rounded px-3 py-1.5"
            >
              <div className="flex items-start gap-2">
                <span className="font-mono text-xs text-[var(--color-text-muted)]">
                  {key}:
                </span>
                <span className="text-[var(--color-text-primary)]">
                  {value}
                </span>
              </div>
              <button
                onClick={() => handleRemove(key)}
                className="text-[var(--color-text-muted)] hover:text-red-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new chip inputs */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="field_name"
          className="flex-1 px-2 py-1 text-sm font-mono"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="value"
          className="flex-1 px-2 py-1 text-sm"
        />
      </div>
    </div>
  );
}