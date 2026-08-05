import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

/**
 * Auth helpers for Supabase mode. All functions throw if Supabase is not
 * configured (the app falls back to local demo mode without auth).
 */

function requireClient() {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured.')
  return sb
}

/** Returns the current session from the local cache (no network call). */
export async function getSession(): Promise<Session | null> {
  const sb = requireClient()
  const { data } = await sb.auth.getSession()
  return data.session
}

/** Subscribes to auth state changes. Returns null when not in Supabase mode. */
export function onAuthStateChange(
  cb: (event: AuthChangeEvent, session: Session | null) => void,
): { unsubscribe: () => void } | null {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = sb.auth.onAuthStateChange(cb)
  return { unsubscribe: () => data.subscription.unsubscribe() }
}

export async function signInWithPassword(email: string, password: string) {
  const sb = requireClient()
  return sb.auth.signInWithPassword({ email, password })
}

export async function signUpWithEmail(email: string, password: string) {
  const sb = requireClient()
  return sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  })
}

export async function signOut() {
  const sb = requireClient()
  await sb.auth.signOut()
}
