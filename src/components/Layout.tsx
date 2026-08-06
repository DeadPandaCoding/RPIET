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
  dashboard: { label: 'Dashboard', title: 'Dashboard', subtitle: 'Overview of your portfolio performance', icon: <LayoutDashboard className="size-5" /> },
  properties: { label: 'Properties', title: 'Properties & Units', subtitle: 'Manage buildings, units, and rent amounts', icon: <Building2 className="size-5" /> },
  tenants: { label: 'Tenants', title: 'Tenants', subtitle: 'Leases, contacts, and rent due dates', icon: <Users className="size-5" /> },
  incomes: { label: 'Income', title: 'Income Tracker', subtitle: 'Record rent and other money received', icon: <ArrowDownCircle className="size-5" /> },
  expenses: { label: 'Expenses', title: 'Expense Tracker', subtitle: 'Record costs and upload receipts', icon: <ArrowUpCircle className="size-5" /> },
  reports: { label: 'Reports', title: 'Reports & Analytics', subtitle: 'Performance, tenant payments, and tax exports', icon: <BarChart3 className="size-5" /> },
  settings: { label: 'Settings', title: 'Settings & Connection', subtitle: 'Data source, demo data, and schema setup', icon: <Settings className="size-5" /> },
}

const NAV_ORDER: PageKey[] = ['dashboard', 'properties', 'tenants', 'incomes', 'expenses', 'reports']

function Logo() {
  return (
    <div className="px-2">
      {/* The sidebar is always navy, so the ivory logo variant is used in
          both themes — no white plate needed. */}
      <div className="flex items-center justify-center px-3 py-3">
        <img src="/valora-logo-dark.png" alt="Valora" className="h-10 w-auto" />
      </div>
      <div className="mt-2 text-center text-[10px] font-medium uppercase tracking-[0.3em] text-slate-400">
        Private Portfolio
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
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <span className={active ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300 dark:group-hover:text-slate-200'}>
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
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-extrabold text-white">
          {email[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-200">{email}</p>
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
            iconClassName="size-5 text-slate-500"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-white/5 hover:text-slate-200"
          />
        </div>
        <div className="px-3">
          <button
            onClick={() => onNavigate('settings')}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
              page === 'settings'
                ? 'bg-white/10 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Settings className="size-5 text-slate-500" />
            Settings
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/5 bg-indigo-800 lg:block dark:bg-indigo-900">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
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

      {/* Main content */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface/85 backdrop-blur">
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
            <ThemeToggle className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
