// ============================================================================
// DOCUMENT DETAIL MODAL
// ============================================================================
//
// Full-screen modal showing document details:
// - File info (name, type, chunks, status)
// - Timeline (uploaded, processed)
// - Auto-identified chips
// - Custom chips
// - Content preview
// - Delete action
//
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import ChipsDisplay from './ChipsDisplay';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface DocumentDetail {
  id: string;
  original_name: string;
  file_type: string | null;
  status: string;
  uploaded_at: string;
  processed_at: string | null;
  chunk_count: number;
  full_text: string | null;
  custom_chips: Record<string, string>;
  chips: Record<string, string>;
}

interface DocumentDetailModalProps {
  documentId: string | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function DocumentDetailModal({
  documentId,
  onClose,
  onDelete,
}: DocumentDetailModalProps): React.ReactElement | null {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // --------------------------------------------------------------------------
  // FETCH DOCUMENT
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!documentId) {
      setDoc(null);
      return;
    }

    async function fetchDocument(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/documents?id=${documentId}`);
        if (!res.ok) {
          throw new Error('Failed to fetch document');
        }
        const data = await res.json();
        setDoc(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchDocument();
  }, [documentId]);

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  function handleDelete(): void {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (doc) {
      onDelete(doc.id);
    }
  }

  function handleBackdropClick(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  if (!documentId) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: '#ffffe2' }}
      onClick={handleBackdropClick}
    >
      {/* Modal */}
      <div 
        className="relative border border-[var(--color-border)] rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-xl"
        style={{ backgroundColor: '#ffffe2' }}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-medium text-[var(--color-text-primary)]">
            Document Details
          </h2>
          <button
            onClick={onClose}
            className="text-2xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <p className="text-[var(--color-text-muted)]">Loading...</p>
          )}

          {error && (
            <p className="text-red-600">{error}</p>
          )}

          {doc && (
            <div className="space-y-6">
              
              {/* File info */}
              <div>
                <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                  File
                </h3>
                <p className="text-[var(--color-text-primary)] font-medium">
                  {doc.original_name}
                </p>
                <div className="flex items-center gap-2 mt-1 text-sm text-[var(--color-text-muted)]">
                  {doc.file_type && (
                    <span className="uppercase">{doc.file_type}</span>
                  )}
                  <span>·</span>
                  <span>{doc.chunk_count} chunks</span>
                  <span>·</span>
                  <span>{doc.status}</span>
                </div>
              </div>

              {/* Dates */}
              <div>
                <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                  Timeline
                </h3>
                <div className="text-sm text-[var(--color-text-secondary)]">
                  <p>Uploaded: {new Date(doc.uploaded_at).toLocaleString()}</p>
                  {doc.processed_at && (
                    <p>Processed: {new Date(doc.processed_at).toLocaleString()}</p>
                  )}
                </div>
              </div>

              {/* Extracted chips */}
              {Object.keys(doc.chips).length > 0 && (
                <ChipsDisplay chips={doc.chips} label="Auto-identified" />
              )}

              {/* Custom chips */}
              {Object.keys(doc.custom_chips).length > 0 && (
                <ChipsDisplay chips={doc.custom_chips} label="Custom identifiers" />
              )}

              {/* Full text */}
              {doc.full_text && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                    Content
                  </h3>
                  <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded p-3 max-h-96 overflow-y-auto">
                    <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono">
                      {doc.full_text}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {doc && (
          <div className="flex items-center justify-between p-4 border-t border-[var(--color-border)]">
            <button
              onClick={handleDelete}
              className={`text-sm px-4 py-2 rounded ${
                confirmDelete
                  ? 'bg-red-600 text-white'
                  : 'text-red-600 hover:bg-red-600/10'
              }`}
            >
              {confirmDelete ? 'Click again to confirm' : 'Delete Document'}
            </button>
            
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded hover:bg-[var(--color-border)]"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}