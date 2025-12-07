// ============================================================================
// SETTINGS PAGE
// ============================================================================
//
// Configuration page with collapsible sections for:
// - Retrieval settings (chunks, threshold)
// - System prompt
// - Model selection (locked for v1)
// - Document type templates
//
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import SettingsSection from '@/components/settings/SettingsSection';
import RetrievalSettings from '@/components/settings/RetrievalSettings';
import SystemPromptEditor from '@/components/settings/SystemPromptEditor';
import ModelSelector from '@/components/settings/ModelSelector';
import TemplateList from '@/components/settings/TemplateList';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface Settings {
  chunks_per_query: number;
  similarity_threshold: number;
  system_prompt: string | null;
  chat_model: string;
}

// ----------------------------------------------------------------------------
// PAGE
// ----------------------------------------------------------------------------

export default function SettingsPage(): React.ReactElement {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings(): Promise<void> {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to load settings');
        const data = await response.json();
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Generic save function
  async function saveSettings(updates: Partial<Settings>): Promise<void> {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to save settings');
    const data = await response.json();
    setSettings(data);
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-[var(--color-text-muted)]">Loading settings...</p>
      </div>
    );
  }

  // Error state
  if (error || !settings) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-red-600">Error: {error ?? 'Failed to load settings'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-8">Settings</h1>

      <div className="space-y-8">
        {/* Retrieval Settings */}
        <div className="border border-[var(--color-border)] rounded-lg p-6">
          <RetrievalSettings
            chunksPerQuery={settings.chunks_per_query}
            similarityThreshold={settings.similarity_threshold}
            onSave={async (chunks, threshold) => {
              await saveSettings({
                chunks_per_query: chunks,
                similarity_threshold: threshold,
              });
            }}
          />
        </div>

        {/* System Prompt */}
        <div className="border border-[var(--color-border)] rounded-lg p-6">
          <SystemPromptEditor
            systemPrompt={settings.system_prompt}
            onSave={async (prompt) => {
              await saveSettings({ system_prompt: prompt });
            }}
          />
        </div>

        {/* Model Selection (locked for v1) */}
        <div className="border border-[var(--color-border)] rounded-lg p-6">
          <ModelSelector
            currentModel={settings.chat_model}
            onSave={async (model) => {
              await saveSettings({ chat_model: model });
            }}
          />
        </div>

        {/* Document Type Templates */}
        <div className="border border-[var(--color-border)] rounded-lg p-6">
          <TemplateList />
        </div>
      </div>
    </div>
  );
}