import { CalendarRange } from 'lucide-react'
import type { ISODate } from '../lib/types'
import { todayISO } from '../lib/format'
import type { DateRange, DateRangePreset } from '../utils/reporting'
import { resolveRange } from '../utils/reporting'
import { Select } from './ui'

const PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
]

function currentQuarter(): number {
  return Math.floor(new Date().getMonth() / 3) + 1
}

function quarterLabel(q: number): string {
  return `Q${q}`
}

function buildRange(partial: Partial<DateRange> & { preset: DateRangePreset }): DateRange {
  const { preset, ...rest } = partial
  const base: DateRange = {
    preset,
    month: todayISO().slice(0, 7),
    quarter: currentQuarter(),
    year: new Date().getFullYear(),
    customStart: todayISO(),
    customEnd: todayISO(),
    start: '',
    end: '',
    label: '',
    ...rest,
  }
  const resolved = resolveRange(base)
  return { ...base, start: resolved.start, end: resolved.end }
}

export function DateRangeFilter({
  range,
  onChange,
}: {
  range: DateRange
  onChange: (r: DateRange) => void
}) {
  const years = (() => {
    const current = new Date().getFullYear()
    return [current - 1, current, current + 1]
  })()

  const setPreset = (preset: DateRangePreset) => {
    if (preset === 'month') {
      onChange(buildRange({ preset, month: todayISO().slice(0, 7) }))
    } else if (preset === 'quarter') {
      onChange(buildRange({ preset, quarter: currentQuarter(), year: new Date().getFullYear() }))
    } else if (preset === 'year') {
      onChange(buildRange({ preset, year: new Date().getFullYear() }))
    } else {
      onChange(buildRange({ preset, customStart: todayISO(), customEnd: todayISO() }))
    }
  }

  const setCustom = (field: 'customStart' | 'customEnd', value: ISODate) => {
    const next: DateRange = {
      ...range,
      preset: 'custom',
      customStart: field === 'customStart' ? value : range.customStart,
      customEnd: field === 'customEnd' ? value : range.customEnd,
    }
    const resolved = resolveRange(next)
    onChange({ ...next, start: resolved.start, end: resolved.end })
  }

  const monthInput =
    range.preset === 'month' ? (
      <Select
        value={range.month ?? todayISO().slice(0, 7)}
        onChange={(e) => onChange(buildRange({ preset: 'month', month: e.target.value }))}
        className="w-36"
        aria-label="Month"
      >
        {Array.from({ length: 24 }, (_, i) => {
          const d = new Date()
          d.setMonth(d.getMonth() - i)
          const key = d.toISOString().slice(0, 7)
          const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          return (
            <option key={key} value={key}>
              {label}
            </option>
          )
        })}
      </Select>
    ) : null

  const quarterInput =
    range.preset === 'quarter' ? (
      <div className="flex items-center gap-2">
        <Select
          value={range.quarter ?? currentQuarter()}
          onChange={(e) =>
            onChange(buildRange({ preset: 'quarter', quarter: Number(e.target.value), year: range.year }))
          }
          className="w-24"
          aria-label="Quarter"
        >
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>
              {quarterLabel(q)}
            </option>
          ))}
        </Select>
        <Select
          value={range.year ?? new Date().getFullYear()}
          onChange={(e) =>
            onChange(buildRange({ preset: 'quarter', quarter: range.quarter, year: Number(e.target.value) }))
          }
          className="w-28"
          aria-label="Year"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
    ) : null

  const yearInput =
    range.preset === 'year' ? (
      <Select
        value={range.year ?? new Date().getFullYear()}
        onChange={(e) => onChange(buildRange({ preset: 'year', year: Number(e.target.value) }))}
        className="w-28"
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    ) : null

  const customInput =
    range.preset === 'custom' ? (
      <div className="flex items-center gap-2">
        <input
          type="date"
          name="start-date"
          aria-label="Start date"
          value={range.customStart ?? ''}
          onChange={(e) => e.target.value && setCustom('customStart', e.target.value)}
          className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:focus:border-violet-400 dark:focus:ring-violet-500/25"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          name="end-date"
          aria-label="End date"
          value={range.customEnd ?? ''}
          onChange={(e) => e.target.value && setCustom('customEnd', e.target.value)}
          className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:focus:border-violet-400 dark:focus:ring-violet-500/25"
        />
      </div>
    ) : null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <CalendarRange className="size-3.5" />
        Period
      </span>
      <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-surface">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-2 text-xs font-semibold transition-colors ${
              range.preset === p.key
                ? 'bg-indigo-600 text-white dark:bg-violet-500 dark:text-indigo-950'
                : 'bg-surface text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {monthInput}
      {quarterInput}
      {yearInput}
      {customInput}
    </div>
  )
}

export function defaultRange(): DateRange {
  return buildRange({ preset: 'year', year: new Date().getFullYear() })
}

