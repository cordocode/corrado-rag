// ============================================================================
// TRAINING PAGE
// ============================================================================
//
// Document training interface. Users can:
// - Upload documents via drag-and-drop or file picker
// - See processing progress with stage animations
// - Add custom chips to documents
// - View and manage trained documents
//
// ============================================================================

'use client';

import { useState, useCallback } from 'react';
import FileDropzone from '@/components/training/FileDropzone';
import ProcessingQueue from '@/components/training/ProcessingQueue';
import TrainedDocuments from '@/components/training/TrainedDocuments';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface UploadStatus {
  status: 'pending' | 'processing' | 'reprocessing' | 'complete' | 'error' | 'cancelled';
  progress: number;
  stage: string;
  documentId: string;
  fileName: string;
  fileType: string | null;
  extractedChips: Record<string, string>;
  customChips: Record<string, string>;
  error?: string;
  currentPage?: number;
  totalPages?: number;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function TrainingPage(): React.ReactElement {
  const [queue, setQueue] = useState<UploadStatus[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // --------------------------------------------------------------------------
  // FILE UPLOAD
  // --------------------------------------------------------------------------

  const handleFileSelect = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();
      
      const newItem: UploadStatus = {
        status: 'processing',
        progress: 0,
        stage: 'Starting...',
        documentId: data.documentId,
        fileName: data.fileName,
        fileType: null,
        extractedChips: {},
        customChips: {},
        currentPage: 0,
        totalPages: 0,
      };

      setQueue((prev) => [...prev, newItem]);
      pollStatus(data.documentId);

    } catch (err) {
      console.error('Upload error:', err);
      alert(err instanceof Error ? err.message : 'Upload failed');
    }
  }, []);

  // --------------------------------------------------------------------------
  // STATUS POLLING
  // --------------------------------------------------------------------------

  async function pollStatus(documentId: string): Promise<void> {
    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/upload?id=${documentId}`);
        if (!res.ok) return;

        const data: UploadStatus = await res.json();

        setQueue((prev) =>
          prev.map((item) =>
            item.documentId === documentId ? data : item
          )
        );

        if (data.status === 'processing' || data.status === 'pending' || data.status === 'reprocessing') {
          setTimeout(poll, 1000);
        } else if (data.status === 'complete') {
          setRefreshTrigger((n) => n + 1);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    poll();
  }

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const handleCancel = useCallback(async (id: string) => {
    try {
      await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      setQueue((prev) =>
        prev.map((item) =>
          item.documentId === id
            ? { ...item, status: 'cancelled' as const, stage: 'Cancelled' }
            : item
        )
      );
    } catch (err) {
      console.error('Cancel error:', err);
    }
  }, []);

  const handleCustomChipsChange = useCallback(async (id: string, chips: Record<string, string>) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.documentId === id ? { ...item, customChips: chips } : item
      )
    );

    try {
      await fetch('/api/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, customChips: chips }),
      });
    } catch (err) {
      console.error('Update chips error:', err);
    }
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.documentId !== id));
    setRefreshTrigger((n) => n + 1);
  }, []);

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-2">
            Training
          </h1>
          <p className="text-[var(--color-text-muted)]">
            Upload documents to train your knowledge base
          </p>
        </div>

        {/* Upload area */}
        <FileDropzone
          onFileSelect={handleFileSelect}
          isDisabled={false}
        />

        {/* Processing queue */}
        <ProcessingQueue
          items={queue}
          onCancel={handleCancel}
          onCustomChipsChange={handleCustomChipsChange}
          onDismiss={handleDismiss}
        />

        {/* Trained documents */}
        <TrainedDocuments refreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
}