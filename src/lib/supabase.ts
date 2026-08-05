import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'

/**
 * "Remember me" flag (device preference, not a secret).
 *
 * When OFF (the default), the auth session is kept in sessionStorage only:
 * it survives page refreshes but is gone when the tab closes — so opening
 * the site never silently signs you in. When ON, the session lives in
 * localStorage and is restored on every visit.
 */
const REMEMBER_KEY = 'pl.rememberMe'

let client: SupabaseClient | null = null

/** True when the user opted to stay signed in across visits. */
export function isRemembered(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === '1'
  } catch {
    return false
  }
}

/** Persists (or forgets) the remember-me preference. */
export function setRemembered(remember: boolean): void {
  try {
    if (remember) window.localStorage.setItem(REMEMBER_KEY, '1')
    else window.localStorage.removeItem(REMEMBER_KEY)
  } catch {
    // Storage unavailable — the session simply won't persist across visits.
  }
}

/**
 * Storage adapter that enforces the remember-me policy. When the user has
 * not opted in, ALL auth writes go to sessionStorage instead of localStorage
 * (nothing sensitive ever touches persistent disk storage), and reads never
 * see a stored session — so a fresh visit always lands on the sign-in screen.
 * removeItem clears both stores so sign-out is a hard reset.
 */
export const authStorage: SupportedStorage = {
  getItem(key) {
    try {
      const store = isRemembered() ? window.localStorage : window.sessionStorage
      return store.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      const store = isRemembered() ? window.localStorage : window.sessionStorage
      store.setItem(key, value)
    } catch {
      // Quota/private-mode errors: the session simply stays in memory.
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore.
    }
    try {
      window.sessionStorage.removeItem(key)
    } catch {
      // Ignore.
    }
  },
}

/**
 * Returns the Supabase client when env vars are configured, otherwise null.
 * When null, the app falls back to local browser storage (demo mode).
 */
export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        storage: authStorage,
      },
    })
  }
  return client
}
