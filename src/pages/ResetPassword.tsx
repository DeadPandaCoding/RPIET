import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { useData } from '../store/DataContext'
import { useToast } from '../store/toast'
import { Button, Input } from '../components/ui'

/**
 * Shown after the user clicks the password-reset link from their email.
 * Supabase signs the user in with a recovery session (PASSWORD_RECOVERY
 * event → passwordResetPending). They choose a new password here, then get
 * signed out and back to the normal sign-in screen with the new password.
 */
export function ResetPassword() {
  const { updatePassword, signOut } = useData()
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password.length > 128) {
      setError('Password is too long (max 128 characters).')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await updatePassword(password)
      toast('Password updated — sign in with your new password', 'success')
      // End the recovery session so the user signs in fresh with the new password.
      await signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-2">
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[28rem] rounded-full bg-violet-300/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <h1 className="sr-only">Valora</h1>
        <div className="mb-2 flex flex-col items-center text-center">
          {/* Navy logo on light, ivory logo on navy — no white plate. The logo
              is the hero of the landing page, so it leads large. */}
          <span className="animate-entrance-settle inline-block">
            {/* Hover lift lives on its own span so it never clashes with the
                entrance animation's held end-state transform */}
            <span className="inline-block transition-transform duration-300 ease-out hover:-translate-y-1 hover:drop-shadow-[0_8px_24px_rgba(140,107,49,0.35)] motion-reduce:transition-none motion-reduce:hover:transform-none">
              <img src="/valora-logo.png" alt="" className="h-32 w-auto sm:h-36 dark:hidden" />
              <img src="/valora-logo-dark.png" alt="" className="hidden h-32 w-auto sm:h-36 dark:block" />
            </span>
          </span>
          <p className="animate-entrance-rise mt-1.5 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-400 [animation-delay:0.15s]">Private Portfolio</p>
          <p className="animate-entrance-rise mt-0.5 text-sm text-slate-500 [animation-delay:0.25s]">Choose a new password for your account</p>
        </div>

        <div className="animate-entrance-lift rounded-2xl border border-slate-200 bg-surface p-6 shadow-xl shadow-black/5 dark:border-slate-700/70 dark:shadow-black/30 sm:p-8 [animation-delay:0.35s]">
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-900/60 dark:text-indigo-200">
              <KeyRound className="size-4 shrink-0" />
              Password recovery verified. Set a new password below.
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">New password</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="pl-9 pr-10"
                  autoFocus
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                Confirm new password
              </span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label={show ? 'Hide passwords' : 'Show passwords'}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Updating…
                </span>
              ) : (
                'Update password'
              )}
            </Button>
          </form>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck className="size-3.5" />
            After updating, you'll sign in again with your new password
          </p>
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => void signOut().catch(() => {})}
              className="text-xs font-semibold text-slate-400 transition-colors hover:text-slate-600 hover:underline"
            >
              Cancel and sign in later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
