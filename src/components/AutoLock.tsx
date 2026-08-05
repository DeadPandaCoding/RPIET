import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldAlert, TimerReset } from 'lucide-react'
import { useData } from '../store/DataContext'
import { Button } from './ui'
import { getAutoLockMinutes } from '../lib/prefs'

const WARN_SECONDS = 30

/**
 * Auto-lock: signs the user out after a configurable period of inactivity.
 *
 * Activity = pointer/keyboard/touch/scroll events, or the tab becoming
 * visible again. When the idle limit is reached a 30-second countdown
 * overlay appears; interacting with it (or anything on the page) cancels the
 * sign-out and restarts the timer. If nothing happens, the session is ended
 * server-side via the normal sign-out flow.
 */
export function AutoLock() {
  const { mode, user, signOut } = useData()
  const [minutes, setMinutes] = useState(getAutoLockMinutes)
  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARN_SECONDS)

  const idleTimer = useRef<number | null>(null)
  const countdownTimer = useRef<number | null>(null)

  const enabled = mode === 'supabase' && !!user && minutes > 0

  const clearTimers = useCallback(() => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
    if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current)
    idleTimer.current = null
    countdownTimer.current = null
  }, [])

  const resetIdle = useCallback(() => {
    if (!enabled) return
    clearTimers()
    setWarning(false)
    setSecondsLeft(WARN_SECONDS)
    idleTimer.current = window.setTimeout(() => {
      setWarning(true)
      countdownTimer.current = window.setInterval(() => {
        setSecondsLeft((s) => Math.max(0, s - 1))
      }, 1000)
    }, minutes * 60_000)
  }, [enabled, minutes, clearTimers])

  // When the countdown reaches zero, end the session. (Kept OUT of the state
  // updater — updaters must stay pure, and React may invoke them twice in
  // StrictMode.)
  const countdownDone = warning && secondsLeft <= 0
  useEffect(() => {
    if (!countdownDone) return
    clearTimers()
    setWarning(false)
    void signOut().catch(() => {
      // Even if the remote sign-out call fails, the local session is still
      // cleared by Supabase's signOut flow.
    })
  }, [countdownDone, clearTimers, signOut])

  // Follow preference changes made in Settings.
  useEffect(() => {
    const onChange = (e: Event) => setMinutes((e as CustomEvent<number>).detail)
    window.addEventListener('pl:autoLockChanged', onChange)
    return () => window.removeEventListener('pl:autoLockChanged', onChange)
  }, [])

  // Arm the watcher while signed in.
  useEffect(() => {
    if (!enabled) {
      clearTimers()
      setWarning(false)
      return
    }
    resetIdle()
    const events: (keyof WindowEventMap)[] = [
      'pointerdown',
      'keydown',
      'wheel',
      'touchstart',
      'scroll',
    ]
    const onActivity = () => resetIdle()
    const onVisible = () => {
      if (document.visibilityState === 'visible') resetIdle()
    }
    for (const ev of events) window.addEventListener(ev, onActivity)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimers()
      for (const ev of events) window.removeEventListener(ev, onActivity)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, resetIdle, clearTimers])

  if (!enabled || !warning) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="animate-modal-pop w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <ShieldAlert className="size-7" />
        </div>
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Still there?</h2>
        <p className="mt-1 text-sm text-slate-500">
          For your security, you'll be signed out in{' '}
          <span className="font-bold tabular-nums text-slate-900">{secondsLeft}s</span> due to
          inactivity.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              resetIdle()
            }}
          >
            <TimerReset className="size-4" /> I'm still here
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut().catch(() => {})}>
            Sign out now
          </Button>
        </div>
        <p className="mt-4 text-[11px] text-slate-400">
          Any activity on this page keeps you signed in.
        </p>
      </div>
    </div>
  )
}
