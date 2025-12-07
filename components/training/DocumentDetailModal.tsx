// ============================================================================
// DOCUMENT DETAIL MODAL
// ============================================================================
//
// Full-screen modal showing document details:
// - File info (name, type, chunks, status)
// - Timeline (uploaded, processed)
// - Auto-identified chips
// - Custom chips (editable)
// - Content preview
// - Delete action
//
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import ChipsDisplay from './ChipsDisplay';
import CustomChipInput from './CustomChipInput';

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
  onUpdate?: () => void;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function DocumentDetailModal({
  documentId,
  onClose,
  onDelete,
  onUpdate,
}: DocumentDetailModalProps): React.ReactElement | null {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // Custom chips editing state
  const [customChips, setCustomChips] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);

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
        setCustomChips(data.custom_chips || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchDocument();
  }, [documentId]);

  // --------------------------------------------------------------------------
  // POLL FOR REPROCESSING STATUS
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!isReprocessing || !documentId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/upload?id=${documentId}`);
        if (!res.ok) return;
        
        const data = await res.json();
        
        if (data.status === 'complete') {
          setIsReprocessing(false);
          setIsSaving(false);
          // Refresh document data
          const docRes = await fetch(`/api/documents?id=${documentId}`);
          if (docRes.ok) {
            const docData = await docRes.json();
            setDoc(docData);
            setCustomChips(docData.custom_chips || {});
          }
          // Notify parent to refresh list
          if (onUpdate) {
            onUpdate();
          }
        } else if (data.status === 'error') {
          setIsReprocessing(false);
          setIsSaving(false);
          setSaveError(data.error || 'Reprocessing failed');
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [isReprocessing, documentId, onUpdate]);

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

  async function handleCustomChipsChange(newChips: Record<string, string>): Promise<void> {
    setCustomChips(newChips);
    setSaveError(null);
    
    // Check if chips actually changed
    const currentChips = doc?.custom_chips || {};
    const chipsChanged = JSON.stringify(currentChips) !== JSON.stringify(newChips);
    
    if (!chipsChanged || !documentId) return;
    
    setIsSaving(true);
    
    try {
      const res = await fetch('/api/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: documentId, customChips: newChips }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      
      const data = await res.json();
      
      if (data.status === 'reprocessing') {
        setIsReprocessing(true);
      } else {
        setIsSaving(false);
        // Update local doc state
        if (doc) {
          setDoc({ ...doc, custom_chips: newChips });
        }
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
      setIsSaving(false);
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

              {/* Custom chips - editable */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                    Custom Identifiers
                  </h3>
                  {isSaving && (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {isReprocessing ? 'Reprocessing...' : 'Saving...'}
                    </span>
                  )}
                </div>
                
                {saveError && (
                  <p className="text-sm text-red-600 mb-2">{saveError}</p>
                )}
                
                <CustomChipInput
                  chips={customChips}
                  onChange={handleCustomChipsChange}
                />
                
                <p className="text-xs text-[var(--color-text-muted)] mt-2">
                  Adding or removing custom identifiers will reprocess the document to update search embeddings.
                </p>
              </div>

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
              disabled={isSaving}
              className={`text-sm px-4 py-2 rounded ${
                confirmDelete
                  ? 'bg-red-600 text-white'
                  : 'text-red-600 hover:bg-red-600/10'
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
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