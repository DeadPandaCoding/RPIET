/**
 * Browser-level verification of the "revoke a device" flow (Settings →
 * Devices & Sessions → Revoke), using two real tabs in one browser profile.
 *
 * Why a real browser: this is the only way to exercise the full user path —
 * sign in, open Settings, click Revoke, confirm — AND to catch regressions in
 * the same-profile sign-out behavior. supabase-js broadcasts SIGNED_OUT to
 * every tab of the same browser profile over BroadcastChannel, so a revoked
 * tab's sign-out used to also sign out the tab that performed the revoke.
 * The app now clears only the revoked tab's own tokens and reloads (no
 * auth-js signOut, no broadcast); this check enforces that in BOTH paths:
 *
 *   Phase 1 — Realtime path (the fast path):
 *   1. Tab 2 (the revoked device) lands on the sign-in screen quickly
 *      (Realtime → local reset, ~1s — NOT the old minutes-long polling).
 *   2. Tab 1 (the device that clicked Revoke) STAYS signed in.
 *   3. Server-side, exactly one session remains (Tab 1's).
 *
 *   Phase 2 — Health-check fallback (Realtime unavailable): WebSocket is
 *   stubbed out in Tab 2 so the Realtime subscription can never deliver. The
 *   app's session health check (DataContext, ~60s heartbeat) is the only
 *   remaining sign-out path. It must:
 *   4. Sign Tab 2 out anyway (within the fallback window), and
 *   5. Still leave Tab 1 signed in — proving the fallback also never
 *      broadcasts SIGNED_OUT to other tabs of the profile.
 *
 * Prerequisites:
 *   - puppeteer-core (devDependency) and a Chrome/Chromium install
 *     (set CHROME_PATH if it is not auto-detected)
 *   - the app running in Supabase mode. Default APP_URL is the local Vite dev
 *     server (npm run dev with VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY set;
 *     vite.config.ts proxies /api to the deployed serverless function so the
 *     Devices & Sessions list works locally). Point APP_URL at any deployed
 *     instance to verify that instead.
 *   - a Supabase test account (email/password sign-in enabled)
 *
 * Run with:
 *   VITE_SUPABASE_URL=https://<ref>.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=<anon-key> \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   TEST_USER_EMAIL=you@example.com \
 *   TEST_USER_PASSWORD=<password> \
 *   npm run test:revoke-browser
 *
 * Exit code 0 = every check passed and the account was restored to zero
 * sessions; 1 = something failed. Use a dedicated test account — the script
 * signs in twice (four times total with phase 2) and forcibly clears every
 * session it creates.
 */
import { existsSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'

// ---- Configuration --------------------------------------------------------

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'
const EMAIL = process.env.TEST_USER_EMAIL
const PASSWORD = process.env.TEST_USER_PASSWORD
const SUPA_URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

// Realtime delivers the revocation in ~0.7-1.3s (the reload adds a bit);
// anything under this is "instant" compared with the old polling fallback.
const SIGN_OUT_THRESHOLD_MS = 4000

// Phase 2: with Realtime blocked, the revoked tab signs out on the health
// check's 60s heartbeat (plus browser background-tab timer throttling and the
// page reload), so allow a generous window. Overridable for slow machines.
const FALLBACK_TIMEOUT_MS = Number(process.env.FALLBACK_TIMEOUT_MS ?? 150_000)

const missing = [
  ['TEST_USER_EMAIL', EMAIL],
  ['TEST_USER_PASSWORD', PASSWORD],
  ['VITE_SUPABASE_URL', SUPA_URL],
  ['VITE_SUPABASE_ANON_KEY', ANON],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE],
].filter(([, v]) => !v)
if (missing.length > 0) {
  console.error(`Missing env var(s): ${missing.map(([k]) => k).join(', ')}`)
  console.error('See the header of this file for the full run command.')
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

// ---- Helpers --------------------------------------------------------------

function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error('Chrome not found — install Chrome/Chromium or set CHROME_PATH')
}

/** PostgREST call with the service role key (server-side bookkeeping only). */
async function postgrest(path: string, init?: { method?: string; body?: string }) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      apikey: SERVICE!,
      Authorization: `Bearer ${SERVICE!}`,
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
}

