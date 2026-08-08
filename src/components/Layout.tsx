import { useState, type ReactNode } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Building2,
  Cloud,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useData } from '../store/DataContext'
import { Badge, ThemeToggle } from './ui'

export type PageKey =
  | 'dashboard'
  | 'properties'
  | 'tenants'
  | 'incomes'
  | 'expenses'
  | 'reports'
  | 'settings'

export const PAGE_META: Record<PageKey, { label: string; title: string; subtitle: string; icon: ReactNode }> = {
  dashboard: { label: 'Dashboard', title: 'Dashboard', subtitle: 'Your numbers at a glance', icon: <LayoutDashboard className="size-5" /> },
  properties: { label: 'Properties', title: 'Properties & Units', subtitle: 'Your buildings, units, and rent amounts', icon: <Building2 className="size-5" /> },
  tenants: { label: 'Tenants', title: 'Tenants', subtitle: 'Who rents from you, and when rent is due', icon: <Users className="size-5" /> },
  incomes: { label: 'Income', title: 'Income Tracker', subtitle: 'Rent and other money you received', icon: <ArrowDownCircle className="size-5" /> },
  expenses: { label: 'Expenses', title: 'Expense Tracker', subtitle: 'What you paid, with receipts', icon: <ArrowUpCircle className="size-5" /> },
  reports: { label: 'Reports', title: 'Reports & Analytics', subtitle: 'Comparisons, tenant payments, and exports', icon: <BarChart3 className="size-5" /> },
  settings: { label: 'Settings', title: 'Settings & Connection', subtitle: 'Data source, demo data, and schema setup', icon: <Settings className="size-5" /> },
}

const NAV_ORDER: PageKey[] = ['dashboard', 'properties', 'tenants', 'incomes', 'expenses', 'reports']

function Logo() {
  return (
    <div className="px-2">
      {/* The sidebar is always flat navy, so the ivory logo variant is used in
          both themes — no white plate needed. */}
      <div className="flex items-center justify-center px-3 py-3">
        {/* Gentle lift + soft navy glow on the flat navy sidebar */}
        <img
          src="/valora-logo-dark.png"
          alt="Valora"
          className="h-14 w-auto transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:drop-shadow-[0_6px_18px_rgba(26,37,54,0.45)] motion-reduce:transition-none motion-reduce:hover:transform-none"
        />
      </div>
      <div className="mt-2 text-center text-[10px] font-medium uppercase tracking-[0.3em] text-slate-500">
        Rental Property Tracker
      </div>
    </div>
  )
}

function NavItems({
  current,
  onNavigate,
}: {
  current: PageKey
  onNavigate: (p: PageKey) => void
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ORDER.map((key) => {
        const meta = PAGE_META[key]
        const active = current === key
        return (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
              active
                ? 'bg-white/10 text-white shadow-inner'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className={active ? 'text-violet-300' : 'text-slate-400 group-hover:text-white'}>
              {meta.icon}
            </span>
            {meta.label}
            {active && <span className="ml-auto size-1.5 rounded-full bg-violet-400" />}
          </button>
        )
      })}
    </nav>
  )
}

function ConnectionChip() {
  const { mode, connection } = useData()
  // The chip reflects the actual data source (mode), not just whether the last
  // connection probe succeeded — so it never claims "Local demo mode" while the
  // app is configured for Supabase (e.g. while the check is in flight or failing).
  const supabase = mode === 'supabase'
  const connected = supabase && connection?.ok
  const label = connected ? 'Supabase connected' : supabase ? 'Checking connection…' : 'Local demo mode'
  return (
    <div className="px-3">
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
          connected
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : supabase
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              : 'border-slate-500/30 bg-slate-500/10 text-slate-400'
        }`}
      >
        {connected || supabase ? <Cloud className="size-3.5" /> : <Database className="size-3.5" />}
        <span className="truncate">{label}</span>
      </div>
    </div>
  )
}

function UserChip() {
  const { mode, user, signOut } = useData()
  if (mode !== 'supabase' || !user) return null
  const email = user.email ?? 'Signed in'
  return (
    <div className="px-3">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[10px] font-extrabold text-indigo-950">
          {email[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0 flex-1">
          {/* text-white, not text-slate-100: the dark theme remaps slate-100 to
              a deep navy that would make the email invisible on this navy
              sidebar. The sidebar is always navy, so use a fixed bright tone. */}
          <p className="truncate text-sm font-semibold text-white">{email}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Owner</p>
        </div>
        <button
          onClick={() => void signOut()}
          title="Sign out"
          aria-label="Sign out"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function Layout({
  page,
  onNavigate,
  children,
}: {
  page: PageKey
  onNavigate: (p: PageKey) => void
  children: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const meta = PAGE_META[page]

  const sidebar = (
    <div className="flex h-full flex-col gap-6 py-6">
      <Logo />
      <NavItems
        current={page}
        onNavigate={(p) => {
          onNavigate(p)
          setMobileOpen(false)
        }}
      />
      <div className="space-y-3">
        <ConnectionChip />
        <UserChip />
        <div className="px-3">
          <ThemeToggle
            showLabel
            iconClassName="size-5 text-slate-400"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-white/5 hover:text-white"
          />
        </div>
        <div className="px-3">
          <button
            onClick={() => onNavigate('settings')}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
              page === 'settings'
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Settings className="size-5 text-slate-400" />
            Settings
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar — flat navy, no gradient */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/5 bg-indigo-800 lg:block dark:bg-indigo-900">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-white/5 bg-indigo-800 shadow-2xl dark:bg-indigo-900">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content — keyed by page so the entrance animation replays on
          every navigation. The header stays outside the animated wrapper so
          its sticky positioning is never broken by a parent transform. */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display truncate text-lg font-semibold tracking-tight text-slate-900">
                {meta.title}
              </h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{meta.subtitle}</p>
            </div>
            <Badge color="indigo" className="hidden sm:inline-flex">
              {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Badge>
          </div>
        </header>
        {/* keyed by page so per-section entrance staggers (e.g. the
            Dashboard's) replay on every navigation */}
        <main key={page} className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
