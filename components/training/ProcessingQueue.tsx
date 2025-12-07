// ============================================================================
// PROCESSING QUEUE COMPONENT
// ============================================================================
//
// Container for files currently being processed. Displays a list of
// ProcessingItem components.
//
// ============================================================================

'use client';

import ProcessingItem from './ProcessingItem';

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

interface ProcessingQueueProps {
  items: UploadStatus[];
  onCancel: (id: string) => void;
  onCustomChipsChange: (id: string, chips: Record<string, string>) => void;
  onDismiss: (id: string) => void;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function ProcessingQueue({
  items,
  onCancel,
  onCustomChipsChange,
  onDismiss,
}: ProcessingQueueProps): React.ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
        Processing Queue
      </h3>
      <div className="space-y-3">
        {items.map((item) => (
          <ProcessingItem
            key={item.documentId}
            id={item.documentId}
            fileName={item.fileName}
            status={item.status}
            progress={item.progress}
            stage={item.stage}
            fileType={item.fileType}
            extractedChips={item.extractedChips}
            customChips={item.customChips}
            error={item.error}
            currentPage={item.currentPage}
            totalPages={item.totalPages}
            onCancel={onCancel}
            onCustomChipsChange={onCustomChipsChange}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}