async function countSessions(userId: string): Promise<number | null> {
  let r = await postgrest(`/owner_sessions?select=id&user_id=eq.${userId}`)
  // Mirror the API's fallback for projects that never exposed the view.
  if (r.status === 404 || r.status === 403) {
    r = await postgrest(`/sessions?select=id&user_id=eq.${userId}`)
  }
  if (r.status !== 200 || !Array.isArray(r.data)) return null
  return (r.data as Array<Record<string, unknown>>).length
}

/**
 * Zeroes every session for the test account (also self-heals when a previous
 * interrupted run left sessions behind), and returns the user id.
 */
async function zeroAccount(): Promise<string | null> {
  const client: SupabaseClient = createClient(SUPA_URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email: EMAIL!, password: PASSWORD! })
  if (error || !data.session) {
    throw new Error(`could not sign in to zero the account: ${error?.message ?? 'no session'}. ${PASSWORD_HINT}`)
  }
  const uid = data.session.user.id
  await client.auth.signOut({ scope: 'global' })
  return uid
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const PASSWORD_HINT =
  'The test account password may have been left changed by a failed ' +
  'test:revocation run (it changes the password mid-run). Re-run that check once to ' +
  'restore it, or reset the password in the Supabase dashboard.'

/**
 * Signs in on a page. "Remember me" stays UNCHECKED: the app's auth storage
 * then keeps the session in that tab's sessionStorage, so the two tabs hold
 * genuinely independent sessions (the multi-tab BroadcastChannel is the thing
 * under test — not shared localStorage).
 */
async function signIn(page: Page, label: string) {
  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 60_000 })
  await page.waitForSelector('#auth-email', { timeout: 30_000 })
  await page.type('#auth-email', EMAIL!, { delay: 12 })
  await page.type('#auth-password', PASSWORD!, { delay: 12 })
  const remembered = await page.$eval('input[name="remember"]', (el) => (el as HTMLInputElement).checked)
  if (remembered) {
    await page.click('input[name="remember"]')
  }
  await page.click('button[type="submit"]')
  // NOTE: interval polling (not the rAF default) — rAF is throttled in
  // background tabs, and Tab 1 is in the background once Tab 2 opens.
  try {
    await page.waitForFunction(
      () => document.querySelector('header h1')?.textContent?.includes('Dashboard'),
      { polling: 100, timeout: 30_000 },
    )
  } catch {
    // Fail loudly and helpfully instead of a generic timeout: the sign-in form
    // shows the server's error (e.g. a stale password from a failed
    // test:revocation run shares this same test account).
    const formError = await page
      .evaluate(() => document.querySelector('form')?.innerText.slice(0, 200) ?? '')
      .catch(() => '')
    throw new Error(
      `${label} did not reach the dashboard after signing in. Form shows: "${formError.replace(/\s+/g, ' ').trim()}". ${PASSWORD_HINT}`,
    )
  }
  console.log(`  ✓ ${label} signed in (dashboard loaded)`)
}

/** Decodes this page's own session id from the supabase token in its storage. */
function decodeSid(page: Page) {
  return page.evaluate(() => {
    for (const v of Object.values(sessionStorage) as string[]) {
      try {
        const blob = JSON.parse(v) as { access_token?: string }
        if (blob.access_token) {
          const payload = JSON.parse(atob(blob.access_token.split('.')[1])) as { session_id?: string }
          return payload.session_id ?? '(none)'
        }
      } catch {
        /* keep looking */
      }
    }
    return '(no token found)'
  })
}

/** Navigates the sidebar Settings button and waits for the page. */
async function openSettings(page: Page) {
  await page.evaluate(() => {
    const settingsBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Settings',
    )
    ;(settingsBtn as HTMLButtonElement | undefined)?.click()
  })
  await page.waitForFunction(
    () => document.querySelector('header h1')?.textContent?.includes('Settings'),
    { polling: 100, timeout: 15_000 },
  )
}

/**
 * Returns the state of the "Active sessions" list rows. Scoped to that card:
 * finds the <ul> by walking UP from the heading (the list sits below the card
 * header), so unrelated lists elsewhere on the page can never be mistaken for
 * the session list. (Inlined in each evaluate — puppeteer can't serialize
 * function args.)
 */
