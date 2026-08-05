import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { DataProvider, useData } from './store/DataContext'
import { ToastProvider } from './store/toast'
import { Layout, type PageKey } from './components/Layout'
import { AutoLock } from './components/AutoLock'
import { SignIn } from './pages/SignIn'
import { ResetPassword } from './pages/ResetPassword'
import { Dashboard } from './pages/Dashboard'
import { Properties } from './pages/Properties'
import { Tenants } from './pages/Tenants'
import { Incomes } from './pages/Incomes'
import { Expenses } from './pages/Expenses'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
        <Building2 className="size-7 animate-pulse text-white" />
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-slate-700">PropertyLedger</p>
        <p className="text-xs text-slate-400">Loading your portfolio…</p>
      </div>
    </div>
  )
}

function Shell() {
  const { loading, authLoading, mode, user, error, passwordResetPending } = useData()
  const [page, setPage] = useState<PageKey>('dashboard')

  if (loading || authLoading) return <LoadingScreen />

  // Supabase mode requires a signed-in owner; the database is owner-scoped.
  if (mode === 'supabase' && !user) return <SignIn />

  // After clicking a password-reset email link, force the new-password screen.
  if (mode === 'supabase' && passwordResetPending) return <ResetPassword />

  return (
    <>
      <Layout page={page} onNavigate={setPage}>
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <b>Something went wrong:</b> {error}
          </div>
        )}
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'properties' && <Properties />}
        {page === 'tenants' && <Tenants />}
        {page === 'incomes' && <Incomes />}
        {page === 'expenses' && <Expenses />}
        {page === 'reports' && <Reports />}
        {page === 'settings' && <Settings />}
      </Layout>
      {/* Auto-lock overlay: active only while signed in to Supabase */}
      <AutoLock />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <Shell />
      </DataProvider>
    </ToastProvider>
  )
}
