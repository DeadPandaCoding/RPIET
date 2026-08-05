import { useRef, useState, type ChangeEvent } from 'react'
import {
  Cloud,
  Database,
  Download,
  FileCode2,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'
import { useData } from '../store/DataContext'
import { useToast } from '../store/toast'
import { formatNumber } from '../lib/format'
import { decryptBackup, encryptBackup } from '../lib/backup'
import type { Dataset } from '../lib/types'
import { Badge, Button, Card, ConfirmDialog, Field, Input } from '../components/ui'

export function Settings() {
  const { connection, dataset, seedDemo, clearAll, refresh, mode, user, signOut, restore } =
    useData()
  const { toast } = useToast()
  const [testing, setTesting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [backupPassword, setBackupPassword] = useState('')
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null)
  const [pendingRestore, setPendingRestore] = useState<Dataset | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
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
      a.download = `propertyledger-backup-${new Date().toISOString().slice(0, 10)}.plbk`
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
    <div className="space-y-4">
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
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
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

      {/* Connection status */}
      <Card
        title="Data Source"
        subtitle="Where your PropertyLedger data lives"
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
                ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
                : 'bg-amber-50 text-amber-600 ring-amber-100'
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
                    className="font-semibold text-indigo-600 hover:underline"
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
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    supabase/schema.sql
                  </span>{' '}
                  in the Supabase SQL Editor. This creates all tables with per-user Row Level
                  Security, the private receipts bucket, and the auth setup.
                </>,
                <>
                  Copy{' '}
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    .env.example
                  </span>{' '}
                  to{' '}
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    .env
                  </span>
                  , paste in your keys, then restart the dev server. Sign in with your new
                  account — the app will ask for it on first open.
                </>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-500">
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
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
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
