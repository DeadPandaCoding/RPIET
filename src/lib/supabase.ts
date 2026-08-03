import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the Supabase client when env vars are configured, otherwise null.
 * When null, the app falls back to local browser storage (demo mode).
 */
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) return null
  if (!client) {
    client = createClient(url, anonKey)
  }
  return client
}

