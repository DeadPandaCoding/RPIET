/**
 * Device-local, non-sensitive preference storage.
 * (Sensitive auth state lives in the gated Supabase storage adapter instead.)
 */

const AUTO_LOCK_KEY = 'pl.autoLockMinutes'

export const AUTO_LOCK_OPTIONS = [
  { value: 0, label: 'Never' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
] as const

const DEFAULT_AUTO_LOCK = 15

/** Minutes of inactivity before auto sign-out. 0 = disabled. */
export function getAutoLockMinutes(): number {
  try {
    const raw = window.localStorage.getItem(AUTO_LOCK_KEY)
    if (!raw) return DEFAULT_AUTO_LOCK
    const n = Number(raw)
    return AUTO_LOCK_OPTIONS.some((o) => o.value === n) ? n : DEFAULT_AUTO_LOCK
  } catch {
    return DEFAULT_AUTO_LOCK
  }
}

/** Persists the auto-lock preference and notifies the live AutoLock watcher. */
export function setAutoLockMinutes(minutes: number): void {
  try {
    if (minutes === DEFAULT_AUTO_LOCK) window.localStorage.removeItem(AUTO_LOCK_KEY)
    else window.localStorage.setItem(AUTO_LOCK_KEY, String(minutes))
  } catch {
    // Ignore storage errors — the default applies.
  }
  try {
    window.dispatchEvent(new CustomEvent<number>('pl:autoLockChanged', { detail: minutes }))
  } catch {
    // Non-browser environment.
  }
}
