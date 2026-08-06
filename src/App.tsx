import { useState } from 'react'
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
    <div className="flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-2">
      {/* Matches the compact auth landing rhythm: snug logo, no dead space */}
      <div className="animate-entrance-settle">
        <img src="/valora-logo.png" alt="Valora" className="h-20 w-auto dark:hidden" />
        <img src="/valora-logo-dark.png" alt="Valora" className="hidden h-20 w-auto dark:block" />
      </div>
      <p className="animate-entrance-rise mt-2 text-center text-xs font-medium uppercase tracking-[0.25em] text-slate-400 [animation-delay:0.15s]">
        Loading your portfolio…
      </p>
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
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
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
