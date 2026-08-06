import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
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
import type { Dataset } from '../lib/types'
import { Badge, Button, Card, ConfirmDialog, Field, Input, Select } from '../components/ui'

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
  const [revoking, setRevoking] = useState<string | null>(null)
  const [signingOutOthers, setSigningOutOthers] = useState(false)
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
    } catch (err) {
      setSessions([])
      setSessionsError(err instanceof Error ? err.message : 'Could not load sessions.')
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  // Load the session list whenever the Settings page opens (Supabase mode).
  useEffect(() => {
    if (mode === 'supabase') void loadSessions()
  }, [mode, loadSessions])

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
          subtitle="Signed in as the data owner — only you can read or modify your records"
          actions={
            <Button variant="secondary" size="sm" onClick={() => void signOutBtn()}>
              <LogOut className="size-3.5" /> Sign out
            </Button>
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm dark:from-indigo-400 dark:to-violet-500 dark:text-indigo-950">
              <UserRound className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-slate-800">{user?.email ?? 'Signed in'}</p>
              <p className="text-xs text-slate-500">
                Authenticated with Supabase Auth · user id{' '}
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
                onClick={() => void runSignOutOthers()}
                disabled={signingOutOthers || sessionsLoading}
              >
                <LogOut className="size-3.5" /> Sign out other devices
              </Button>
              <Button variant="danger" onClick={() => setConfirmEverywhere(true)}>
                <LogOut className="size-3.5" /> Sign out everywhere
              </Button>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Active sessions
              </h4>
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
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {sessions.map((s) => {
                  const isCurrent = s.id === currentSessionId
                  const mobile = /mobile|iphone|ipad|android/i.test(s.userAgent ?? '')
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-300">
                        {mobile ? <Smartphone className="size-4.5" /> : <Laptop className="size-4.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
                          <span className="truncate">{deviceLabel(s.userAgent)}</span>
                          {isCurrent && <Badge color="emerald">This device</Badge>}
                        </p>
                        <p className="text-xs text-slate-400">
                          {s.ip ? `${s.ip} · ` : ''}active {timeAgo(s.updatedAt)}
                        </p>
                      </div>
                      {!isCurrent && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={revoking === s.id}
                          onClick={() => void runRevoke(s.id)}
                        >
                          {revoking === s.id ? 'Revoking…' : 'Revoke'}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
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
        subtitle="Choose how Valora looks on this device — System follows your device setting"
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
                    className="font-semibold text-indigo-600 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
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
                  in the Supabase SQL Editor. This creates all tables with per-user Row Level
                  Security, the private receipts bucket, and the auth setup.
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
        subtitle="Tables, indexes, and Row Level Security policies"
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
        subtitle="Load sample data to explore the app, or wipe everything"
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
        subtitle="Download an encrypted copy of all your data, or restore from one"
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
            This will <b>replace all current data</b>{' '}
            {supabase ? 'in your Supabase project' : 'stored in this browser'} with the contents
            of the backup file. This cannot be undone. Consider downloading a fresh backup
            first so you can recover if anything goes wrong.
          </>
        }
        confirmLabel="Restore data"
      />

      <ConfirmDialog
        open={confirmEverywhere}
        onClose={() => setConfirmEverywhere(false)}
        onConfirm={() => void runSignOutEverywhere()}
        title="Sign out everywhere?"
        message={
          <>
            This revokes your session on <b>every device</b>, including this one. You'll need
            to sign in again on each device. Any unsaved work on other devices is not affected
            (data is already saved), but you'll be signed out here immediately.
          </>
        }
        confirmLabel="Sign out everywhere"
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
            entries {supabase ? 'in your Supabase project' : 'stored in this browser'}. This
            cannot be undone.
          </>
        }
        confirmLabel="Clear everything"
      />
    </div>
  )
}
