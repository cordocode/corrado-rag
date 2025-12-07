// ============================================================================
// NAVIGATION COMPONENT
// ============================================================================

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface NavLink {
  href: string;
  label: string;
}

// ----------------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------------

const NAV_LINKS: NavLink[] = [
  { href: '/chat', label: 'Chat' },
  { href: '/training', label: 'Training' },
  { href: '/settings', label: 'Settings' },
];

// ----------------------------------------------------------------------------
// COMPONENT
// ----------------------------------------------------------------------------

export default function Navigation(): React.ReactElement {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  }

  return (
    <nav className="border-b border-[var(--color-border-light)]">
      <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link 
          href="/chat" 
          className="font-header text-lg font-semibold tracking-wide text-[var(--color-text-primary)]"
        >
          CORRADO
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`
                text-sm font-medium
                ${isActive(link.href)
                  ? 'text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }
              `}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}