// ============================================================================
// DOCUMENT CARD COMPONENT
// ============================================================================
//
// Card displaying a single trained document in the grid.
// Shows: name, type, chunk count, date, status.
//
// ============================================================================

'use client';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface DocumentCardProps {
  id: string;
  name: string;
  fileType: string | null;
  status: string;
  uploadedAt: string;
  chunkCount: number;
  onClick: (id: string) => void;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function DocumentCard({
  id,
  name,
  fileType,
  status,
  uploadedAt,
  chunkCount,
  onClick,
}: DocumentCardProps): React.ReactElement {
  const date = new Date(uploadedAt);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <button
      onClick={() => onClick(id)}
      className="w-full text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 hover:border-[var(--color-text-muted)] transition-colors"
    >
      <div className="flex items-start gap-3">
        
        {/* File type indicator */}
        <div className="text-lg font-mono text-[var(--color-text-muted)] w-8 flex-shrink-0">
          {fileType === 'pdf' ? '.pdf' : '.txt'}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-text-primary)] truncate">
            {name}
          </p>
          
          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-text-muted)]">
            {fileType && (
              <span className="uppercase">{fileType}</span>
            )}
            <span>·</span>
            <span>{chunkCount} chunks</span>
            <span>·</span>
            <span>{formattedDate}</span>
          </div>
          
          {status !== 'complete' && (
            <span className={`
              inline-block mt-2 text-xs px-2 py-0.5 rounded
              ${status === 'processing' ? 'bg-yellow-500/20 text-yellow-600' : ''}
              ${status === 'error' ? 'bg-red-500/20 text-red-600' : ''}
              ${status === 'pending' ? 'bg-blue-500/20 text-blue-600' : ''}
            `}>
              {status}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}