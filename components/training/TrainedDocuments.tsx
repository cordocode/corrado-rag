// ============================================================================
// TRAINED DOCUMENTS COMPONENT
// ============================================================================
//
// Grid of trained documents. Fetches from /api/documents and displays
// DocumentCard components. Clicking opens DocumentDetailModal.
//
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import DocumentCard from './DocumentCard';
import DocumentDetailModal from './DocumentDetailModal';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface Document {
  id: string;
  original_name: string;
  file_type: string | null;
  status: string;
  uploaded_at: string;
  chunk_count: number;
}

interface TrainedDocumentsProps {
  refreshTrigger?: number;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function TrainedDocuments({
  refreshTrigger = 0,
}: TrainedDocumentsProps): React.ReactElement {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [internalRefresh, setInternalRefresh] = useState(0);

  // --------------------------------------------------------------------------
  // FETCH DOCUMENTS
  // --------------------------------------------------------------------------

  const fetchDocuments = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) {
        throw new Error('Failed to fetch documents');
      }
      const data = await res.json();
      setDocuments(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshTrigger, internalRefresh]);

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  async function handleDelete(id: string): Promise<void> {
    try {
      const res = await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        throw new Error('Failed to delete document');
      }

      setSelectedId(null);
      fetchDocuments();
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  function handleDocumentUpdate(): void {
    // Trigger a refresh of the documents list
    setInternalRefresh((n) => n + 1);
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--color-text-muted)]">Loading documents...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchDocuments}
          className="mt-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[var(--color-text-muted)]">No trained documents yet</p>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Upload files above to get started
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
        Trained Documents ({documents.length})
      </h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            id={doc.id}
            name={doc.original_name}
            fileType={doc.file_type}
            status={doc.status}
            uploadedAt={doc.uploaded_at}
            chunkCount={doc.chunk_count}
            onClick={setSelectedId}
          />
        ))}
      </div>

      <DocumentDetailModal
        documentId={selectedId}
        onClose={() => setSelectedId(null)}
        onDelete={handleDelete}
        onUpdate={handleDocumentUpdate}
      />
    </div>
  );
}