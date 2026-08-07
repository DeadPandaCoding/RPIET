/**
 * Per-account security settings (stored in Supabase behind owner-only RLS).
 * Unlike the device-local preferences in prefs.ts, these follow the user to
 * every device - and enforcement is server-side (a trigger on auth.users, see
 * supabase/schema.sql), so this module is only the thin read/write layer that
 * powers the Settings UI.
 */
import { getSupabase } from './supabase'
import { getSession } from './auth'

export interface SecuritySettings {
  revokeSessionsOnPasswordChange: boolean
}

const DEFAULT_SETTINGS: SecuritySettings = {
  revokeSessionsOnPasswordChange: false,
}

/** Reads the user's security settings (defaults apply when never saved). */
export async function getSecuritySettings(): Promise<SecuritySettings> {
  const sb = getSupabase()
  if (!sb) return DEFAULT_SETTINGS
  const { data, error } = await sb
    .from('user_security_settings')
    .select('revoke_sessions_on_password_change')
    .maybeSingle()
  // Missing table (schema.sql not re-run) or any error: defaults.
  if (error || !data) return DEFAULT_SETTINGS
  return {
    revokeSessionsOnPasswordChange: Boolean(data.revoke_sessions_on_password_change),
  }
}

/** Saves the "sign out other devices when the password changes" preference. */
export async function setRevokeSessionsOnPasswordChange(enabled: boolean): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured.')
  const session = await getSession()
  if (!session) throw new Error('You must be signed in.')
  const { error } = await sb
    .from('user_security_settings')
    .upsert(
      {
        user_id: session.user.id,
        revoke_sessions_on_password_change: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  if (error) throw new Error(error.message)
}
