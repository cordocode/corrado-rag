// ============================================================================
// SOURCE CARD COMPONENT
// ============================================================================
//
// Displays a single retrieved chunk used to answer a question.
// Shows document name, chunk index, similarity score, and content.
//
// ============================================================================

'use client';

import { useState } from 'react';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface SourceCardProps {
  documentName: string;
  chunkIndex: number;
  similarity: number;
  content: string;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function SourceCard({
  documentName,
  chunkIndex,
  similarity,
  content,
}: SourceCardProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  // Show preview (first 150 chars) or full content
  const preview = content.length > 150 ? content.slice(0, 150) + '...' : content;
  const displayContent = isExpanded ? content : preview;
  const canExpand = content.length > 150;

  return (
    <div className="py-3 border-b border-[var(--color-border-light)] last:border-b-0">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {documentName}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Chunk {chunkIndex} · {(similarity * 100).toFixed(1)}%
        </span>
      </div>

      {/* Content */}
      <div className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
        {displayContent}
      </div>

      {/* Expand/Collapse */}
      {canExpand && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}