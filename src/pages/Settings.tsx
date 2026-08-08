import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  Cloud,
  Database,
  Download,
  FileCode2,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'
import { useData } from '../store/DataContext'
import { useToast } from '../store/toast'
import { formatNumber } from '../lib/format'
import { decryptBackup, encryptBackup } from '../lib/backup'
import {
  AUTO_LOCK_OPTIONS,
  getAutoLockMinutes,
  getThemePref,
  setAutoLockMinutes,
  setThemePref,
  THEME_OPTIONS,
  type ThemePref,
} from '../lib/prefs'
import {
  deviceLabel,
  fetchActiveSessions,
  revokeSession,
  timeAgo,
  type SessionInfo,
} from '../lib/sessions'
import { getSecuritySettings, setRevokeSessionsOnPasswordChange } from '../lib/security'
import type { Dataset } from '../lib/types'
import { Badge, Button, Card, ConfirmDialog, Field, Input, Select } from '../components/ui'

/** Sessions not refreshed in this long are considered inactive (hidden by default). */
const INACTIVE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * "Updated X ago" label next to ACTIVE SESSIONS. Ticks every 30s so the
 * relative time stays accurate while the page stays open.
 */
function LastRefreshed({ at }: { at: Date | null }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    // timeAgo has minute granularity, so a 60s tick keeps the label accurate
    // with the fewest re-renders.
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])
  if (!at) return null
  const minutes = Math.max(0, Math.floor((Date.now() - at.getTime()) / 60_000))
  // Beyond an hour, "2h ago" loses precision — show the clock time instead.
  const label =
    minutes < 60
      ? timeAgo(at.toISOString())
      : at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return <span className="text-xs text-slate-400">Updated {label}</span>
}

