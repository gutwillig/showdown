/**
 * Supabase client setup for multiplayer
 * Handles environment variables and provides connection status
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isMultiplayerConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isMultiplayerConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  if (!supabaseClient) {
    console.log('Creating Supabase client with URL:', SUPABASE_URL);
    supabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
  }

  return supabaseClient;
}
