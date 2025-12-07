// ============================================================================
// SETTINGS API ROUTE
// ============================================================================
//
// GET /api/settings - Fetch user settings
// PUT /api/settings - Update user settings
//
// ============================================================================

import { NextRequest } from 'next/server';
import { getUserSettings, updateUserSettings } from '@/src/lib/settings';
import { DEFAULT_USER_ID } from '@/src/lib/constants';

// ----------------------------------------------------------------------------
// GET - Fetch settings
// ----------------------------------------------------------------------------

export async function GET(): Promise<Response> {
  try {
    const settings = await getUserSettings(DEFAULT_USER_ID);
    
    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[SETTINGS API] GET error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ----------------------------------------------------------------------------
// PUT - Update settings
// ----------------------------------------------------------------------------

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    
    // Validate inputs
    const updates: Record<string, unknown> = {};
    
    if (typeof body.chunks_per_query === 'number') {
      const chunks = Math.min(20, Math.max(1, body.chunks_per_query));
      updates.chunks_per_query = chunks;
    }
    
    if (typeof body.similarity_threshold === 'number') {
      const threshold = Math.min(1, Math.max(0, body.similarity_threshold));
      updates.similarity_threshold = threshold;
    }
    
    if (body.system_prompt !== undefined) {
      updates.system_prompt = body.system_prompt;
    }
    
    if (typeof body.chat_model === 'string') {
      updates.chat_model = body.chat_model;
    }

    const settings = await updateUserSettings(DEFAULT_USER_ID, updates);
    
    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[SETTINGS API] PUT error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}