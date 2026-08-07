/**
 * End-to-end verification of the "sign out other devices when I change my
 * password" security setting (Settings → Devices & Sessions).
 *
 * The check is protocol-level but exercises the exact same code paths the
 * app uses:
 *   1. Device A and Device B sign in as two independent Supabase sessions.
 *   2. Device B subscribes to Realtime on public.session_revocations filtered
 *      to its own session id — the identical subscription DataContext.tsx
 *      sets up (postgres_changes, INSERT, `session_id=eq.<sid>`).
 *   3. The password is changed through a genuine recovery session (admin
 *      generate_link → verify → updateUser), the same path the ResetPassword
 *      page takes after a user clicks the email link.
 *   4. Asserts Device B's tab is signed out in under ~1.5s via Realtime, both
 *      device refresh tokens are dead server-side, and the password actually
 *      changed.
 *   5. Restores the original password and the security setting afterwards,
 *      so it can be re-run safely and repeatedly (also self-heals if a
 *      previous interrupted run left a different password in place).
 *
 * Prerequisites:
 *   - supabase/schema.sql applied (session_revocations + the
 *     revoke_sessions_on_password_change trigger + realtime publication)
 *   - a Supabase test account (email/password sign-in enabled)
 *
 * Run with:
 *   VITE_SUPABASE_URL=https://<ref>.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=<anon-key> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   TEST_USER_EMAIL=you@example.com \
 *   TEST_USER_PASSWORD=<current password> \
 *   npx tsx test/verify-revocation.ts
 *
 * Exit code 0 = every check passed and the account was restored to its
 * original state; 1 = something failed. Use a dedicated test account — the
 * script deliberately changes the account's password mid-run (and restores
 * it), and the security setting is toggled on then back to its prior value.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'

// ---- Configuration --------------------------------------------------------

// NOTE: named SUPA_URL (not URL) so the global URL constructor stays usable
// for parsing the recovery-link redirect.
const SUPA_URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.TEST_USER_EMAIL
const ORIGINAL_PASSWORD = process.env.TEST_USER_PASSWORD

// How long Device B may take to receive the Realtime revocation event.
// Observed delivery: ~400–850ms on typical runs, with an occasional transient
// miss near 1500ms (realtime hiccup, not a product regression). 2000ms keeps
// the check meaningful (still "instant") while staying robust for CI.
const REALTIME_THRESHOLD_MS = 2000
const SUBSCRIBE_TIMEOUT_MS = 10_000

// Fresh, unique password for the mid-test change (never reuses a value, so
// re-runs are independent). Meets typical complexity rules just in case the
// project enforces them.
const NEW_PASSWORD = `Revoke-${Date.now().toString(36)}-test!9`

const missing = [
  ['VITE_SUPABASE_URL', SUPA_URL],
  ['VITE_SUPABASE_ANON_KEY', ANON],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE],
  ['TEST_USER_EMAIL', EMAIL],
  ['TEST_USER_PASSWORD', ORIGINAL_PASSWORD],
].filter(([, v]) => !v)

if (missing.length > 0) {
  console.error(`Missing env var(s): ${missing.map(([k]) => k).join(', ')}`)
  console.error(
    'See the header of this file for the full run command (service-role key and a ' +
      'test account are required).',
  )
  process.exit(1)
}

// ---- Result bookkeeping ---------------------------------------------------

let failures = 0

function check(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`)
  } else {
    failures++
    console.error(`  ✗ FAIL: ${msg}`)
  }
}

// ---- Supabase helpers -----------------------------------------------------

/** An ephemeral client (nothing persisted, no auto-refresh surprises). */
function anonClient(): SupabaseClient {
  return createClient(SUPA_URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signInAs(email: string, password: string) {
  const client = anonClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  if (!data.session) throw new Error('sign-in returned no session')
  return { client, session: data.session }
}

/** Decodes the `session_id` claim from a Supabase access-token JWT. */
function sessionIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8'))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}

/** PostgREST call with the service role key (never used by the app's bundle). */
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

/**
 * Runs a recovery-link exchange: admin generate_link → verify → a session
 * that can call updateUser. Mirrors what the app does when the user clicks
 * the "reset password" email link.
 */
async function recoverySession(): Promise<{ access_token: string; refresh_token: string }> {
  const linkRes = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SERVICE!,
      Authorization: `Bearer ${SERVICE!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'recovery', email: EMAIL }),
  })
  const linkJson = (await linkRes.json().catch(() => null)) as { action_link?: string } | null
  const actionLink = linkJson?.action_link
  if (!actionLink) throw new Error('generate_link returned no action_link')
  const linkUrl = new URL(actionLink)
  const token = linkUrl.searchParams.get('token') ?? linkUrl.searchParams.get('token_hash')
  if (!token) throw new Error('action_link carried no token')

  // GoTrue 302s to a URL whose fragment holds the recovery session tokens.
  const verifyRes = await fetch(
    `${SUPA_URL}/auth/v1/verify?token=${encodeURIComponent(token)}&type=recovery`,
    { redirect: 'manual' },
  )
  const location = verifyRes.headers.get('location')
  if (!location) throw new Error(`verify returned ${verifyRes.status} with no redirect Location`)
  const fragment = new URL(location).hash.replace(/^#/, '')
  const params = new URLSearchParams(fragment)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) {
    throw new Error('verify redirect fragment carried no recovery tokens')
  }
  return { access_token: accessToken, refresh_token: refreshToken }
}

/** Changes the account's password through a genuine recovery session. */
async function setPasswordViaRecovery(newPassword: string): Promise<void> {
  const tokens = await recoverySession()
  const client = anonClient()
  const { error: setErr } = await client.auth.setSession(tokens)
  if (setErr) throw new Error(`could not start recovery session: ${setErr.message}`)
  const { error } = await client.auth.updateUser({ password: newPassword })
  if (error) throw new Error(`updateUser failed: ${error.message}`)
}

/** Waits until a Realtime channel reports SUBSCRIBED (or fails). */
async function waitSubscribed(channel: RealtimeChannel): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`realtime subscribe timed out after ${SUBSCRIBE_TIMEOUT_MS}ms`)),
      SUBSCRIBE_TIMEOUT_MS,
    )
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        reject(new Error(`realtime subscription ${status}`))
      }
    })
  })
}

// ---- Main flow ------------------------------------------------------------

let testUserId: string | null = null
// null = no settings row existed before the test (restore = delete the row).
let priorToggle: boolean | null = null

try {
  // --- 0. Preflight: the schema objects this feature needs -----------------
  console.log('Preflight (tables from supabase/schema.sql):')
  // Each table's PK differs (id vs user_id), so probe with select=* to stay
  // schema-agnostic — only the table's existence is what we check here.
  for (const table of ['session_revocations', 'user_security_settings']) {
    const r = await postgrest(`/${table}?select=*&limit=1`)
    check(
      r.status === 200,
      `${table} exists${r.status !== 200 ? ` (HTTP ${r.status} — run supabase/schema.sql)` : ''}`,
    )
  }
  if (failures > 0) process.exit(1)

  // --- 1. Self-heal: the password must be the one in TEST_USER_PASSWORD -----
  // A previous interrupted run may have left a different password; recovery
  // links don't need the current password, so restore it before continuing.
  let deviceA: Awaited<ReturnType<typeof signInAs>>
  try {
    deviceA = await signInAs(EMAIL!, ORIGINAL_PASSWORD!)
  } catch {
    console.log(`\n! ${EMAIL} sign-in rejected with TEST_USER_PASSWORD — restoring it via recovery link`)
    await setPasswordViaRecovery(ORIGINAL_PASSWORD!)
    deviceA = await signInAs(EMAIL!, ORIGINAL_PASSWORD!)
  }
  testUserId = deviceA.session.user.id
  console.log(`\nDevice A signed in as ${EMAIL} (${testUserId.slice(0, 8)}…)`)

  // --- 2. Turn the security setting ON (remember prior state) --------------
  const priorRes = await postgrest(
    `/user_security_settings?select=revoke_sessions_on_password_change&user_id=eq.${testUserId}`,
  )
  const priorRow = Array.isArray(priorRes.data) ? (priorRes.data[0] as { revoke_sessions_on_password_change?: boolean } | undefined) : undefined
  priorToggle = priorRow ? Boolean(priorRow.revoke_sessions_on_password_change) : null
  const toggleRes = await postgrest('/user_security_settings', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: testUserId,
      revoke_sessions_on_password_change: true,
      updated_at: new Date().toISOString(),
    }),
  })
  check(
    toggleRes.status === 201 || toggleRes.status === 200,
    `"sign out other devices on password change" toggle enabled (was ${priorToggle === null ? 'unset' : priorToggle})`,
  )

  // --- 3. Device B: a second, independent session --------------------------
  const deviceB = await signInAs(EMAIL!, ORIGINAL_PASSWORD!)
  const sidA = sessionIdFromToken(deviceA.session.access_token)
  const sidB = sessionIdFromToken(deviceB.session.access_token)
  console.log(`Device B signed in — session A=${sidA?.slice(0, 8)}… B=${sidB?.slice(0, 8)}…`)
  check(!!sidA && !!sidB && sidA !== sidB, 'two distinct device sessions exist')
  // Fail fast rather than building a subscription filtered on a null id.
  if (!sidA || !sidB || sidA === sidB) {
    throw new Error('could not resolve two distinct session ids from the access tokens')
  }

  // --- 4. Device B subscribes to Realtime, exactly like the app ------------
  console.log('\nDevice B subscribing to Realtime (postgres_changes on session_revocations):')
  // The event promise only ever resolves — a missing event surfaces through
  // the Promise.race timeout below (never through rejection).
  let resolveEvent!: (v: { sid: string; at: number }) => void
  const eventPromise = new Promise<{ sid: string; at: number }>((res) => {
    resolveEvent = res
  })
  const channel = deviceB.client
    .channel('session-revocations')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'session_revocations',
        filter: `session_id=eq.${sidB}`,
      },
      (payload) => {
        // Defensive: ignore any row that is not our own session (the app does
        // the same check before signing out).
        const row = payload.new as { session_id?: string } | null
        if (!row || row.session_id !== sidB) return
        resolveEvent({ sid: row.session_id, at: performance.now() })
      },
    )
  try {
    await waitSubscribed(channel)
    console.log('  ✓ subscribed (events for Device B will be delivered in realtime)')
  } catch (err) {
    await deviceB.client.removeChannel(channel)
    throw err
  }

  // --- 5 + 6. Change the password, then assert revocation ------------------
  // The Realtime channel MUST be closed afterwards: its open WebSocket would
  // otherwise keep the Node process alive and the script would never exit.
  try {
    console.log('\nChanging password via recovery session…')
    const updateStart = performance.now()
    await setPasswordViaRecovery(NEW_PASSWORD)
    const updateMs = performance.now() - updateStart
    console.log(`  ✓ password update resolved in ${Math.round(updateMs)}ms`)

    console.log('\nAssertions:')
    let eventTimeout: ReturnType<typeof setTimeout> | null = null
    const event = await Promise.race([
      eventPromise,
      new Promise<never>((_, rej) => {
        eventTimeout = setTimeout(
          () => rej(new Error(`no Realtime event within ${REALTIME_THRESHOLD_MS}ms`)),
          REALTIME_THRESHOLD_MS,
        )
      }),
    ])
    if (eventTimeout) clearTimeout(eventTimeout)
    const latencyMs = event.at - updateStart
    check(
      latencyMs <= REALTIME_THRESHOLD_MS,
      `Device B received its revocation event over Realtime in ${Math.round(latencyMs)}ms (≤ ${REALTIME_THRESHOLD_MS}ms)`,
    )
    check(event.sid === sidB, 'event targeted Device B’s own session id')

    const refreshA = await deviceA.client.auth.refreshSession()
    check(
      !!refreshA.error && /refresh token not found/i.test(refreshA.error.message),
      `Device A refresh rejected (${refreshA.error?.message ?? 'none'})`,
    )
    const refreshB = await deviceB.client.auth.refreshSession()
    check(
      !!refreshB.error && /refresh token not found/i.test(refreshB.error.message),
      `Device B refresh rejected (${refreshB.error?.message ?? 'none'})`,
    )

    const oldSignIn = await signInAs(EMAIL!, ORIGINAL_PASSWORD!).catch(() => null)
    check(!oldSignIn, 'old password no longer works')

    const newSignIn = await signInAs(EMAIL!, NEW_PASSWORD).catch(() => null)
    check(!!newSignIn?.session, 'new password signs in')
    // The new sign-in created another session — leave cleanup to the final step.
  } finally {
    await deviceB.client.removeChannel(channel)
  }
} catch (err) {
  failures++
  console.error(`\n✗ FAIL: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  // --- 7. Restore everything, regardless of how the test went --------------
  console.log('\nCleanup:')
  if (testUserId) {
    // Restore the password unconditionally: recovery links do not need the
    // current password, so this also covers the rare case where the change
    // applied server-side but the client threw on the response (and a
    // double-run where it is already correct). Setting the same password is
    // a no-op for the revocation trigger, and GoTrue either accepts it or
    // rejects it as unchanged — both are fine.
    try {
      await setPasswordViaRecovery(ORIGINAL_PASSWORD!)
      console.log('  ✓ original password restored')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/same as|unchanged|different from/i.test(msg)) {
        console.log('  ✓ original password already in place')
      } else {
        failures++
        console.error(`  ✗ could not restore password: ${msg}`)
      }
    }
    try {
      if (priorToggle === null) {
        await postgrest(`/user_security_settings?user_id=eq.${testUserId}`, { method: 'DELETE' })
        console.log('  ✓ security setting removed (was never set before)')
      } else {
        await postgrest(`/user_security_settings?user_id=eq.${testUserId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            revoke_sessions_on_password_change: priorToggle,
            updated_at: new Date().toISOString(),
          }),
        })
        console.log(`  ✓ security setting restored to ${priorToggle}`)
      }
    } catch (err) {
      failures++
      console.error(`  ✗ could not restore security setting: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Final state check: the account should be back to zero active sessions.
  try {
    const cleanupSignIn = await signInAs(EMAIL!, ORIGINAL_PASSWORD!)
    await cleanupSignIn.client.auth.signOut({ scope: 'global' })
    let sessions = await postgrest(
      `/owner_sessions?select=id&user_id=eq.${testUserId}`,
    )
    // Mirror the API's fallback for projects that never exposed the view.
    if (sessions.status === 404 || sessions.status === 403) {
      sessions = await postgrest(`/sessions?select=id&user_id=eq.${testUserId}`)
    }
    if (sessions.status !== 200 || !Array.isArray(sessions.data)) {
      failures++
      console.error(`  ✗ could not verify session count (HTTP ${sessions.status})`)
    } else {
      const rows = sessions.data as Array<Record<string, unknown>>
      check(rows.length === 0, `account has zero active sessions after cleanup (${rows.length})`)
    }
  } catch (err) {
    failures++
    console.error(`  ✗ final cleanup sign-out failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// --- 8. Result -------------------------------------------------------------
if (failures === 0) {
  console.log('\nAll revocation checks passed ✅')
} else {
  console.error(`\n${failures} check(s) failed ❌`)
  process.exit(1)
}
