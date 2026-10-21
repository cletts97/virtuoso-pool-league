import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isPublicSupabaseKey } from './publicConfig';
export const liveMode = import.meta.env.VITE_DATA_MODE === 'api';
let client: SupabaseClient | undefined;
export function authClient(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL,
      key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key || !isPublicSupabaseKey(key))
      throw new Error(
        'Configure the public Supabase URL and publishable key for live mode. Never use a server secret in VITE settings.',
      );
    client = createClient(url, key, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
