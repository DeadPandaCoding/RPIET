/**
 * Vercel serverless function — Devices & Sessions.
 *
 * Lists the signed-in user's active Supabase Auth sessions and revokes
 * individual ones. Talks to GoTrue's ADMIN REST endpoints with the
 * service_role key, which must NEVER be exposed in the frontend bundle — it
 * lives here as a Vercel environment variable, server-side only.
 *
 *   GET    /api/sessions            → { sessions: [...] }
 *   DELETE /api/sessions            → body { sid }  → { ok: true }
 *
 * Auth: the caller sends `Authorization: Bearer <access_token>`. The access
 * token is verified against GoTrue; only THAT user's sessions are ever
 * listed or revoked — never another user's.
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

async function adminJson(
  url: string,
  serviceRole: string,
  path: string,
  init?: { method?: string; body?: string },
) {
  const res = await fetch(`${url}/auth/v1${path}`, {
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
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { status: res.status, data: data as Record<string, unknown> | null }
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
    const r = await adminJson(url, serviceRole, `/admin/users/${userId}/sessions`)
    if (r.status !== 200 || !r.data) {
      const detail = String(r.data?.message ?? r.data?.msg ?? r.data?.error ?? '')
      json(res, 500, { error: detail ? `Failed to list sessions: ${detail}` : 'Failed to list sessions.' })
      return
    }
    const raw = r.data.sessions
    const sessions: SessionInfo[] = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>).map((s) => ({
          id: String(s.id ?? ''),
          createdAt: String(s.created_at ?? ''),
          updatedAt: String(s.updated_at ?? ''),
          userAgent: (s.user_agent as string | null) ?? null,
          ip: (s.ip as string | null) ?? null,
        }))
      : []
    json(res, 200, { sessions })
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
    const r = await adminJson(
      url,
      serviceRole,
      `/admin/users/${userId}/sessions/${encodeURIComponent(sid)}`,
      { method: 'DELETE' },
    )
    if (r.status !== 200 && r.status !== 204) {
      json(res, 500, { error: 'Failed to revoke session.' })
      return
    }
    json(res, 200, { ok: true })
    return
  }

  json(res, 405, { error: 'Method not allowed.' })
}
