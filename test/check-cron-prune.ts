/**
 * Belt-and-braces check that the pg_cron prune job actually FIRES on its
 * schedule — not just that the prune function works (that is already covered
 * by verify-revocation.ts step 0.5). It plants a marker row in
 * public.session_revocations whose created_at is 2 days old — older than the
 * 1-day retention — and later confirms the nightly 03:00 job deleted it.
 *
 * Usage:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx test/check-cron-prune.ts arm      # plant the marker (idempotent)
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx test/check-cron-prune.ts verify   # marker gone? (run after 03:00)
 *
 *   arm    — INSERT/upsert the marker with created_at = now - 2 days.
 *            Re-arming before the next run is safe (upserts on the fixed id).
 *   verify — exit 0 if the marker is gone (the nightly run pruned it),
 *            exit 1 if it is still present (job hasn't run yet or failed).
 *
 * The marker's user_id/session_id are fixed, obviously-fake uuids, so no real
 * account can ever see the row (RLS scopes reads to auth.uid()), and it is
 * harmless: it just sits in the table until the scheduled prune removes it.
 *
 * Workflow: run `arm` now → wait until after the next 03:00 run →
 * run `verify`. See README for the npm script shortcuts.
 */

// ---- Configuration --------------------------------------------------------

const SUPA_URL = process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const MODE = process.argv[2]

const missing = [
  ['VITE_SUPABASE_URL', SUPA_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE],
].filter(([, v]) => !v)

if (missing.length > 0 || (MODE !== 'arm' && MODE !== 'verify')) {
  console.error(
    missing.length > 0
      ? `Missing env var(s): ${missing.map(([k]) => k).join(', ')}`
      : `Unknown mode '${MODE}' — use 'arm' or 'verify'`,
  )
  // Nothing async has started yet, so a hard exit is safe here.
  process.exit(1)
}

// ---- Fixed marker identity -------------------------------------------------
// Memorable, obviously-synthetic uuids so the marker is self-describing in the
// table and can never collide with a real session/user row.
const MARKER_ID = '00000000-0000-4000-8000-c0dec0dec0de'
const MARKER_USER_ID = '00000000-0000-4000-8000-00000000c0de'
const MARKER_SESSION_ID = '00000000-0000-4000-8000-00000000a11c'

/**
 * PostgREST call with the service role key. `Connection: close` makes undici
 * drop each socket when the response lands, so the process exits naturally via
 * process.exitCode instead of crashing on a pending-close handle under
 * process.exit() (a Windows libuv quirk).
 */
async function postgrest(
  path: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      apikey: SERVICE!,
      Authorization: `Bearer ${SERVICE!}`,
      'Content-Type': 'application/json',
      Connection: 'close',
      ...init?.headers,
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
}

async function markerRow() {
  const r = await postgrest(`/session_revocations?select=id,created_at&id=eq.${MARKER_ID}`)
  const rows = Array.isArray(r.data) ? (r.data as Array<{ id: string; created_at?: string }>) : []
  return rows[0] ?? null
}

// ---- arm / verify ----------------------------------------------------------

async function main() {
  if (MODE === 'arm') {
    const res = await postgrest('/session_revocations', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: MARKER_ID,
        user_id: MARKER_USER_ID,
        session_id: MARKER_SESSION_ID,
        // 2 days old → outside the 1-day retention, so the next nightly run
        // must prune it.
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
    if (res.status !== 201 && res.status !== 200) {
      console.error(`✗ FAIL: could not plant marker (HTTP ${res.status})`)
      process.exitCode = 1
      return
    }
    const row = await markerRow()
    if (!row) {
      console.error('✗ FAIL: marker insert reported success but the row is not readable')
      process.exitCode = 1
      return
    }
    // Hours until the next 03:00 UTC run; `|| 24` maps "exactly 03:00" to
    // the next day's run.
    const hoursToNextRun = (3 - new Date().getUTCHours() + 24) % 24 || 24
    console.log(`✓ marker armed: id=${MARKER_ID}`)
    console.log(`  created_at=${row.created_at} (2 days ago — outside the 1-day retention)`)
    console.log(`  the nightly 03:00 UTC run prunes it in ~${hoursToNextRun}h`)
    console.log('  after that, run: npm run check:cron:verify')
  } else {
    const row = await markerRow()
    if (!row) {
      console.log('✓ marker pruned — the 1-day retention prune removed it')
      console.log('  (the nightly 03:00 job, or an inline revoke prune)')
      console.log('  (if you never ran `arm`, this check passed vacuously — arm it first next time)')
      return
    }
    console.error(`✗ FAIL: marker still present (created_at=${row.created_at})`)
    console.error('  the nightly job has not pruned it yet — either 03:00 has not happened,')
    console.error('  or the job failed. Check Database → Cron → prune-session-revocations')
    console.error('  → run details, or press "Run now" and re-verify.')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`✗ FAIL: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
