import type { ReactNode } from 'react'

const accents = {
  emerald:
    'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30',
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
} as const

export function StatCard({
  label,
  value,
  icon,
  accent = 'indigo',
  hint,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  accent?: keyof typeof accents
  hint?: ReactNode
}) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:border-slate-300/60">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="font-display mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
        </div>
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-110 ${accents[accent]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}
