// ============================================================================
// SETTINGS SECTION COMPONENT
// ============================================================================
//
// Collapsible section wrapper for settings page.
// Provides consistent styling with title, optional description, and collapse toggle.
//
// ============================================================================

'use client';

import { useState } from 'react';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  defaultCollapsed?: boolean;
  collapsible?: boolean;
}

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function SettingsSection({
  title,
  description,
  children,
  action,
  defaultCollapsed = false,
  collapsible = true,
}: SettingsSectionProps): React.ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <section>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-transform"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            >
              ▼
            </button>
          )}
          <div>
            <h2 
              className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)] cursor-pointer"
              onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
            >
              {title}
            </h2>
            {description && !isCollapsed && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && !isCollapsed && <div>{action}</div>}
      </div>
      
      {!isCollapsed && <div>{children}</div>}
    </section>
  );
}