// ============================================================================
// SUPABASE CLIENT CONFIGURATION
// ============================================================================
//
// This file creates and exports a single Supabase client instance that will
// be used throughout the application to interact with the database.
//
// WHAT THIS DOES:
// - Reads Supabase credentials from environment variables
// - Creates a Supabase client with SERVICE ROLE key (full database access)
// - Exports the client so other files can import and use it
//
// WHY SERVICE ROLE KEY:
// - We use service_role instead of anon key because we need to:
//   1. Insert embeddings (vectors) which require elevated permissions
//   2. Access all tables without Row Level Security restrictions
//   3. Perform admin operations like bulk inserts
//
// WHY LAZY INITIALIZATION:
// - Environment variables may not be loaded when this module is first imported
// - The Proxy defers client creation until first actual database call
// - This allows test scripts to load .env.local before Supabase initializes
//
// USAGE EXAMPLE:
// import { supabase } from '@/supabase';
// const { data } = await supabase.from('documents').select('*');
//
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ----------------------------------------------------------------------------
// LAZY INITIALIZATION
// ----------------------------------------------------------------------------

let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
      );
    }

    _supabase = createClient(supabaseUrl, supabaseKey);
  }
  return _supabase;
}

// ----------------------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------------------

// Proxy allows `import { supabase }` to work while deferring initialization
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseClient() as any)[prop];
  }
});