/**
 * Device-local, non-sensitive preference storage.
 * (Sensitive auth state lives in the gated Supabase storage adapter instead.)
 */

const AUTO_LOCK_KEY = 'pl.autoLockMinutes'
const THEME_KEY = 'pl.theme'

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

// ---------------------------------------------------------------------------
// Theme preference
// ---------------------------------------------------------------------------

export type ThemePref = 'light' | 'dark' | 'system'

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const DEFAULT_THEME: ThemePref = 'system'

/** The stored theme preference ('system' follows the OS setting). */
export function getThemePref(): ThemePref {
  try {
    const raw = window.localStorage.getItem(THEME_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
    return DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** Persists the theme preference and notifies the live theme watchers. */
export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === DEFAULT_THEME) window.localStorage.removeItem(THEME_KEY)
    else window.localStorage.setItem(THEME_KEY, pref)
  } catch {
    // Ignore storage errors — the default applies.
  }
  try {
    window.dispatchEvent(new CustomEvent<ThemePref>('pl:themeChanged', { detail: pref }))
  } catch {
    // Non-browser environment.
  }
}
