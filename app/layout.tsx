// ============================================================================
// ROOT LAYOUT
// ============================================================================
//
// This is the root layout for the entire application. It:
// - Sets up HTML metadata
// - Loads fonts via <link> tag
// - Imports global styles
// - Provides the base page structure
// - Includes persistent Navigation across all pages
//
// ============================================================================

import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/layout/Navigation';

// ----------------------------------------------------------------------------
// METADATA
// ----------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Corrado RAG',
  description: 'Document Q&A with intelligent ingestion',
};

// ----------------------------------------------------------------------------
// ROOT LAYOUT
// ----------------------------------------------------------------------------

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <head>
        {/* Fontshare - Array and Khand fonts */}
        <link 
          href="https://api.fontshare.com/v2/css?f[]=khand@300,400,500,600,700,1&f[]=array@401,400,600,601,701,700&display=swap" 
          rel="stylesheet"
        />
      </head>
      <body className="h-screen flex flex-col">
        <Navigation />
        {children}
      </body>
    </html>
  );
}