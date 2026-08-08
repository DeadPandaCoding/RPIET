import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimeChannel, User } from '@supabase/supabase-js'
import type {
  Dataset,
  Expense,
  Income,
  Property,
  StorageMode,
  TableName,
  Tenant,
  Unit,
} from '../lib/types'
import {
  clearAllData,
  getReceiptSignedUrl,
  getStorageMode,
  insertRow,
  loadDataset,
  removeRow,
  restoreData,
  seedDemoData,
  testConnection,
  type ConnectionStatus,
  updateRow,
  uploadReceipt as uploadReceiptApi,
} from '../lib/api'
import { loadTable } from '../lib/storage'
import { getSupabase, isRemembered, setRemembered } from '../lib/supabase'
import { fetchActiveSessions, sessionIdFromToken } from '../lib/sessions'
import {
  onAuthStateChange,
  resetPasswordForEmail,
  signInWithPassword,
  signOut as authSignOut,
  signOutEverywhere as authSignOutEverywhere,
  signOutOtherDevices as authSignOutOtherDevices,
  signUpWithEmail,
  updatePassword as authUpdatePassword,
} from '../lib/auth'
import { getLockoutState, recordFailure, recordSuccess } from '../lib/rateLimit'

type RowOf<T extends TableName> = Dataset[T][number]
type NewRowOf<T extends TableName> = Omit<RowOf<T>, 'id' | 'created_at'>

const EMPTY_DATASET: Dataset = {
  properties: [],
  units: [],
  tenants: [],
  incomes: [],
  expenses: [],
}

const SIGNED_URL_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
// Re-sign before the previous signature expires.
const RE_SIGN_BEFORE = 6 * 24 * 60 * 60 * 1000

// Supabase's Auth (GoTrue) and PostgREST services can briefly disagree on the
// clock right after a token is minted — PostgREST rejects it with
// "JWT issued at future" (PGRST303), which self-resolves within ~1-2s.
// Retry quickly so the user never sees this transient error.
const RETRY_DELAY_MS = 1500
const RETRY_ATTEMPTS = 2

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const isIssuedAtFutureError = (err: unknown) =>
  /issued at future|PGRST303/i.test(err instanceof Error ? err.message : String(err))

// Consider an access token near its real expiry when deciding whether to probe
// the refresh token (a token inside this margin can already be rejected by
// PostgREST / the sessions service).
const TOKEN_EXPIRY_MARGIN_MS = 60_000

/**
 * Signs THIS tab out locally without touching any other tab: clears every
 * supabase token key (auth token, user blob, PKCE verifiers) from both stores
 * and reloads. The server has already killed the session's refresh tokens, so
 * nothing can restore it. Deliberately NOT sb.auth.signOut(): that emits
 * SIGNED_OUT to every other tab of the same browser profile via supabase-js's
 * BroadcastChannel multi-tab sync — which would also sign out the device that
 * performed the revoke.
 */
function hardLocalSignOut() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(store)) {
      if (key.includes('-auth-token')) store.removeItem(key)
    }
  }
  window.location.reload()
}

type RefreshProbe = 'alive' | 'dead' | 'unknown'

/**
 * Asks GoTrue directly whether the stored refresh token still works, WITHOUT
 * letting auth-js handle the failure — auth-js's refresh-failure handling
 * ends in `_removeSession()`, which broadcasts SIGNED_OUT to every tab of the
 * same browser profile over BroadcastChannel. On success the rotated tokens
 * are handed back via `setSession` (which emits SIGNED_IN, never SIGNED_OUT —
 * and other tabs only adopt the session when its id matches theirs, so
 * independent per-tab sessions are unaffected), keeping auth-js's internal
 * state and token rotation in sync. Network hiccups and non-auth HTTP
 * failures return 'unknown' — a transient error must never sign the user out.
 */