function sessionRows(page: Page) {
  return page.evaluate(() => {
    const h4 = Array.from(document.querySelectorAll('h4')).find((h) =>
      (h.textContent ?? '').includes('Active sessions'),
    )
    let node = h4?.parentElement ?? null
    let ul: Element | null = null
    while (node) {
      const found = node.querySelector('ul')
      if (found) {
        ul = found
        break
      }
      node = node.parentElement
    }
    const lis = Array.from(ul?.querySelectorAll('li') ?? [])
    return lis.map((li) => ({
      hasRevoke: Array.from(li.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Revoke'),
      isThisDevice: (li.textContent ?? '').includes('This device'),
    }))
  })
}

/**
 * Clicks Revoke on the first non-current device and confirms the dialog.
 * Assumes the Settings page is open. Returns the timestamp taken right before
 * clicking "Sign out device".
 */
async function revokeOtherDevice(page: Page): Promise<number> {
  await waitForSessionList(page)
  await page.evaluate(() => {
    const h4 = Array.from(document.querySelectorAll('h4')).find((h) =>
      (h.textContent ?? '').includes('Active sessions'),
    )
    let node = h4?.parentElement ?? null
    let ul: Element | null = null
    while (node) {
      const found = node.querySelector('ul')
      if (found) {
        ul = found
        break
      }
      node = node.parentElement
    }
    const lis = Array.from(ul?.querySelectorAll('li') ?? [])
    const target = lis.find(
      (li) =>
        !(li.textContent ?? '').includes('This device') &&
        Array.from(li.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Revoke'),
    )
    const revokeBtn = Array.from(target?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Revoke',
    )
    ;(revokeBtn as HTMLButtonElement | undefined)?.click()
  })
  // Confirmation dialog: "Sign out this device?" → confirm "Sign out device".
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).some(
        (b) => b.textContent?.trim() === 'Sign out device',
      ),
    { polling: 100, timeout: 10_000 },
  )
  const t0 = Date.now()
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Sign out device',
    )
    ;(btn as HTMLButtonElement | undefined)?.click()
  })
  return t0
}

/**
 * Replaces window.WebSocket in a page with a stub that never connects, so the
 * Realtime subscription can never deliver a revocation — forcing the app's
 * session health-check fallback to do the work. A structurally valid stub
 * keeps realtime-js quiet (it retries silently instead of crashing the app).
 *
 * NOTE: the TS casts inside are stripped by tsx when the function is
 * serialized for the page (Function.prototype.toString), so the browser only
 * ever sees plain JS here.
 */
const blockRealtime = () => {
  // Marker so the test can verify the stub is actually in effect.
  ;(window as unknown as { __wsBlocked: boolean }).__wsBlocked = true
  class BlockedWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    readyState = 0
    binaryType = 'blob'
    onopen: unknown = null
    onmessage: unknown = null
    onerror: unknown = null
    onclose: unknown = null
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  window.WebSocket = BlockedWebSocket as unknown as typeof WebSocket
}

/** Real-time plumbing noise we expect once WebSocket is blocked (phase 2). */
const isRealtimeNoise = (text: string) => /realtime|websocket|channel|subscribe/i.test(text)

/** Waits until the session list has rendered (a "Revoke" button exists). */
async function waitForSessionList(page: Page) {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Revoke'),
    { polling: 100, timeout: 20_000 },
  )
}

/** Waits until the page shows the sign-in form (or the timeout elapses). */
async function waitSignedOut(page: Page, deadline: number): Promise<number | null> {
  while (Date.now() < deadline) {
    const signedOut = await page.evaluate(() => !!document.querySelector('#auth-email')).catch(() => false)
    if (signedOut) return Date.now()
    await sleep(500)
  }
  return null
}

// ---- Main flow ------------------------------------------------------------

let userId: string | null = null

