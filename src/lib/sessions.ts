/**
 * Client-side helpers for the Devices & Sessions feature.
 *
 * Listing/revoking sessions goes through the serverless function at
 * /api/sessions (which holds the service_role key server-side). The current
 * session id is read from the access token's JWT payload (session_id claim),
 * so the UI can mark "This device".
 */
import { getSupabase } from './supabase'

export interface SessionInfo {
  id: string
  createdAt: string
  updatedAt: string
  userAgent: string | null
  ip: string | null
}

export interface SessionsResult {
  ok: boolean
  sessions: SessionInfo[]
  currentSessionId: string | null
  error?: string
}

/** Decodes the `session_id` claim out of a Supabase access-token JWT. */
export function sessionIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}

async function currentToken(): Promise<string | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.access_token ?? null
}

export async function fetchActiveSessions(): Promise<SessionsResult> {
  const token = await currentToken()
  if (!token) return { ok: false, sessions: [], currentSessionId: null, error: 'Not signed in.' }
  try {
    const res = await fetch('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      return {
        ok: false,
        sessions: [],
        currentSessionId: sessionIdFromToken(token),
        error: body?.error ?? `Server returned ${res.status}.`,
      }
    }
    const body = (await res.json()) as { sessions?: SessionInfo[] }
    return {
      ok: true,
      sessions: body.sessions ?? [],
      currentSessionId: sessionIdFromToken(token),
    }
  } catch {
    return { ok: false, sessions: [], currentSessionId: sessionIdFromToken(token), error: 'Could not reach the session service.' }
  }
}

export async function revokeSession(sid: string): Promise<void> {
  const token = await currentToken()
  if (!token) throw new Error('Not signed in.')
  const res = await fetch('/api/sessions', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sid }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Server returned ${res.status}.`)
  }
}

/** A friendly label for a device, derived from its User-Agent string. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? ''
  const lower = ua.toLowerCase()
  const isMobile = /mobile|iphone|ipad|android/i.test(lower)
  let os = 'Unknown OS'
  if (/windows/i.test(lower)) os = 'Windows'
  else if (/iphone|ipad|ios/i.test(lower)) os = 'iOS'
  else if (/android/i.test(lower)) os = 'Android'
  else if (/mac os x|macintosh/i.test(lower)) os = 'macOS'
  else if (/linux/i.test(lower)) os = 'Linux'
  let browser = 'Browser'
  if (/edg\//i.test(lower)) browser = 'Edge'
  else if (/opr\/|opera/i.test(lower)) browser = 'Opera'
  else if (/chrome\/|crios\//i.test(lower)) browser = 'Chrome'
  else if (/firefox\/|fxios/i.test(lower)) browser = 'Firefox'
  else if (/safari\//i.test(lower)) browser = 'Safari'
  return `${browser} · ${os}${isMobile ? ' · mobile' : ''}`
}

/** Compact relative timestamp like "2m ago" / "3h ago" / "5d ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'recently'
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
