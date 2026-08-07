/**
 * Vercel serverless function — Devices & Sessions.
 *
 * Lists the signed-in user's active Supabase Auth sessions and revokes
 * individual ones.
 *
 *   GET    /api/sessions            → { sessions: [...] }
 *   DELETE /api/sessions            → body { sid }  → { ok: true }
 *
 * GoTrue has NO admin endpoint to enumerate a user's sessions (the old
 * `/admin/users/{id}/sessions` route does not exist in its current API), so
 * sessions are read straight from the `auth.sessions` table through PostgREST
 * using the service_role key, which must NEVER be exposed in the frontend
 * bundle — it lives here as a Vercel environment variable, server-side only.
 * The auth schema itself stays hidden; access is mediated by two narrow
 * objects created by supabase/schema.sql:
 *
 *   - public.owner_sessions            read-only view over auth.sessions
 *   - public.revoke_owner_session()    deletes one session (and its refresh
 *                                      tokens), scoped to the caller's verified
 *                                      user id; also records the revocation in
 *                                      session_revocations for realtime sign-out
 *   - public.session_revocations       realtime broadcast of revocations
 *                                      (owner-only RLS)
 *
 * Auth: the caller sends `Authorization: Bearer <access_token>`. The access
 * token is verified against GoTrue; only THAT user's sessions are ever
 * listed or revoked — never another user's (no IDOR: the user id is never
 * client-chosen).
 *
 * Required env (Vercel → Settings → Environment Variables):
 *   SUPABASE_SERVICE_ROLE_KEY  (required — the service_role key from
 *                               Supabase → Settings → API Keys. Deliberately
 *                               NOT prefixed VITE_ so Vite can never inline it
 *                               into the client bundle.)
 *   VITE_SUPABASE_URL          (already set; used for the project URL)
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

interface SessionInfo {
  id: string
  createdAt: string
  updatedAt: string
  userAgent: string | null
  ip: string | null
}

/** One-time-setup hint shown when the schema objects are missing. */
const SETUP_HINT =
  'Run supabase/schema.sql in the Supabase SQL Editor (it creates the ' +
  'owner_sessions view and revoke_owner_session function), then try again.'

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 100_000) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/** Best-effort error detail out of a PostgREST error payload. */
function postgrestDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>
  return String(d.message ?? d.msg ?? d.error ?? d.hint ?? '')
}

/** Calls PostgREST (`/rest/v1`) with the service role key. */
async function postgrest(
  url: string,
  serviceRole: string,
  path: string,
  init?: { method?: string; body?: string },
) {
  try {
    const res = await fetch(`${url}/rest/v1${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
      },
      body: init?.body,
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? (JSON.parse(text) as unknown) : null
    } catch {
      data = null
    }
    return { status: res.status, data }
  } catch {
    // Network failure — report a structured error instead of crashing into a
    // Vercel HTML 500 page.
    return { status: 502, data: { message: 'Could not reach Supabase.' } }
  }
}

/**
 * Reads the user's sessions. Prefers the owner_sessions view created by
 * supabase/schema.sql; falls back to the raw auth.sessions table for projects
 * that have exposed the auth schema to PostgREST.
 */
async function listSessions(
  url: string,
  serviceRole: string,
  userId: string,
): Promise<{ ok: true; sessions: SessionInfo[] } | { ok: false; error: string }> {
  const query =
    'select=id,created_at,updated_at,user_agent,ip' +
    `&user_id=eq.${userId}` +
    '&order=updated_at.desc'

  let r = await postgrest(url, serviceRole, `/owner_sessions?${query}`)
  // 404 = view not created yet; 403 = view exists but the grant is missing.
  // Either way, try the raw auth.sessions table (for projects that exposed it).
  if (r.status === 404 || r.status === 403) {
    r = await postgrest(url, serviceRole, `/sessions?${query}`)
  }

  if (r.status !== 200 || !Array.isArray(r.data)) {
    const detail = postgrestDetail(r.data)
    if (r.status === 404 || r.status === 403) {
      return { ok: false, error: `Session listing needs one-time setup. ${SETUP_HINT}` }
    }
    return {
      ok: false,
      error: detail ? `Failed to list sessions: ${detail}` : 'Failed to list sessions.',
    }
  }

  const sessions: SessionInfo[] = (r.data as Array<Record<string, unknown>>).map((s) => ({
    id: String(s.id ?? ''),
    createdAt: String(s.created_at ?? ''),
    updatedAt: String(s.updated_at ?? ''),
    userAgent: (s.user_agent as string | null) ?? null,
    ip: (s.ip as string | null) ?? null,
  }))
  return { ok: true, sessions }
}

/** Revokes one of the user's sessions via the revoke_owner_session function. */
async function revokeSession(
  url: string,
  serviceRole: string,
  userId: string,
  sid: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await postgrest(url, serviceRole, '/rpc/revoke_owner_session', {
    method: 'POST',
    body: JSON.stringify({ p_session_id: sid, p_user_id: userId }),
  })
  if (r.status === 200 || r.status === 204) return { ok: true }
  const detail = postgrestDetail(r.data)
  if (r.status === 404 || r.status === 403) {
    return { ok: false, error: `Revoking sessions needs one-time setup. ${SETUP_HINT}` }
  }
  return {
    ok: false,
    error: detail ? `Failed to revoke session: ${detail}` : 'Failed to revoke session.',
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = process.env.VITE_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) {
    json(res, 503, { error: 'Server not configured (missing SUPABASE_SERVICE_ROLE_KEY).' })
    return
  }

  const token = bearerToken(req)
  if (!token) {
    json(res, 401, { error: 'Missing bearer token.' })
    return
  }

  // Verify the caller's access token and recover their user id. Only that
  // user's sessions are ever touched (no IDOR — the id is never client-chosen).
  const meRes = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${token}`,
    },
  })
  if (meRes.status !== 200) {
    json(res, 401, { error: 'Invalid or expired token.' })
    return
  }
  const meJson = (await meRes.json()) as { id?: string }
  const userId = meJson.id
  if (!userId) {
    json(res, 401, { error: 'Invalid or expired token.' })
    return
  }

  if (req.method === 'GET') {
    const result = await listSessions(url, serviceRole, userId)
    if (!result.ok) {
      json(res, 500, { error: result.error })
      return
    }
    json(res, 200, { sessions: result.sessions })
    return
  }

  if (req.method === 'DELETE') {
    let sid = ''
    try {
      const body = await readBody(req)
      sid = String(body.sid ?? '')
    } catch {
      json(res, 400, { error: 'Invalid request body.' })
      return
    }
    if (!sid) {
      json(res, 400, { error: 'Missing session id.' })
      return
    }
    const result = await revokeSession(url, serviceRole, userId, sid)
    if (!result.ok) {
      json(res, 500, { error: result.error })
      return
    }
    json(res, 200, { ok: true })
    return
  }

  json(res, 405, { error: 'Method not allowed.' })
}
