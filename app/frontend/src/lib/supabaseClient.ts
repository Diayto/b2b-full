import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function readEnv(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url?.trim() || !anonKey?.trim()) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy app/frontend/.env.example to .env.local and set Supabase credentials.',
    );
  }
  return { url: url.trim(), anonKey: anonKey.trim() };
}

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = readEnv();
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return Boolean(url?.trim() && anonKey?.trim());
}
