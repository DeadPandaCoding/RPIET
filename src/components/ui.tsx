import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertTriangle, Moon, Sun, X } from 'lucide-react'
import { getThemePref, setThemePref, type ThemePref } from '../lib/prefs'
import { resolveTheme } from '../lib/theme'

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const buttonVariants: Record<ButtonVariant, string> = {
  // Navy CTA in light; champagne-gold CTA on the navy canvas in dark.
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 focus-visible:ring-indigo-500 dark:bg-violet-500 dark:text-indigo-950 dark:hover:bg-violet-400 dark:shadow-violet-500/20 dark:focus-visible:ring-violet-400',
  secondary:
    'bg-surface text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400 dark:hover:bg-slate-200',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 shadow-sm shadow-rose-600/20 focus-visible:ring-rose-500 dark:bg-rose-500 dark:text-rose-950 dark:hover:bg-rose-400',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

/**
 * Light/dark toggle. Flips to the opposite explicit theme (overriding any
 * 'system' preference, which remains selectable from Settings). Stays in
 * sync with the preference and with OS changes while in 'system' mode.
 */
export function ThemeToggle({
  className = '',
  showLabel = false,
  iconClassName = 'size-4',
}: {
  className?: string
  /** Render an action-oriented label next to the icon (e.g. sidebar rows). */
  showLabel?: boolean
  iconClassName?: string
}) {
  const [dark, setDark] = useState(() => resolveTheme(getThemePref()) === 'dark')

  useEffect(() => {
    const onPrefChange = (e: Event) =>
      setDark(resolveTheme((e as CustomEvent<ThemePref>).detail) === 'dark')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = () => {
      if (getThemePref() === 'system') setDark(mq.matches)
    }
    window.addEventListener('pl:themeChanged', onPrefChange)
    mq.addEventListener('change', onSystemChange)
    return () => {
      window.removeEventListener('pl:themeChanged', onPrefChange)
      mq.removeEventListener('change', onSystemChange)
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => setThemePref(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={className}
    >
      {dark ? <Sun className={iconClassName} /> : <Moon className={iconClassName} />}
      {showLabel && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-surface shadow-sm ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h3 className="text-sm font-bold text-slate-800">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  required,
  hint,
  children,
  className = '',
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

const fieldBase =
  'w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:focus:border-violet-400 dark:focus:ring-violet-500/25'

// Auto-assign a stable per-mount id to every field so Chrome's console stops
// warning "A form field element should have an id or name attribute" for
// label-wrapped inputs. Explicit ids (e.g. #auth-email) still win.
let autoFieldId = 0
const nextFieldId = () => `valora-field-${++autoFieldId}`
const useAutoId = (explicit?: string) => useRef(explicit ?? nextFieldId()).current

export function Input({ className = '', id, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input id={useAutoId(id)} className={`${fieldBase} ${className}`} {...props} />
}

export function Select({ className = '', id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      id={useAutoId(id)}
      className={`${fieldBase} appearance-none bg-no-repeat pr-9 ${className}`}
      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E")', backgroundPosition: 'right 0.6rem center', backgroundRepeat: 'no-repeat' }}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({ className = '', id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea id={useAutoId(id)} className={`${fieldBase} min-h-[76px] resize-y ${className}`} {...props} />
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const badgeColors: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-900/60 dark:text-indigo-200 dark:ring-indigo-500/30',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30',
}

export function Badge({
  color = 'slate',
  children,
  className = '',
}: {
  color?: keyof typeof badgeColors
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeColors[color]} ${className}`}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-slate-300 dark:text-slate-500">{icon}</div>}
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-modal-pop my-4 w-full ${widths[size]} rounded-2xl bg-surface shadow-2xl dark:ring-1 dark:ring-white/10`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-rose-50 p-2 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
          <AlertTriangle className="size-5" />
        </div>
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </Modal>
  )
}
