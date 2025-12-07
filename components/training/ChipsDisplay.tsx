// ============================================================================
// CHIPS DISPLAY COMPONENT
// ============================================================================
//
// Read-only display of extracted or custom chips (key-value pairs).
//
// ============================================================================

'use client';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface ChipsDisplayProps {
  chips: Record<string, string>;
  label?: string;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function ChipsDisplay({
  chips,
  label = 'Identified',
}: ChipsDisplayProps): React.ReactElement | null {
  const entries = Object.entries(chips).filter(([, value]) => value);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
        {label}:
      </p>
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="flex items-start gap-2 text-sm bg-[var(--color-border)]/30 rounded px-3 py-1.5"
          >
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {key}:
            </span>
            <span className="text-[var(--color-text-primary)]">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}