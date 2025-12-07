// ============================================================================
// PROCESSING ITEM COMPONENT
// ============================================================================
//
// Single file in the processing queue. Shows:
// - File name and type
// - Progress bar with solid fill + hatched remaining pattern
// - Percentage display
// - Stage text with sparkle emoji
// - Cancel button (while processing)
// - Extracted chips (when complete)
// - Custom chip input (when complete)
// - Dismiss button (when complete or error)
//
// ============================================================================

'use client';

import ChipsDisplay from './ChipsDisplay';
import CustomChipInput from './CustomChipInput';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface ProcessingItemProps {
  id: string;
  fileName: string;
  status: 'pending' | 'processing' | 'reprocessing' | 'complete' | 'error' | 'cancelled';
  progress: number;
  stage: string;
  fileType: string | null;
  extractedChips: Record<string, string>;
  customChips: Record<string, string>;
  error?: string;
  currentPage?: number;
  totalPages?: number;
  onCancel: (id: string) => void;
  onCustomChipsChange: (id: string, chips: Record<string, string>) => void;
  onDismiss: (id: string) => void;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function ProcessingItem({
  id,
  fileName,
  status,
  progress,
  stage,
  fileType,
  extractedChips,
  customChips,
  error,
  onCancel,
  onCustomChipsChange,
  onDismiss,
}: ProcessingItemProps): React.ReactElement {
  const isProcessing = status === 'processing' || status === 'pending' || status === 'reprocessing';
  const isComplete = status === 'complete';
  const isError = status === 'error' || status === 'cancelled';

  // Clamp progress between 0 and 100
  const clampedProgress = Math.min(100, Math.max(0, progress));

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-muted)]">📄</span>
            <p className="font-medium text-[var(--color-text-primary)] truncate">
              {fileName}
            </p>
          </div>
          {fileType && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 uppercase ml-6">
              {fileType}
            </p>
          )}
        </div>
        
        {isProcessing && (
          <button
            onClick={() => onCancel(id)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg leading-none ml-2"
            title="Cancel"
          >
            [X]
          </button>
        )}
        
        {(isComplete || isError) && (
          <button
            onClick={() => onDismiss(id)}
            className="text-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Progress bar - new design */}
      {isProcessing && (
        <div className="mb-3">
          <div className="flex items-center gap-3">
            {/* Progress bar container */}
            <div className="flex-1 h-6 relative overflow-hidden rounded-sm">
              {/* Hatched background pattern (remaining portion) */}
              <div 
                className="absolute inset-0"
                style={{
                  backgroundImage: `repeating-linear-gradient(
                    90deg,
                    var(--color-text-primary) 0px,
                    var(--color-text-primary) 2px,
                    transparent 2px,
                    transparent 6px
                  )`,
                  opacity: 0.3,
                }}
              />
              
              {/* Solid fill (completed portion) */}
              <div 
                className="absolute inset-y-0 left-0 bg-[var(--color-text-primary)] transition-all duration-300 ease-out"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
            
            {/* Percentage */}
            <span className="text-sm font-medium text-[var(--color-text-primary)] w-12 text-right">
              {Math.round(clampedProgress)}%
            </span>
          </div>
        </div>
      )}

      {/* Stage text */}
      {isProcessing && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <span>✨</span>
          <span>{stage}</span>
        </div>
      )}

      {/* Error message */}
      {isError && (
        <p className="text-sm text-red-600 mb-3">
          {error || 'Processing was cancelled'}
        </p>
      )}

      {/* Complete state */}
      {isComplete && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <span>✓</span>
            <span>Training complete</span>
          </div>

          {Object.keys(extractedChips).length > 0 && (
            <ChipsDisplay chips={extractedChips} label="Auto-identified" />
          )}

          <CustomChipInput
            chips={customChips}
            onChange={(chips) => onCustomChipsChange(id, chips)}
          />
        </div>
      )}
    </div>
  );
}