async function probeRefreshToken(): Promise<RefreshProbe> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const sb = getSupabase()
  if (!url || !anonKey || !sb) return 'unknown'
  const { data } = await sb.auth.getSession()
  const refreshToken = data.session?.refresh_token
  if (!refreshToken) return 'unknown'
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    // GoTrue rejects a dead refresh token with 400 invalid_grant / 401 / 403 /
    // 422 — the session was revoked. Any other failure (429, 5xx, network)
    // must not sign the user out.
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422) {
      // Rotation-race guard: if auth-js refreshed the session while we were
      // probing, our request used a stale copy of the refresh token and the
      // rejection is not evidence of a revoked session — stay signed in.
      const { data: after } = await sb.auth.getSession()
      if (after.session && after.session.refresh_token !== refreshToken) return 'unknown'
      return 'dead'
    }
    if (!res.ok) return 'unknown'
    const json = (await res.json()) as { access_token?: string; refresh_token?: string }
    if (!json.access_token || !json.refresh_token) return 'unknown'
    // Hand the rotated tokens to auth-js via setSession (which rebuilds the
    // session — including the user, via a /user call with the new token — so
    // storage never holds a userless session) without ever letting auth-js
    // observe the earlier refresh failure.
    await sb.auth.setSession({ access_token: json.access_token, refresh_token: json.refresh_token })
    return 'alive'
  } catch {
    return 'unknown'
  }
}

export interface DataContextValue {
  mode: StorageMode
  dataset: Dataset
  loading: boolean
  error: string | null
  connection: ConnectionStatus | null
  refresh: () => Promise<void>

  // Auth (Supabase mode only)
  user: User | null
  authLoading: boolean
  passwordResetPending: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<void>
  signUp: (email: string, password: string, remember: boolean) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  signOutEverywhere: () => Promise<void>
  signOutOtherDevices: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>

  // Receipts
  receiptUrl: (url: string | null | undefined) => string | null

  // CRUD
  create: <T extends TableName>(table: T, row: NewRowOf<T>) => Promise<RowOf<T>>
  update: (table: TableName, id: string, patch: Partial<RowOf<TableName>>) => Promise<void>
  remove: (table: TableName, id: string) => Promise<void>
  uploadReceipt: (file: File) => Promise<string>

  // Demo data management
  seedDemo: () => Promise<void>
  clearAll: () => Promise<void>
  restore: (dataset: Dataset) => Promise<void>

  // Lookups
  propertyById: (id: string | null | undefined) => Property | undefined
  unitById: (id: string | null | undefined) => Unit | undefined
  tenantById: (id: string | null | undefined) => Tenant | undefined
  unitsForProperty: (propertyId: string) => Unit[]
  tenantsForUnit: (unitId: string | null | undefined) => Tenant[]
  propertyForUnit: (unitId: string | null | undefined) => Property | undefined
}

const DataContext = createContext<DataContextValue | null>(null)

const isLegacyUrl = (url: string) =>
  url.startsWith('data:') || /^https?:\/\//.test(url)

