// ============================================================================
// FILE DROPZONE COMPONENT
// ============================================================================
//
// Upload area for training documents. Supports:
// - Drag and drop
// - Click to browse
// - PDF and TXT files
//
// ============================================================================

'use client';

import { useState, useRef, useCallback } from 'react';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  isDisabled?: boolean;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function FileDropzone({
  onFileSelect,
  isDisabled = false,
}: FileDropzoneProps): React.ReactElement {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDisabled) {
      setIsDragOver(true);
    }
  }, [isDisabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isDisabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFileSelect(files[0]);
    }
  }, [isDisabled, onFileSelect]);

  const handleClick = useCallback(() => {
    if (!isDisabled && inputRef.current) {
      inputRef.current.click();
    }
  }, [isDisabled]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [onFileSelect]);

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
        transition-colors duration-150
        ${isDragOver 
          ? 'border-[var(--color-text-primary)] bg-[var(--color-surface)]' 
          : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
        }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt"
        onChange={handleFileChange}
        className="hidden"
        disabled={isDisabled}
      />

      <div className="text-4xl mb-4 font-mono text-[var(--color-text-muted)]">
        [+]
      </div>
      
      <p className="text-[var(--color-text-primary)] font-medium mb-2">
        Drop files here to train your model
      </p>
      
      <p className="text-[var(--color-text-muted)] text-sm mb-4">
        or click to browse
      </p>
      
      <p className="text-[var(--color-text-muted)] text-xs">
        Supported: PDF, TXT
      </p>
    </div>
  );
}