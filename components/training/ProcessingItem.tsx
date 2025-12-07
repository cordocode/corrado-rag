// ============================================================================
// PROCESSING ITEM COMPONENT
// ============================================================================
//
// Single file in the processing queue. Shows:
// - File name and type
// - Animated dotted progress bar (while processing)
// - Stage text (while processing)
// - Cancel button (while processing)
// - Extracted chips (when complete)
// - Custom chip input (when complete)
// - Dismiss button (when complete or error)
//
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import ChipsDisplay from './ChipsDisplay';
import CustomChipInput from './CustomChipInput';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface ProcessingItemProps {
  id: string;
  fileName: string;
  status: 'pending' | 'processing' | 'complete' | 'error' | 'cancelled';
  progress: number;
  stage: string;
  fileType: string | null;
  extractedChips: Record<string, string>;
  customChips: Record<string, string>;
  error?: string;
  onCancel: (id: string) => void;
  onCustomChipsChange: (id: string, chips: Record<string, string>) => void;
  onDismiss: (id: string) => void;
}

// ----------------------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------------------

const TOTAL_DOTS = 20;

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
  const isProcessing = status === 'processing' || status === 'pending';
  const isComplete = status === 'complete';
  const isError = status === 'error' || status === 'cancelled';

  // Smooth progress animation
  const [displayProgress, setDisplayProgress] = useState(0);
  const [animOffset, setAnimOffset] = useState(0);

  // Smoothly animate progress changes
  useEffect(() => {
    if (progress > displayProgress) {
      const timer = setInterval(() => {
        setDisplayProgress((prev) => {
          const next = prev + 0.5;
          if (next >= progress) {
            clearInterval(timer);
            return progress;
          }
          return next;
        });
      }, 50);
      return () => clearInterval(timer);
    }
  }, [progress, displayProgress]);

  // Animate the shimmer effect on dots
  useEffect(() => {
    if (!isProcessing) return;
    const timer = setInterval(() => {
      setAnimOffset((prev) => (prev + 1) % TOTAL_DOTS);
    }, 150);
    return () => clearInterval(timer);
  }, [isProcessing]);

  // Calculate filled dots
  const filledDots = Math.floor((displayProgress / 100) * TOTAL_DOTS);

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-text-primary)] truncate">
            {fileName}
          </p>
          {fileType && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 uppercase">
              {fileType}
            </p>
          )}
        </div>
        
        {isProcessing && (
          <button
            onClick={() => onCancel(id)}
            className="text-sm text-[var(--color-text-muted)] hover:text-red-600"
          >
            Cancel
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

      {/* Dotted progress bar */}
      {isProcessing && (
        <div className="mb-3">
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_DOTS }).map((_, i) => {
              const isFilled = i < filledDots;
              const isShimmer = !isFilled && i === filledDots && (animOffset % 2 === 0);
              return (
                <div
                  key={i}
                  className={`
                    h-2 flex-1 rounded-sm transition-all duration-150
                    ${isFilled 
                      ? 'bg-[var(--color-text-primary)]' 
                      : isShimmer
                        ? 'bg-[var(--color-text-muted)]'
                        : 'bg-[var(--color-border)]'
                    }
                  `}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Stage text */}
      {isProcessing && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <span className="animate-pulse">·</span>
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
            <span>[ok]</span>
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