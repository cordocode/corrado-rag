// ============================================================================
// ROOT PAGE - REDIRECT TO CHAT
// ============================================================================
//
// The root URL (/) redirects to /chat since that's the primary interface.
//
// ============================================================================

import { redirect } from 'next/navigation';

export default function RootPage(): never {
  redirect('/chat');
}