async function main() {
  let browser: Browser | null = null
  let tab1: Page | null = null
  let tab2: Page | null = null
  try {
    // --- 0. Self-heal: start from zero sessions -----------------------------
    userId = await zeroAccount()
    console.log(`Preflight: account zeroed (user ${userId?.slice(0, 8)}…)`)

    browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1440, height: 900 },
    })

    console.log('\n=== Phase 1: Realtime path ===')
    console.log('=== Tab 1 (Device A — will do the revoking) ===')
    tab1 = await browser.newPage()
    tab1.on('console', (m) => {
      if (m.type() === 'error' && !isRealtimeNoise(m.text())) {
        console.log(`  [tab1 console.error] ${m.text().slice(0, 200)}`)
      }
    })
    await signIn(tab1, 'Tab 1')

    console.log('\n=== Tab 2 (Device B — the revoke target) ===')
    tab2 = await browser.newPage()
    tab2.on('console', (m) => {
      if (m.type() === 'error' && !isRealtimeNoise(m.text())) {
        console.log(`  [tab2 console.error] ${m.text().slice(0, 200)}`)
      }
    })
    await signIn(tab2, 'Tab 2')

    const sid1 = await decodeSid(tab1)
    const sid2 = await decodeSid(tab2)
    console.log(`\nTab 1 local session id: ${sid1}`)
    console.log(`Tab 2 local session id: ${sid2}`)
    check(sid1 !== sid2 && !sid1.startsWith('(') && !sid2.startsWith('('), 'tabs hold independent sessions')

    console.log('\n=== Tab 1 opens Settings → Devices & Sessions ===')
    await openSettings(tab1)
    console.log('  ✓ Settings page loaded')

    await waitForSessionList(tab1)
    const listState = await sessionRows(tab1)
    check(listState.length === 2, 'Tab 1 sees exactly 2 active sessions (both tabs)')
    check(listState.some((r) => r.hasRevoke && !r.isThisDevice), 'the other device (Tab 2) has a Revoke button')

    console.log('\n=== Tab 1 revokes Tab 2 through the real UI ===')
    const t0 = await revokeOtherDevice(tab1)
    console.log(`  ✓ clicked "Sign out device" at t=${t0}`)

    // --- Phase 1 assertions -------------------------------------------------
    console.log('\nAssertions (phase 1 — Realtime):')
    const t1 = await waitSignedOut(tab2, t0 + SIGN_OUT_THRESHOLD_MS + 5000)
    const latency = t1 ? t1 - t0 : null
    check(
      t1 !== null,
      latency !== null
        ? `Tab 2 was signed out ${latency}ms after confirming the revoke`
        : `Tab 2 was NOT signed out within ${SIGN_OUT_THRESHOLD_MS + 5000}ms`,
    )
    if (latency !== null) {
      check(
        latency <= SIGN_OUT_THRESHOLD_MS,
        `sign-out arrived under ${SIGN_OUT_THRESHOLD_MS}ms (${latency}ms — Realtime, not polling)`,
      )
    }

    // The fix under test: Tab 1 (the revoker) must STAY signed in.
    let tab1Alive = false
    let tab1Dump = ''
    try {
      await tab1.waitForFunction(
        () => (document.querySelector('header h1')?.textContent ?? '').includes('Settings'),
        { polling: 100, timeout: 8000 },
      )
      tab1Alive = true
    } catch {
      tab1Dump = await tab1
        .evaluate(() => {
          const url = location.href
          const signedOut = !!document.querySelector('#auth-email')
          return `url=${url} signInScreen=${signedOut} body="${document.body.innerText.slice(0, 120).replace(/\s+/g, ' ')}"`
        })
        .catch(() => '(evaluate failed)')
    }
    check(
      tab1Alive,
      tab1Alive
        ? 'Tab 1 STAYED signed in on the Settings page (revoker unaffected)'
        : `Tab 1 was signed out too — ${tab1Dump}`,
    )

    // Server-side: exactly 1 session should remain (Tab 1's).
    if (userId) {
      const remaining = await countSessions(userId)
      check(remaining === 1, `server-side: exactly 1 session remains after the revoke (${remaining})`)
    }

    // --- Phase 2: health-check fallback (Realtime blocked) ------------------
    console.log('\n=== Phase 2: Realtime blocked — the health-check fallback must sign Tab 2 out ===')
    // Stub out WebSocket in Tab 2 so its Realtime subscription can never
    // connect or deliver a revocation. The session health check (DataContext,
    // ~60s heartbeat) is the only remaining sign-out path — and it must also
    // leave Tab 1 signed in.
    //
    // First leave the app entirely (about:blank): the stub applies to FUTURE
    // navigations, and Tab 2 is currently already on APP_URL — a same-URL
    // `goto` is not guaranteed to produce a fresh document, so without this
    // the app would keep its original (unblocked) WebSocket and the phase
    // would silently test the Realtime path again.
    await tab2.goto('about:blank')
    await tab2.evaluateOnNewDocument(blockRealtime)
    await signIn(tab2, 'Tab 2 (fallback)')

    const wsBlocked = await tab2
      .evaluate(() => (window as unknown as { __wsBlocked?: boolean }).__wsBlocked === true)
      .catch(() => false)
    check(wsBlocked, 'Tab 2 has the WebSocket stub installed (Realtime cannot connect)')

    const sid2b = await decodeSid(tab2)
    check(sid2b !== sid1 && !sid2b.startsWith('('), 'Tab 2 holds a fresh independent session (Realtime blocked)')

    // Tab 1 is still signed in on Settings from phase 1 (that's the point of
    // the fix). Reload it so the session list reflects Tab 2's new session.
    await tab1.reload({ waitUntil: 'networkidle2', timeout: 60_000 })
    await openSettings(tab1)
    await waitForSessionList(tab1)
    const listState2 = await sessionRows(tab1)
    check(listState2.length === 2, 'Tab 1 sees exactly 2 active sessions again')

    console.log('\n=== Tab 1 revokes Tab 2 again (Realtime blocked) ===')
    const t0f = await revokeOtherDevice(tab1)
    console.log(`  ✓ clicked "Sign out device" (fallback phase) at t=${t0f}`)

    // --- Phase 2 assertions -------------------------------------------------
    console.log('\nAssertions (phase 2 — no Realtime):')
    const t1f = await waitSignedOut(tab2, t0f + FALLBACK_TIMEOUT_MS)
    const fLatency = t1f ? t1f - t0f : null
    check(
      t1f !== null,
      fLatency !== null
        ? `Tab 2 (fallback) signed out ${fLatency}ms after the revoke — no Realtime`
        : `Tab 2 was NOT signed out within ${FALLBACK_TIMEOUT_MS}ms with Realtime blocked`,
    )

    let tab1Alive2 = false
    let tab1Dump2 = ''
    try {
      await tab1.waitForFunction(
        () => (document.querySelector('header h1')?.textContent ?? '').includes('Settings'),
        { polling: 100, timeout: 8000 },
      )
      tab1Alive2 = true
    } catch {
      tab1Dump2 = await tab1
        .evaluate(() => {
          const url = location.href
          const signedOut = !!document.querySelector('#auth-email')
          return `url=${url} signInScreen=${signedOut} body="${document.body.innerText.slice(0, 120).replace(/\s+/g, ' ')}"`
        })
        .catch(() => '(evaluate failed)')
    }
    check(
      tab1Alive2,
      tab1Alive2
        ? 'Tab 1 STAYED signed in through the fallback sign-out too'
        : `Tab 1 was signed out too (fallback path) — ${tab1Dump2}`,
    )

    if (userId) {
      const remaining2 = await countSessions(userId)
      check(remaining2 === 1, `server-side: exactly 1 session remains after the fallback revoke (${remaining2})`)
    }
  } catch (err) {
    failures++
    console.error(`\n✗ FAIL: ${err instanceof Error ? err.message : String(err)}`)
    // Screenshots on failure make a red run diagnosable at a glance.
    if (tab2) await tab2.screenshot({ path: 'test/revoke-fail-tab2.png' }).catch(() => {})
    if (tab1) await tab1.screenshot({ path: 'test/revoke-fail-tab1.png' }).catch(() => {})
  } finally {
    if (browser) await browser.close().catch(() => {})

    // --- Cleanup: zero the account regardless of how the run went ----------
    console.log('\nCleanup:')
    const uid = await zeroAccount().catch(() => null)
    await sleep(600)
    const finalCount = uid ? await countSessions(uid) : null
    check(finalCount === 0, `account back to zero sessions (${finalCount})`)
  }
}

// --- Result ----------------------------------------------------------------
main().then(
  () => {
    if (failures === 0) {
      console.log('\nTwo-tab revoke verification PASSED ✅')
    } else {
      console.error(`\n${failures} check(s) FAILED ❌`)
      process.exit(1)
    }
  },
  (err) => {
    console.error('\n✗ FATAL:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  },
)
