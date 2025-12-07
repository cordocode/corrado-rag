// ============================================================================
// SOURCES DROPDOWN COMPONENT
// ============================================================================
//
// Expandable section showing source chunks used to answer a question.
// Collapsed by default, click to expand and see all sources.
//
// ============================================================================

'use client';

import { useState } from 'react';
import SourceCard from './SourceCard';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

export interface Source {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

interface SourcesDropdownProps {
  sources: Source[];
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function SourcesDropdown({
  sources,
}: SourcesDropdownProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);

  if (sources.length === 0) {
    return null;
  }

  return (
    <div>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
      >
        <span
          className="transition-transform duration-150"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        <span>
          {sources.length} source{sources.length !== 1 ? 's' : ''} used
        </span>
      </button>

      {/* Sources List */}
      {isOpen && (
        <div className="mt-3 pl-4 border-l-2 border-[var(--color-border-light)]">
          {sources.map((source) => (
            <SourceCard
              key={source.id}
              documentName={source.documentName}
              chunkIndex={source.chunkIndex}
              similarity={source.similarity}
              content={source.content}
            />
          ))}
        </div>
      )}
    </div>
  );
}