export function Settings() {
  const {
    connection,
    dataset,
    seedDemo,
    clearAll,
    refresh,
    mode,
    user,
    signOut,
    signOutEverywhere,
    signOutOtherDevices,
    restore,
  } = useData()
  const { toast } = useToast()
  const [testing, setTesting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [backupPassword, setBackupPassword] = useState('')
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null)
  const [pendingRestore, setPendingRestore] = useState<Dataset | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [autoLock, setAutoLock] = useState<number>(getAutoLockMinutes)
  const [themePref, setThemePrefState] = useState<ThemePref>(getThemePref)
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<SessionInfo | null>(null)
  const [signingOutOthers, setSigningOutOthers] = useState(false)
  const [revokeOnPasswordChange, setRevokeOnPasswordChange] = useState(false)
  const [revokeOnPasswordChangeLoading, setRevokeOnPasswordChangeLoading] = useState(true)
  const [savingRevokeOnPasswordChange, setSavingRevokeOnPasswordChange] = useState(false)
  const [confirmOthers, setConfirmOthers] = useState(false)
  const [confirmEverywhere, setConfirmEverywhere] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = mode === 'supabase'

  const runTest = async () => {
    setTesting(true)
    try {
      await refresh()
      toast('Connection status refreshed', 'success')
    } catch {
      toast('Connection check failed', 'error')
    } finally {
      setTesting(false)
    }
  }

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const result = await fetchActiveSessions()
      setSessions(result.ok ? result.sessions : [])
      setCurrentSessionId(result.currentSessionId)
      setSessionsError(result.ok ? null : result.error ?? 'Could not load sessions.')
      if (result.ok) setLastRefreshed(new Date())
    } catch (err) {
      setSessions([])
      setSessionsError(err instanceof Error ? err.message : 'Could not load sessions.')
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  // Load the session list whenever the Settings page opens (Supabase mode),
  // and refresh it whenever the tab regains focus or becomes visible again —
  // so a session change made on another device shows up without a manual
  // Refresh click.
  useEffect(() => {
    if (mode !== 'supabase') return
    let reloadScheduled: number | null = null
    const scheduleReload = () => {
      // Only reload when actually looking at the page: visibilitychange fires
      // for both 'visible' and 'hidden', and focus implies the doc is visible.
      if (document.visibilityState !== 'visible') return
      // Collapse focus + visibilitychange firing in the same tick into one fetch.
      if (reloadScheduled !== null) return
      reloadScheduled = window.setTimeout(() => {
        reloadScheduled = null
        void loadSessions()
      }, 0)
    }
    void loadSessions()
    window.addEventListener('focus', scheduleReload)
    document.addEventListener('visibilitychange', scheduleReload)
    return () => {
      if (reloadScheduled !== null) window.clearTimeout(reloadScheduled)
      window.removeEventListener('focus', scheduleReload)
      document.removeEventListener('visibilitychange', scheduleReload)
    }    }, [mode, loadSessions])

  // Load the per-account security setting whenever Settings opens (Supabase mode).
  useEffect(() => {
    if (mode !== 'supabase') return
    let active = true
    void getSecuritySettings().then((s) => {
      if (!active) return
      setRevokeOnPasswordChange(s.revokeSessionsOnPasswordChange)
      setRevokeOnPasswordChangeLoading(false)
    })
    return () => {
      active = false
    }
  }, [mode])

  const runSetRevokeOnPasswordChange = async (enabled: boolean) => {
    setSavingRevokeOnPasswordChange(true)
    // Optimistic; reverted if the save fails.
    setRevokeOnPasswordChange(enabled)
    try {
      await setRevokeSessionsOnPasswordChange(enabled)
      toast(
        enabled
          ? 'Other devices will be signed out after you change your password'
          : 'Automatic sign-out of other devices disabled',
        'success',
      )
    } catch (err) {
      setRevokeOnPasswordChange(!enabled)
      toast(err instanceof Error ? err.message : 'Could not save the setting', 'error')
    } finally {
      setSavingRevokeOnPasswordChange(false)
    }
  }

  // Keep the Appearance card in sync with theme changes from the header toggle.
  useEffect(() => {
    const onChange = (e: Event) => setThemePrefState((e as CustomEvent<ThemePref>).detail)
    window.addEventListener('pl:themeChanged', onChange)
    return () => window.removeEventListener('pl:themeChanged', onChange)
  }, [])

  const runSignOutOthers = async () => {
    setSigningOutOthers(true)
    try {
      await signOutOtherDevices()
      toast('Signed out on all other devices', 'success')
      await loadSessions()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to sign out other devices', 'error')
    } finally {
      setSigningOutOthers(false)
    }
  }

  const runSignOutEverywhere = async () => {
    try {
      await signOutEverywhere()
      toast('Signed out everywhere — sign in again to continue', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to sign out everywhere', 'error')
    }
  }

  const runRevoke = async (sid: string) => {
    setRevoking(sid)
    try {
      await revokeSession(sid)
      toast('That device has been signed out', 'success')
      await loadSessions()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to revoke session', 'error')
    } finally {
      setRevoking(null)
    }
  }

  const runSeed = async () => {
    setSeeding(true)
    try {
      await seedDemo()
      toast('Demo data loaded', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load demo data', 'error')
    } finally {
      setSeeding(false)
    }
  }

  const counts = [
    { label: 'Properties', value: dataset.properties.length },
    { label: 'Units', value: dataset.units.length },
    { label: 'Tenants', value: dataset.tenants.length },
    { label: 'Income entries', value: dataset.incomes.length },
    { label: 'Expense entries', value: dataset.expenses.length },
  ]

  const revokeTargetLabel = confirmRevoke ? deviceLabel(confirmRevoke.userAgent) : 'this device'

  // Sessions not refreshed in INACTIVE_MS are treated as inactive (the app
  // pings ~every 60s while a device is open, so a 30-day-stale row is truly
  // unused). Hidden by default; toggle "Show inactive devices" to reveal them.
  const sessionEntries = (sessions ?? []).map((s) => {
    const seen = new Date(s.updatedAt).getTime()
    const inactive = Number.isFinite(seen) && Date.now() - seen >= INACTIVE_MS
    return { s, inactive }
  })
  const visibleEntries = sessionEntries.filter(({ inactive }) => showInactive || !inactive)
  const hiddenInactiveCount = sessionEntries.filter(({ inactive }) => inactive).length

  const sessionList =
    visibleEntries.length > 0 ? (
      <>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {visibleEntries.map(({ s, inactive }) => {
            const isCurrent = s.id === currentSessionId
            const mobile = /mobile|iphone|ipad|android/i.test(s.userAgent ?? '')
            // Refreshed within the last 5 minutes = the device's app is open
            // and in the foreground (it pings ~every 60s).
            const activeNow = Date.now() - new Date(s.updatedAt).getTime() < 5 * 60_000
            return (
              <li
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  inactive ? 'bg-amber-50/70 dark:bg-amber-500/10' : ''
                }`}
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-300">
                  {mobile ? <Smartphone className="size-4.5" /> : <Laptop className="size-4.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className="truncate">{deviceLabel(s.userAgent)}</span>
                    {isCurrent && <Badge color="emerald">This device</Badge>}
                    {inactive && (
                      <Badge color="amber">
                        <AlertTriangle className="size-3" /> Possibly abandoned
                      </Badge>
                    )}
                  </p>
                  <p
                    className={`text-xs ${
                      inactive ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-slate-400'
                    }`}
                  >
                    {s.ip ? `${s.ip} · ` : ''}
                    {activeNow ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Active now
                      </span>
                    ) : (
                      `Last seen ${timeAgo(s.updatedAt)}`
                    )}
                  </p>
                </div>
                {!isCurrent && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={revoking === s.id}
                    onClick={() => setConfirmRevoke(s)}
                  >
                    {revoking === s.id ? 'Revoking…' : 'Revoke'}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {!showInactive && hiddenInactiveCount > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="size-3.5 shrink-0" />
            {hiddenInactiveCount} inactive device{hiddenInactiveCount === 1 ? '' : 's'} hidden (30+
            days) — possibly abandoned ·{' '}
            <button
              className="font-semibold underline-offset-2 hover:underline"
              onClick={() => setShowInactive(true)}
            >
              show inactive devices
            </button>
          </p>
        )}
      </>
    ) : (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        No devices active in the last 30 days — enable “Show inactive devices” to review possibly
        abandoned ones.
      </p>
    )

  const signOutBtn = async () => {
    try {
      await signOut()
      toast('Signed out', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sign out failed', 'error')
    }
  }

  const runBackup = async () => {
    const password = backupPassword.trim()
    if (password.length < 4) {
      toast('Enter a password of at least 4 characters', 'error')
      return
    }
    if (password.length > 128) {
      toast('Backup password is too long (max 128 characters)', 'error')
      return
    }
    setBusy('backup')
    try {
      const blob = await encryptBackup(dataset, password)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `valora-backup-${new Date().toISOString().slice(0, 10)}.plbk`
      a.click()
      URL.revokeObjectURL(url)
      toast('Backup downloaded — keep the file somewhere safe', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Backup failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const password = backupPassword.trim()
    if (!password) {
      toast('Enter the password this backup was encrypted with', 'error')
      return
    }
    setBusy('restore')
    try {
      const ds = await decryptBackup(file, password)
      setPendingRestore(ds)
      setConfirmRestore(true)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Restore failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="animate-fade-in-up space-y-4">
      {/* Account & security */}
      {supabase && (
        <Card
          title="Account & Security"
          subtitle="You're the owner of this data — only you can see or change it"
          actions={
            <Button variant="secondary" size="sm" onClick={() => void signOutBtn()}>
              <LogOut className="size-3.5" /> Sign out
            </Button>
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm dark:bg-indigo-500 dark:text-white">
              <UserRound className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-slate-800">{user?.email ?? 'Signed in'}</p>
              <p className="text-xs text-slate-500">
                Signed in with Supabase Auth · user id{' '}
                <span className="font-mono text-[11px]">{user?.id ?? '—'}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge color="emerald">
                <ShieldCheck className="size-3" /> Owner-only RLS
              </Badge>
              <Badge color="emerald">Private receipts</Badge>
            </div>
          </div>
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
            Every row is tagged with your <span className="font-mono">user_id</span> and hidden
            from everyone else by Row Level Security. Receipts are stored in a private bucket and
            served through time-limited signed URLs.
          </p>
        </Card>
      )}

      {/* Devices & sessions */}
      {supabase && (
        <Card
          title="Devices & Sessions"
          subtitle="See where you're signed in, sign out remotely, and set auto-lock"
        >
          <div className="flex flex-wrap items-end gap-4">
            <Field
              label="Auto sign-out after inactivity"
              hint="Ends your session automatically after this long without activity. A 30-second warning gives you a chance to stay signed in."
              className="min-w-56 flex-1"
            >
              <Select
                value={String(autoLock)}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setAutoLock(v)
                  setAutoLockMinutes(v)
                }}
              >
                {AUTO_LOCK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmOthers(true)}
                disabled={signingOutOthers || sessionsLoading}
              >
                <LogOut className="size-3.5" /> Sign out other devices
              </Button>
              <Button variant="danger" onClick={() => setConfirmEverywhere(true)}>
                <LogOut className="size-3.5" /> Sign out everywhere
              </Button>
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-indigo-300 dark:border-slate-700/70 dark:bg-slate-900/40 dark:hover:border-indigo-500/40">
            <input
              type="checkbox"
              checked={revokeOnPasswordChange}
              disabled={revokeOnPasswordChangeLoading || savingRevokeOnPasswordChange}
              onChange={(e) => void runSetRevokeOnPasswordChange(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-indigo-600"
              title="Sign out other devices when I change my password"
            />
            <span>
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Sign out other devices when I change my password
                {savingRevokeOnPasswordChange && <Badge color="slate">Saving…</Badge>}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                When you reset or change your password, every other device gets signed out right
                away — even if its tab is open. This device stays signed in. The setting follows
                your account on every device.
              </span>
            </span>
          </label>

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Active sessions
                </h4>
                <LastRefreshed at={lastRefreshed} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    title="Devices not seen in 30+ days"
                    className="size-3.5 accent-indigo-600"
                  />
                  Show inactive devices
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadSessions()}
                  disabled={sessionsLoading}
                >
                  <RefreshCw className={`size-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
            {sessionsError && sessions && sessions.length > 0 && (
              <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                Refresh failed: {sessionsError}
              </p>
            )}

            {sessionsLoading && sessions === null ? (
              <p className="py-6 text-center text-sm text-slate-400">Loading sessions…</p>
            ) : sessionsError && sessions?.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                {sessionsError}
              </p>
            ) : sessions && sessions.length > 0 ? (
              sessionList
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">
                No active sessions found.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Appearance */}
      <Card
        title="Appearance"
        subtitle="Pick how the app looks on this device — System follows your device settings"
      >
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 sm:w-fit">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setThemePref(o.value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all sm:flex-none ${
                themePref === o.value
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-indigo-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {o.value === 'light' ? (
                <Sun className="size-4" />
              ) : o.value === 'dark' ? (
                <Moon className="size-4" />
              ) : (
                <Monitor className="size-4" />
              )}
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Connection status */}
      <Card
        title="Data Source"
        subtitle="Where your Valora data lives"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void runTest()} disabled={testing}>
            <RefreshCw className={`size-3.5 ${testing ? 'animate-spin' : ''}`} /> Test connection
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className={`flex size-14 items-center justify-center rounded-2xl ring-1 ${
              supabase
                ? 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30'
                : 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30'
            }`}
          >
            {supabase ? <Cloud className="size-7" /> : <Database className="size-7" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">
                {supabase ? 'Supabase connected' : 'Local browser storage'}
              </h3>
              <Badge color={supabase ? 'emerald' : 'amber'}>
                {supabase ? 'Cloud sync enabled' : 'Demo mode'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {connection?.message ?? 'Checking connection…'}
            </p>
          </div>
        </div>

        {!supabase && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-700">Connect Supabase in 3 steps</p>
            <ol className="mt-3 space-y-3">
              {[
                <>
                  <b>Create a project</b> at{' '}
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    supabase.com
                  </a>{' '}
                  and grab your project URL + anon key from{' '}
                  <span className="font-mono text-xs">Project → Settings → API</span>. Then enable
                  the <b>Email</b> provider under{' '}
                  <span className="font-mono text-xs">Authentication → Providers</span>.
                </>,
                <>
                  Run{' '}
                  <span className="rounded bg-indigo-900 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    supabase/schema.sql
                  </span>{' '}
                  in the Supabase SQL Editor. This creates all tables with per-user Row
                  Level Security, the private receipts bucket, and the auth setup. It's
                  safe to re-run after updates — the Devices & Sessions list needs the
                  `owner_sessions` view and `revoke_owner_session` function it creates.
                </>,
                <>
                  Copy{' '}
                  <span className="rounded bg-indigo-900 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    .env.example
                  </span>{' '}
                  to{' '}
                  <span className="rounded bg-indigo-900 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    .env
                  </span>
                  , paste in your keys, then restart the dev server. Sign in with your new
                  account — the app will ask for it on first open.
                </>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/70 dark:text-indigo-300">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-lg border border-slate-200 bg-surface p-3 font-mono text-[11px] leading-relaxed text-slate-500">
              <p className="flex items-center gap-1.5 font-sans text-xs font-semibold text-slate-600">
                <KeyRound className="size-3.5" /> .env
              </p>
              <p>VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co</p>
              <p>VITE_SUPABASE_ANON_KEY=your-anon-key</p>
            </div>
          </div>
        )}

        {supabase && (
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
            <Badge color="emerald">Receipts → private owner-scoped bucket</Badge>
            <Badge color="emerald">Per-user RLS on all tables</Badge>
            <Badge color="slate">Synced across devices</Badge>
          </div>
        )}
      </Card>

      {/* Schema */}
      <Card
        title="Database Schema"
        subtitle="Tables, indexes, and row-level security policies"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-300">
            <FileCode2 className="size-5" />
          </div>
          <div className="text-sm text-slate-600">
            <p>
              The file <span className="font-mono text-xs font-semibold">supabase/schema.sql</span>{' '}
              defines <b>properties</b>, <b>units</b>, <b>tenants</b>, <b>incomes</b>, and{' '}
              <b>expenses</b>, each with Row Level Security enabled, plus the{' '}
              <span className="font-mono text-xs">receipts</span> storage bucket for expense
              receipts.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {counts.map((c) => (
                <div key={c.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <p className="text-lg font-extrabold text-slate-800">{formatNumber(c.value)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{c.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Demo data */}
      <Card
        title="Demo Data"
        subtitle="Load sample data to try the app, or wipe everything"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="success" onClick={() => void runSeed()} disabled={seeding}>
            <Sparkles className={`size-4 ${seeding ? 'animate-pulse' : ''}`} /> {seeding ? 'Loading…' : 'Load demo data'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmClear(true)}>
            <Trash2 className="size-4" /> Clear all data
          </Button>
          {supabase && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Server className="size-3.5" /> This deletes rows in your connected Supabase project.
            </span>
          )}
        </div>
      </Card>

      {/* Backup & restore */}
      <Card
        title="Backup & Restore"
        subtitle="Save an encrypted copy of all your data, or restore from one"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              label="Backup password"
              hint="Used to encrypt the file on download and to unlock it on restore."
              className="flex-1"
            >
              <Input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Enter a password…"
                autoComplete="off"
              />
            </Field>
            <Button variant="primary" onClick={() => void runBackup()} disabled={busy !== null}>
              <Download className="size-4" />
              {busy === 'backup' ? 'Encrypting…' : 'Download backup'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
            >
              <Upload className="size-4" />
              {busy === 'restore' ? 'Restoring…' : 'Restore backup'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".plbk,application/octet-stream"
              className="hidden"
              onChange={(e) => void onPickFile(e)}
            />
          </div>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            The file is encrypted with AES-256 in your browser before it is downloaded — it
            cannot be opened without your password. Keep a copy somewhere safe (Google Drive,
            USB drive, or another device) so you can always recover your data, even if the site
            or the database is ever unavailable.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmRestore}
        onConfirm={async () => {
          const ds = pendingRestore
          setPendingRestore(null)
          if (!ds) return
          setBusy('restore')
          try {
            await restore(ds)
            toast('Backup restored successfully', 'success')
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Restore failed', 'error')
          } finally {
            setBusy(null)
          }
        }}
        onClose={() => {
          setConfirmRestore(false)
          setPendingRestore(null)
        }}
        title="Restore this backup?"
        message={
          <>
            This <b>replaces all current data</b>{' '}
            {supabase ? 'in your Supabase project' : 'stored in this browser'} with what's in the
            backup file. There's no undo. It's a good idea to download a fresh backup first, just
            in case.
          </>
        }
        confirmLabel="Restore data"
      />

      <ConfirmDialog
        open={confirmOthers}
        onClose={() => setConfirmOthers(false)}
        onConfirm={() => void runSignOutOthers()}
        title="Sign out other devices?"
        message={
          <>
            This signs out every device where you're logged in other than this one — phones,
            tablets, other computers. <b>This device stays signed in.</b> The others will just
            need to sign in again. Nothing gets deleted.
          </>
        }
        confirmLabel="Sign out other devices"
      />

      <ConfirmDialog
        open={confirmEverywhere}
        onClose={() => setConfirmEverywhere(false)}
        onConfirm={() => void runSignOutEverywhere()}
        title="Sign out everywhere?"
        message={
          <>
            This signs out <b>every device</b>, including this one. You'll need to sign in again
            on each device. Your data is already saved, so nothing is lost — you'll just be
            signed out here right away.
          </>
        }
        confirmLabel="Sign out everywhere"
      />

      <ConfirmDialog
        open={confirmRevoke !== null}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={() => {
          const target = confirmRevoke
          setConfirmRevoke(null)
          if (target) void runRevoke(target.id)
        }}
        title="Sign out this device?"
        message={
          <>
            This signs out <b>{revokeTargetLabel}</b> on that device. It will need to sign in
            again to get back in. Nothing gets deleted.
          </>
        }
        confirmLabel="Sign out device"
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          try {
            await clearAll()
            toast('All data cleared', 'success')
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Clear failed', 'error')
          }
        }}
        title="Clear all data?"
        message={
          <>
            This permanently deletes <b>all</b> properties, units, tenants, income, and expense
            entries {supabase ? 'in your Supabase project' : 'stored in this browser'}. There's
            no undo.
          </>
        }
        confirmLabel="Clear everything"
      />
    </div>
  )
}
