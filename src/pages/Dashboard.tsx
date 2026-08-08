import { useMemo, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowUpRight,
  Building2,
  CloudOff,
  ReceiptText,
  Scale,
  Users,
  X,
} from 'lucide-react'
import { useData } from '../store/DataContext'
import {
  categoryBreakdown,
  computeTotals,
  monthlySeries,
  propertyPerformance,
  rangeLabel,
} from '../utils/reporting'
import {
  INCOME_CATEGORY_COLORS,
  EXPENSE_CATEGORY_COLORS,
} from '../lib/constants'
import { formatCurrency, formatDate, formatNumber } from '../lib/format'
import { StatCard } from '../components/StatCard'
import { Card, Badge } from '../components/ui'
import { DateRangeFilter, defaultRange } from '../components/DateRangeFilter'
import { CategoryDonutChart, IncomeExpenseTrendChart } from '../components/charts'
import type { PageKey } from '../components/Layout'

export function Dashboard({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  const { dataset, connection } = useData()
  const [range, setRange] = useState(defaultRange)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const inLocalMode = connection?.mode === 'local' || connection === null

  const totals = useMemo(
    () => computeTotals(dataset.incomes, dataset.expenses, range.start, range.end),
    [dataset, range],
  )
  const series = useMemo(
    () => monthlySeries(dataset.incomes, dataset.expenses, range.start, range.end),
    [dataset, range],
  )
  const incomeSlices = useMemo(
    () =>
      categoryBreakdown(
        dataset.incomes.filter((i) => i.date >= range.start && i.date <= range.end),
      ),
    [dataset, range],
  )
  const expenseSlices = useMemo(
    () =>
      categoryBreakdown(
        dataset.expenses.filter((e) => e.date >= range.start && e.date <= range.end),
      ),
    [dataset, range],
  )
  const perf = useMemo(
    () => propertyPerformance(dataset, range.start, range.end),
    [dataset, range],
  )

  const recent = useMemo(() => {
    const merged: Array<
      | { kind: 'income'; id: string; date: string; amount: number; label: string; sub: string }
      | { kind: 'expense'; id: string; date: string; amount: number; label: string; sub: string }
    > = [
      ...dataset.incomes.map((i) => ({
        kind: 'income' as const,
        id: i.id,
        date: i.date,
        amount: i.amount,
        label: i.category,
        sub: dataset.properties.find((p) => p.id === i.property_id)?.name ?? '—',
      })),
      ...dataset.expenses.map((e) => ({
        kind: 'expense' as const,
        id: e.id,
        date: e.date,
        amount: e.amount,
        label: e.category,
        sub: dataset.properties.find((p) => p.id === e.property_id)?.name ?? '—',
      })),
    ]
    return merged.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  }, [dataset])

  const totalUnits = dataset.units.length
  const occupiedUnits = dataset.units.filter((u) =>
    dataset.tenants.some((t) => t.unit_id === u.id && (!t.lease_end || t.lease_end >= new Date().toISOString().slice(0, 10))),
  ).length
  const occupancy = totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0
  const monthlyRentPotential = dataset.units.reduce((s, u) => s + u.rent_amount, 0)
  const cashMargin = totals.income > 0 ? (totals.net / totals.income) * 100 : 0

  // Most recent month in the range that actually has income recorded.
  const latestIncomeMonth = series.findLast((s) => s.income > 0) ?? null

  return (
    <div className="space-y-6">
      {inLocalMode && !bannerDismissed && (
        <div className="animate-fade-in-up flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <CloudOff className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <p className="font-bold text-amber-900">Running on local browser storage</p>
            <p className="mt-0.5 text-amber-800">
              Your data is saved in this browser only. Connect Supabase to sync to the cloud, enable
              receipts, and share across devices.
            </p>
            <button
              onClick={() => onNavigate('settings')}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-700 underline-offset-2 hover:underline"
            >
              Connect Supabase <ArrowUpRight className="size-3.5" />
            </button>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="rounded-lg p-1 text-amber-500 hover:bg-amber-100"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="animate-fade-in-up flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">Your numbers</p>
          <h2 className="font-display text-xl font-semibold tracking-tight text-slate-900">{rangeLabel(range)}</h2>
        </div>
        <DateRangeFilter range={range} onChange={setRange} />
      </div>

      <div className="animate-fade-in-up grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 [animation-delay:0.1s]">
        <StatCard
          label="Total Income"
          value={`+${formatCurrency(totals.income)}`}
          icon={<ArrowDownCircle className="size-5" />}
          accent="emerald"
          hint={`${formatNumber(dataset.incomes.length)} ${dataset.incomes.length === 1 ? 'income entry' : 'income entries'} all-time`}
        />
        <StatCard
          label="Total Expenses"
          value={`−${formatCurrency(totals.expense)}`}
          icon={<ArrowUpCircle className="size-5" />}
          accent="rose"
          hint={`${formatNumber(dataset.expenses.length)} ${dataset.expenses.length === 1 ? 'expense entry' : 'expense entries'} all-time`}
        />
        <StatCard
          label="Net Operating Income"
          value={`${totals.net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(totals.net))}`}
          icon={<Scale className="size-5" />}
          accent={totals.net >= 0 ? 'indigo' : 'rose'}
          hint={
            <span className={cashMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
              {cashMargin >= 0 ? '+' : ''}
              {cashMargin.toFixed(1)}% margin
            </span>
          }
        />
        <StatCard
          label="Occupancy"
          value={`${occupancy}%`}
          icon={<Users className="size-5" />}
          accent="indigo"
          hint={`${occupiedUnits} of ${totalUnits} units leased · ${formatCurrency(monthlyRentPotential)}/mo in rent`}
        />
      </div>

      <div className="animate-fade-in-up grid grid-cols-1 gap-4 xl:grid-cols-3 [animation-delay:0.2s]">
        <Card
          title="Monthly Income vs. Expenses"
          subtitle="The bars show money in and out; the line shows what's left"
          className="xl:col-span-2"
        >
          {series.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-400">
              No transactions in this period
            </div>
          ) : (
            <IncomeExpenseTrendChart data={series} />
          )}
        </Card>
        <div className="grid grid-cols-1 gap-4">
          <Card
            title="Income by Category"
            subtitle={
              latestIncomeMonth
                ? `Latest month: ${latestIncomeMonth.label} · +${formatCurrency(latestIncomeMonth.income)}`
                : 'No income in this period'
            }
          >
            <CategoryDonutChart data={incomeSlices} colors={INCOME_CATEGORY_COLORS} height={170} />
          </Card>
          <Card title="Expenses by Category">
            <CategoryDonutChart data={expenseSlices} colors={EXPENSE_CATEGORY_COLORS} height={170} />
          </Card>
        </div>
      </div>

      <div className="animate-fade-in-up grid grid-cols-1 gap-4 xl:grid-cols-3 [animation-delay:0.3s]">
        <Card title="Property Snapshot" className="xl:col-span-1">
          <div className="space-y-3">
            {perf.length === 0 && (
              <p className="text-sm text-slate-400">
                No properties yet.{' '}
                <button
                  onClick={() => onNavigate('properties')}
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Add one
                </button>
              </p>
            )}
            {perf.map((row) => (
              <div key={row.property.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                  <Building2 className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{row.property.name}</p>
                  <p className="text-xs text-slate-500">
                    {row.units.length} units · {Math.round(row.occupancyRate * 100)}% occupied
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${row.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.net >= 0 ? '+' : '−'}
                    {formatCurrency(Math.abs(row.net))}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Net ({rangeLabel(range).length > 14 ? 'period' : rangeLabel(range)})</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Badge color="indigo">{formatNumber(dataset.properties.length)} properties</Badge>
            <Badge color="indigo">{formatNumber(dataset.tenants.length)} tenants</Badge>
          </div>
        </Card>

        <Card title="Recent Activity" className="xl:col-span-2">
          {recent.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              No transactions recorded yet
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recent.map((r) => (
                <div key={`${r.kind}-${r.id}`} className="flex items-center gap-3 py-2.5">
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      r.kind === 'income'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                    }`}
                  >
                    {r.kind === 'income' ? (
                      <ArrowDownCircle className="size-4" />
                    ) : (
                      <ArrowUpCircle className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{r.label}</p>
                    <p className="truncate text-xs text-slate-500">
                      {r.sub} · {formatDate(r.date)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      r.kind === 'income' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {r.kind === 'income' ? '+' : '−'}
                    {formatCurrency(r.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="animate-fade-in-up flex items-center gap-2 text-xs text-slate-400 [animation-delay:0.4s]">
        <ReceiptText className="size-4" />
        Figures reflect transactions dated within the selected period.
      </div>
    </div>
  )
}