export function DataProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<Dataset>(EMPTY_DATASET)
  const [mode, setMode] = useState<StorageMode>(() => getStorageMode())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)

  // ---- Auth state ----------------------------------------------------------
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  // True after a password-recovery redirect lands back in the app: show the
  // "set a new password" screen instead of the dashboard.
  const [passwordResetPending, setPasswordResetPending] = useState(false)
  const userRef = useRef<User | null>(null)
  // Bumps whenever a signed receipt URL resolves, so receipt links re-render.
  const [receiptVersion, setReceiptVersion] = useState(0)
  const receiptCache = useRef(new Map<string, { url: string; expiresAt: number }>())

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) {
      setAuthLoading(false)
      return
    }
    let active = true
    void sb.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setUser(data.session?.user ?? null)
        setAuthLoading(false)
      })
      .catch(() => {
        // Never leave the app on the loading screen if session lookup fails.
        if (active) setAuthLoading(false)
      })
    const sub = onAuthStateChange((event, session) => {
      if (!active) return
      // Password-recovery redirect (PASSWORD_RECOVERY event) — the user still
      // has a session, but they must choose a new password before continuing.
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordResetPending(true)
      }
      // Clear the recovery flag whenever the session actually ends, so a
      // later normal sign-in is never stuck on the reset screen. (This also
      // keeps the reset screen up until sign-out resolves after updating,
      // avoiding a flash of the dashboard.)
      if (event === 'SIGNED_OUT') {
        setPasswordResetPending(false)
      }
      const next = session?.user ?? null
      // Only treat this as a session change when the user actually changed.
      // Supabase fires SIGNED_IN again when the tab regains focus (to re-sync
      // the session); showing the loading screen there without a matching
      // reload would leave the app stuck on "Loading your portfolio…" forever.
      const prev = userRef.current
      if (prev?.id !== next?.id || prev?.email !== next?.email) {
        userRef.current = next
        setUser(next)
        // Show the loading screen while the dataset re-syncs after the change.
        setLoading(true)
      }
    })
    return () => {
      active = false
      sub?.unsubscribe()
    }
  }, [])

  // Real-time revocation. revoke_owner_session (supabase/schema.sql) records
  // every revocation in public.session_revocations (owner-only RLS, published
  // to Realtime), so subscribing to INSERTs for our own session id signs a
  // revoked device out the moment the row lands — under a second, no polling.
  // The sign-out deliberately does NOT go through sb.auth.signOut(): that
  // emits SIGNED_OUT to every other tab of the same browser profile via
  // supabase-js's BroadcastChannel multi-tab sync, which would also sign out
  // the device that performed the revoke. The server has already killed this
  // session's refresh tokens, so instead we clear this tab's own token keys
  // and reload — the app boots to the sign-in screen, and no other tab is
  // touched. (Tabs with independent sessions keep theirs; a shared
  // remember-me session stays protected because its server session is dead.)
  useEffect(() => {
    const sb = getSupabase()
    if (!sb || !user) return
    let active = true
    let channel: RealtimeChannel | null = null
    void sb.auth.getSession().then(({ data }) => {
      if (!active || !data.session) return
      // Defensive: never pair a stale `user` state with a mismatched session.
      if (data.session.user.id !== user.id) return
      const sid = sessionIdFromToken(data.session.access_token)
      if (!sid) return
      channel = sb
        .channel('session-revocations')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'session_revocations',
            filter: `session_id=eq.${sid}`,
          },
          (payload) => {
            // Defensive: never sign out based on another session's event.
            const row = payload.new as { session_id?: string } | null
            if (!row || row.session_id !== sid) return
            // Local-only sign-out: clear this tab's own token keys and reload
            // (see hardLocalSignOut) — no auth-js signOut, so no SIGNED_OUT
            // broadcast to the other tabs of this browser profile. The device
            // that performed the revoke stays signed in.
            hardLocalSignOut()
          },
        )
        .subscribe()
    })
    return () => {
      active = false
      if (channel) void sb.removeChannel(channel)
    }
  }, [user])

  // Session health check (FALLBACK to the realtime subscription above).
  // Revoking a session deletes its auth.sessions row and refresh tokens, but a
  // still-valid access token (~1h) keeps working for PostgREST — and if
  // Realtime is unavailable (blocked websockets, a subscription that never
  // connected) the revoked device could keep working until then. This check is
  // the safety net: it periodically asks the sessions service whether OUR
  // session row still exists and, when it is gone, signs this tab out locally.
  //
  // Deliberately NOT `sb.auth.refreshSession()`: this auth-js build treats a
  // failed refresh on a still-valid access token as a proactive refresh and
  // does not sign out (so the old fallback never fired within the token's ~1h
  // life), and once the access token has actually expired a failed refresh
  // reaches `_removeSession()`, which broadcasts SIGNED_OUT to every tab of
  // the same browser profile — signing out the device that performed the
  // revoke too. The membership check below never touches auth-js's refresh
  // path, so it can neither miss a revoke nor broadcast one. Offline/server
  // errors do NOT sign the user out: the check only fires when the sessions
  // service answers AND our session is gone (or a direct refresh-token probe
  // confirms the token is dead).
  useEffect(() => {
    const sb = getSupabase()
    if (!sb || authLoading) return
    let lastCheck = 0
    const check = async () => {
      const now = Date.now()
      // Throttle: focus/visibility events can fire rapidly (alt-tab spamming).
      if (now - lastCheck < 30_000) return
      lastCheck = now
      const { data } = await sb.auth.getSession()
      const session = data.session
      const sid = session ? sessionIdFromToken(session.access_token) : null
      if (!session || !sid) return
      const res = await fetchActiveSessions()
      if (res.ok) {
        // The revoke deletes the session row, so our own id missing from the
        // list means this device was revoked.
        if (!res.sessions.some((s) => s.id === sid)) hardLocalSignOut()
        return
      }
      // The sessions service refused the token (or is down). When the access
      // token has expired, probe the refresh token directly — bypassing
      // auth-js's broadcasting failure handling — so a genuinely dead session
      // still signs out without touching other tabs. Only for independent
      // per-tab sessions (remember-me off): a shared remembered session's
      // tabs legitimately share fate, and probing the same token from two
      // tabs would race the rotation.
      const expired = (session.expires_at ?? 0) * 1000 < Date.now() + TOKEN_EXPIRY_MARGIN_MS
      if (expired && !isRemembered()) {
        const state = await probeRefreshToken()
        if (state === 'dead') hardLocalSignOut()
        // 'alive': tokens rotated via setSession — the next check re-lists.
        // 'unknown': transient failure — stay signed in.
      }
    }
    void check()
    // Heartbeat while the tab stays open — foreground or backgrounded — so a
    // device that is never refocused is still signed out within about a minute
    // of being revoked, long before its access token can expire.
    const interval = window.setInterval(() => void check(), 60_000)
    const onActive = () => void check()
    window.addEventListener('focus', onActive)
    document.addEventListener('visibilitychange', onActive)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onActive)
      document.removeEventListener('visibilitychange', onActive)
    }
  }, [authLoading])

  // ---- Data loading --------------------------------------------------------
  const cacheReceiptUrls = useCallback((ds: Dataset) => {
    const sb = getSupabase()
    if (!sb) return
    const paths = new Set<string>()
    for (const e of ds.expenses) {
      const r = e.receipt_url
      if (r && !isLegacyUrl(r)) paths.add(r)
    }
    const now = Date.now()
    for (const p of paths) {
      const cached = receiptCache.current.get(p)
      // Skip only while the current signature is comfortably valid.
      if (cached && now < cached.expiresAt - RE_SIGN_BEFORE) continue
      void getReceiptSignedUrl(p).then((url) => {
        if (!url) return
        const current = receiptCache.current.get(p)
        const expiresAt = Date.now() + SIGNED_URL_TTL
        if (!current || current.url !== url) {
          receiptCache.current.set(p, { url, expiresAt })
          setReceiptVersion((v) => v + 1)
        }
      })
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      setError(null)
      // In Supabase mode the database is owner-scoped via RLS; without a
      // session there is nothing to load (the sign-in screen handles that).
      if (getStorageMode() === 'supabase' && !userRef.current) {
        setDataset(EMPTY_DATASET)
        setMode('supabase')
        setConnection(null)
        return
      }
      for (let attempt = 0; ; attempt++) {
        try {
          const { dataset: ds, mode: m } = await loadDataset()
          setDataset(ds)
          setMode(m)
          const conn = await testConnection()
          setConnection(conn)
          if (getStorageMode() === 'supabase') cacheReceiptUrls(ds)
          break
        } catch (err) {
          if (attempt < RETRY_ATTEMPTS && isIssuedAtFutureError(err)) {
            await delay(RETRY_DELAY_MS)
            continue
          }
          throw err
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [cacheReceiptUrls])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Reload data when the auth session appears or disappears.
  useEffect(() => {
    if (getStorageMode() === 'supabase' && !authLoading) void refresh()
  }, [user, authLoading, refresh])

  const reloadTable = useCallback((table: TableName) => {
    setDataset((d) => {
      const next = { ...d } as Record<string, unknown>
      next[table] = loadTable(table)
      return next as unknown as Dataset
    })
  }, [])

  // ---- Auth actions --------------------------------------------------------
  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    // Reject before hitting Supabase while this email is locked out.
    const lock = getLockoutState(email)
    if (lock.locked) {
      const mins = Math.ceil(lock.retryInMs / 60000)
      throw new Error(
        `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
      )
    }
    // Set the persistence preference BEFORE the session is written, so the
    // storage adapter puts the token in localStorage (remembered) or
    // sessionStorage (forgotten on tab close). Note: on a FAILED attempt the
    // flag is still set here — harmless, since a flag with no session
    // restores nothing, and a later successful sign-in overwrites it.
    setRemembered(remember)
    const { error } = await signInWithPassword(email, password)
    if (error) {
      recordFailure(email)
      throw new Error(error.message)
    }
    recordSuccess(email)
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, remember: boolean): Promise<{ needsConfirmation: boolean }> => {
      const lock = getLockoutState(email)
      if (lock.locked) {
        const mins = Math.ceil(lock.retryInMs / 60000)
        throw new Error(
          `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
        )
      }
      // Same persistence rule as sign-in.
      setRemembered(remember)
      const { data, error } = await signUpWithEmail(email, password)
      if (error) {
        recordFailure(email)
        throw new Error(error.message)
      }
      // With email confirmation enabled, no session is returned until the
      // user clicks the confirmation link in their inbox.
      recordSuccess(email)
      return { needsConfirmation: !data.session }
    },
    [],
  )

  const signOut = useCallback(async () => {
    // Explicit sign-out also forgets the remember-me preference, so a shared
    // device is left clean for the next person.
    setRemembered(false)
    await authSignOut()
  }, [])

  const signOutEverywhere = useCallback(async () => {
    // Revokes every session server-side; also forgets the local preference.
    setRemembered(false)
    await authSignOutEverywhere()
  }, [])

  const signOutOtherDevices = useCallback(async () => {
    await authSignOutOtherDevices()
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await resetPasswordForEmail(email)
    if (error) throw new Error(error.message)
    // Supabase reports success even when no account exists for that address —
    // deliberate, so this endpoint can't be used to probe which emails are
    // registered.
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await authUpdatePassword(password)
    if (error) throw new Error(error.message)
    // The reset screen stays visible (pending stays true) until the page
    // signs the user out below — that prevents a flash of the dashboard
    // with the recovery session still active.
  }, [])

  // ---- CRUD ----------------------------------------------------------------
  const create = useCallback(
    async <T extends TableName>(table: T, row: NewRowOf<T>) => {
      const created = (await insertRow(table, row as never)) as RowOf<T>
      if (getStorageMode() === 'supabase') {
        await refresh()
      } else {
        reloadTable(table)
      }
      return created
    },
    [refresh, reloadTable],
  )

  const update = useCallback(
    async (table: TableName, id: string, patch: Partial<RowOf<TableName>>) => {
      await updateRow(table, id, patch as never)
      if (getStorageMode() === 'supabase') {
        await refresh()
      } else {
        reloadTable(table)
      }
    },
    [refresh, reloadTable],
  )

  const remove = useCallback(
    async (table: TableName, id: string) => {
      await removeRow(table, id)
      if (getStorageMode() === 'supabase') {
        // DB cascades may have touched other tables — resync.
        await refresh()
      } else {
        // Local mode mirrors FK cascades inside removeRow, then reload affected tables.
        reloadTable(table)
        reloadTable('tenants')
        reloadTable('units')
        reloadTable('incomes')
        reloadTable('expenses')
      }
    },
    [refresh, reloadTable],
  )

  const uploadReceipt = useCallback((file: File) => uploadReceiptApi(file), [])

  const seedDemo = useCallback(async () => {
    await seedDemoData()
    await refresh()
  }, [refresh])

  const clearAll = useCallback(async () => {
    await clearAllData()
    await refresh()
  }, [refresh])

  const restore = useCallback(async (ds: Dataset) => {
    await restoreData(ds)
    await refresh()
  }, [refresh])

  // ---- Receipt resolution --------------------------------------------------
  // Returns a displayable URL: data URLs (local mode) and legacy https URLs
  // pass through; Supabase storage paths resolve to cached signed URLs.
  const receiptUrl = useCallback((url: string | null | undefined): string | null => {
    if (!url) return null
    if (isLegacyUrl(url)) return url
    const cached = receiptCache.current.get(url)
    if (!cached || Date.now() > cached.expiresAt) return null
    return cached.url
  }, [])

  // ---- Lookup helpers ------------------------------------------------------
  const lookups = useMemo(() => {
    const propertyById = (id: string | null | undefined) =>
      dataset.properties.find((p) => p.id === id)
    const unitById = (id: string | null | undefined) =>
      dataset.units.find((u) => u.id === id)
    const tenantById = (id: string | null | undefined) =>
      dataset.tenants.find((t) => t.id === id)
    const unitsForProperty = (propertyId: string) =>
      dataset.units.filter((u) => u.property_id === propertyId)
    const tenantsForUnit = (unitId: string | null | undefined) =>
      dataset.tenants.filter((t) => t.unit_id === unitId)
    const propertyForUnit = (unitId: string | null | undefined) => {
      const unit = unitById(unitId)
      return unit ? propertyById(unit.property_id) : undefined
    }
    return {
      propertyById,
      unitById,
      tenantById,
      unitsForProperty,
      tenantsForUnit,
      propertyForUnit,
    }
  }, [dataset])

  const value: DataContextValue = {
    mode,
    dataset,
    loading,
    error,
    connection,
    refresh,
    user,
    authLoading,
    passwordResetPending,
    signIn,
    signUp,
    signOut,
    signOutEverywhere,
    signOutOtherDevices,
    requestPasswordReset,
    updatePassword,
    receiptUrl,
    create,
    update,
    remove,
    uploadReceipt,
    seedDemo,
    clearAll,
    restore,
    ...lookups,
  }
  // receiptVersion is consumed here so the context value (and therefore all
  // consumers) re-renders once signed receipt URLs resolve.
  void receiptVersion

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}

export type { Income, Expense, Property, Tenant, Unit }
