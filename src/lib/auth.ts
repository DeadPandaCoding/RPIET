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
  // supabase-js defaults signOut() to the GLOBAL scope, which would sign the
  // user out on EVERY device. Scope the main "Sign out" to THIS device only:
  // it revokes this session's refresh tokens server-side and clears the local
  // session, while every other device stays signed in. ("Sign out everywhere"
  // uses the global scope explicitly; "Sign out other devices" uses 'others'.)
  await sb.auth.signOut({ scope: 'local' })
}

/**
 * Sends a password-reset email via Supabase. The recovery link returns the
 * user to the app (origin), where the PASSWORD_RECOVERY event triggers the
 * "set a new password" screen.
 */
export async function resetPasswordForEmail(email: string) {
  const sb = requireClient()
  return sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
}

/** Sets a new password for the currently signed-in (recovery) user. */
export async function updatePassword(password: string) {
  const sb = requireClient()
  return sb.auth.updateUser({ password })
}

/**
 * Revokes EVERY session for the user server-side (this device included).
 * The user must sign in again on every device.
 */
export async function signOutEverywhere() {
  const sb = requireClient()
  await sb.auth.signOut({ scope: 'global' })
}

/**
 * Revokes all OTHER sessions server-side while keeping this device signed in.
 */
export async function signOutOtherDevices() {
  const sb = requireClient()
  await sb.auth.signOut({ scope: 'others' })
}
