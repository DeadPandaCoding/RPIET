/**
 * Client-side login rate limiting for Valora.
 *
 * Enforces a simple brute-force deterrent: a maximum of MAX_ATTEMPTS failed
 * sign-in attempts per email within WINDOW_MS (sliding window), after which
 * the account is locked for LOCK_MS. State lives in localStorage keyed by
 * email, so it survives reloads and follows the same browser/device.
 *
 * HONEST LIMITATION: this runs in the browser, so it is a deterrent + UX
 * layer, not a hard server-side guarantee. The real, unbypassable protection
 * is Supabase Auth's own server-side throttling on the login endpoint; this
 * adds the 5-per-15-minute rule and a friendly countdown on top.
 */

export interface LockoutState {
  locked: boolean
  remainingAttempts: number
  retryInMs: number
}

interface StoredRecord {
  f: number[]
  u: number | null
}

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCK_MS = 15 * 60 * 1000
const STORAGE_PREFIX = 'pl.loginAttempts.'

const now = () => Date.now()

function keyFor(email: string): string {
  return STORAGE_PREFIX + email.trim().toLowerCase()
}

function read(email: string): StoredRecord {
  try {
    const raw = window.localStorage.getItem(keyFor(email))
    if (!raw) return { f: [], u: null }
    const parsed = JSON.parse(raw) as StoredRecord
    if (!Array.isArray(parsed.f)) return { f: [], u: null }
    return { f: parsed.f, u: typeof parsed.u === 'number' ? parsed.u : null }
  } catch {
    return { f: [], u: null }
  }
}

function write(email: string, record: StoredRecord): void {
  try {
    window.localStorage.setItem(keyFor(email), JSON.stringify(record))
  } catch {
    // Ignore storage failures.
  }
}

function clear(email: string): void {
  try {
    window.localStorage.removeItem(keyFor(email))
  } catch {
    // Ignore.
  }
}

/** Prunes attempts outside the sliding window and drops expired locks. */
function prune(record: StoredRecord): StoredRecord {
  const cutoff = now() - WINDOW_MS
  const failures = record.f.filter((t) => t >= cutoff)
  const u = record.u !== null && record.u > now() ? record.u : null
  // Once the lock has expired and the window is clean, start fresh.
  if (record.u !== null && u === null && failures.length === 0) return { f: [], u: null }
  return { f: failures, u }
}

/** Current lockout state for an email (no side effects). */
export function getLockoutState(email: string): LockoutState {
  const record = prune(read(email))
  if (record.u !== null) {
    return { locked: true, remainingAttempts: 0, retryInMs: record.u - now() }
  }
  return {
    locked: false,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - record.f.length),
    retryInMs: 0,
  }
}

/**
 * Records a failed attempt. Returns the resulting state so the caller can
 * react immediately (e.g. show the lockout banner on the 5th failure).
 */
export function recordFailure(email: string): LockoutState {
  const record = prune(read(email))
  if (record.u !== null) {
    return { locked: true, remainingAttempts: 0, retryInMs: record.u - now() }
  }
  const failures = [...record.f, now()]
  if (failures.length >= MAX_ATTEMPTS) {
    const lockedUntil = now() + LOCK_MS
    // Reset the attempt list so the count starts fresh once the lock lifts.
    write(email, { f: [], u: lockedUntil })
    return { locked: true, remainingAttempts: 0, retryInMs: LOCK_MS }
  }
  write(email, { f: failures, u: null })
  return { locked: false, remainingAttempts: MAX_ATTEMPTS - failures.length, retryInMs: 0 }
}

/** Clears all tracking for an email — call on a successful sign-in. */
export function recordSuccess(email: string): void {
  clear(email)
}
