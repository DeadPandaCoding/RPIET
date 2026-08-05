import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { useData } from '../store/DataContext'
import { ValoraMark } from '../components/ValoraMark'
import { Button, Input } from '../components/ui'
import { EMAIL_RE } from '../lib/validate'
import { getLockoutState } from '../lib/rateLimit'

type AuthMode = 'signin' | 'signup' | 'reset'

export function SignIn() {
  const { signIn, signUp, requestPasswordReset } = useData()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [remember, setRemember] = useState(false)
  const [, setTick] = useState(0)

  const lock = getLockoutState(email)
  const isLocked = lock.locked

  // Live countdown while the current email is locked out. Depends on
  // isLocked so the interval also starts when the 5th failed attempt locks
  // the account mid-session (not only on mount / email change).
  useEffect(() => {
    let id: number | undefined
    const check = () => {
      if (!getLockoutState(email).locked) {
        if (id) window.clearInterval(id)
        return
      }
      setTick((t) => t + 1)
    }
    if (isLocked) id = window.setInterval(check, 1000)
    return () => {
      if (id) window.clearInterval(id)
    }
  }, [email, isLocked])

  const formatCountdown = (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError(null)
    setConfirmed(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setConfirmed(false)
    const em = email.trim()

    // Password reset only needs a valid email address.
    if (mode === 'reset') {
      if (!em) {
        setError('Enter your email address.')
        return
      }
      if (em.length > 254 || !em.includes('@') || /\s/.test(em)) {
        setError('Enter a valid email address.')
        return
      }
      setSubmitting(true)
      try {
        await requestPasswordReset(em)
        setConfirmed(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (!em || !password) {
      setError('Enter your email and password.')
      return
    }
    if (em.length > 254) {
      setError('Email is too long (max 254 characters).')
      return
    }
    // Lenient sanity check on sign-in so existing accounts are never locked
    // out by a stricter rule added later.
    if (!em.includes('@') || /\s/.test(em)) {
      setError('Enter a valid email address.')
      return
    }
    // Strict format only when creating a NEW account.
    if (mode === 'signup' && !EMAIL_RE.test(em)) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length > 128) {
      setError('Password is too long (max 128 characters).')
      return
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        await signIn(em, password, remember)
      } else {
        const { needsConfirmation } = await signUp(em, password, remember)
        if (needsConfirmation) setConfirmed(true)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      // Surface a friendlier message for the common 'no user found' case.
      setError(msg.includes('Invalid login') ? 'Incorrect email or password.' : msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      {/* Decorative background — soft ink & champagne washes */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[28rem] rounded-full bg-violet-300/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 size-64 -translate-x-1/2 rounded-full bg-sky-200/25 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <ValoraMark className="size-7 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-extrabold lowercase tracking-tight text-slate-900">valora</h1>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">Private Portfolio</p>
          <p className="mt-2 text-sm text-slate-500">Sign in to manage your rental portfolio</p>
        </div>

        <div className="animate-modal-pop rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
          {confirmed ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="mb-3 size-12 text-emerald-500" />
              <h2 className="text-base font-bold text-slate-800">Check your email</h2>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                {mode === 'reset' ? (
                  <>
                    We sent a password reset link to <b>{email.trim()}</b>. Click it to choose a
                    new password.
                  </>
                ) : (
                  <>
                    We sent a confirmation link to <b>{email.trim()}</b>. Click it to activate
                    your account, then sign in.
                  </>
                )}
              </p>
              <Button variant="secondary" className="mt-5" onClick={() => switchMode('signin')}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              {/* Mode toggle (hidden while resetting a password) */}
              {mode !== 'reset' ? (
                <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  {(['signin', 'signup'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => switchMode(m)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                        mode === m
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {m === 'signin' ? 'Sign in' : 'Create account'}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="mb-6 flex items-center gap-1 text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
                >
                  <ArrowLeft className="size-4" /> Back to sign in
                </button>
              )}

              <form onSubmit={(e) => void submit(e)} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Email</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="auth-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                </label>

                {mode !== 'reset' && (
                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-600">
                      Password
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => switchMode('reset')}
                          className="font-semibold text-indigo-600 transition-colors hover:text-indigo-700 hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </span>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="auth-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                        className="pl-9 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </label>
                )}

                {mode !== 'reset' && (
                  <>
                    {/* Remember me — OFF by default: the session is kept only for
                        this tab, so opening the site later never auto-signs you in. */}
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="size-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                      />
                      <span className="text-sm font-medium text-slate-600">
                        Remember me on this device
                      </span>
                    </label>
                    {!remember && (
                      <p className="-mt-1 pl-6 text-xs text-slate-400">
                        You'll sign in again each time you open the site.
                      </p>
                    )}
                  </>
                )}

                {isLocked ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    Too many failed attempts. Try again in{' '}
                    <span className="tabular-nums">{formatCountdown(lock.retryInMs)}</span>.
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                      </div>
                    )}
                    {lock.remainingAttempts <= 2 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        {lock.remainingAttempts} attempt
                        {lock.remainingAttempts === 1 ? '' : 's'} remaining before a temporary
                        lockout.
                      </div>
                    )}
                  </>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={submitting || isLocked}>
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {mode === 'reset'
                        ? 'Sending…'
                        : mode === 'signin'
                          ? 'Signing in…'
                          : 'Creating account…'}
                    </span>
                  ) : mode === 'reset' ? (
                    'Send reset link'
                  ) : mode === 'signin' ? (
                    'Sign in'
                  ) : (
                    'Create account'
                  )}
                </Button>
              </form>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                <ShieldCheck className="size-3.5" />
                Protected by Supabase Auth — your data is private to your account
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
