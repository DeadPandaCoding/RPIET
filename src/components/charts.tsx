import { useId } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatCurrencyCompact } from '../lib/format'
import type { CategorySlice, MonthPoint, PropertyPerformanceRow } from '../utils/reporting'

// Palette: emerald = income, crimson red = expenses, champagne gold = net/mixed stats.
const INCOME_COLOR = '#10b981'
const EXPENSE_COLOR = '#ef4444'
const NET_COLOR = '#a88443'

// ---------------------------------------------------------------------------
// Shared tooltip
// ---------------------------------------------------------------------------

function CurrencyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color?: string; dataKey?: string | number }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-surface px-3.5 py-2.5 shadow-xl">
      <p className="mb-1.5 text-xs font-bold text-slate-700">{label}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5 text-xs">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: p.color ?? '#94a3b8' }}
          />
          <span className="font-medium capitalize text-slate-500">{p.name}:</span>
          <span className="font-bold text-slate-800">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Income vs expense trend (bars + net line)
// ---------------------------------------------------------------------------

export function IncomeExpenseTrendChart({ data }: { data: MonthPoint[] }) {
  // Unique gradient ids in case more than one instance ever mounts.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const incomeFillId = `incomeFill-${uid}`
  const expenseFillId = `expenseFill-${uid}`
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          {/* Faint 5–10% area tints beneath the income/expense trend lines */}
          <linearGradient id={incomeFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.1} />
            <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={expenseFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.1} />
            <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--chart-tick)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatCurrencyCompact(v)}
        />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
        <Legend
          formatter={(value: string) => (
            <span className="text-xs font-semibold capitalize text-slate-600">{value}</span>
          )}
          iconType="circle"
          iconSize={8}
        />
        <Area
          type="monotone"
          dataKey="income"
          name="Income"
          stroke={INCOME_COLOR}
          strokeWidth={2.5}
          fill={`url(#${incomeFillId})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="expense"
          name="Expenses"
          stroke={EXPENSE_COLOR}
          strokeWidth={2.5}
          fill={`url(#${expenseFillId})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="net"
          name="Net"
          stroke={NET_COLOR}
          strokeWidth={2.5}
          dot={{ r: 3, fill: NET_COLOR, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Category donut
// ---------------------------------------------------------------------------

export function CategoryDonutChart({
  data,
  colors,
  height = 240,
}: {
  data: CategorySlice[]
  colors: Record<string, string>
  height?: number
}) {
  const total = data.reduce((s, d) => s + d.amount, 0)
  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400">
        No data in this period
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2" style={{ height }}>
      <ResponsiveContainer width="55%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            innerRadius="58%"
            outerRadius="85%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d) => (
              <Cell key={d.category} fill={colors[d.category] ?? '#94a3b8'} />
            ))}
          </Pie>
          <Tooltip content={<CurrencyTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1.5">
        {data.slice(0, 6).map((d) => (
          <div key={d.category} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[d.category] ?? '#94a3b8' }} />
            <span className="truncate font-medium text-slate-600">{d.category}</span>
            <span className="ml-auto font-bold text-slate-800">
              {total > 0 ? `${Math.round((d.amount / total) * 100)}%` : '0%'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Property net income bars
// ---------------------------------------------------------------------------

export function PropertyNetChart({ rows }: { rows: PropertyPerformanceRow[] }) {
  const data = rows.map((r) => ({
    name: r.property.name.length > 22 ? `${r.property.name.slice(0, 22)}…` : r.property.name,
    Income: Math.round(r.income * 100) / 100,
    Expenses: Math.round(r.expense * 100) / 100,
    Net: Math.round(r.net * 100) / 100,
  }))
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-xs text-slate-400">No properties yet</div>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 64)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barGap={3}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--chart-tick)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: 'var(--chart-tick-strong)' }} axisLine={false} tickLine={false} />
        <Tooltip content={<CurrencyTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
        <Legend
          formatter={(value: string) => (
            <span className="text-xs font-semibold capitalize text-slate-600">{value}</span>
          )}
          iconType="circle"
          iconSize={8}
        />
        <Bar dataKey="Income" fill={INCOME_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} />
        <Bar dataKey="Expenses" fill={EXPENSE_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} />
        <Bar dataKey="Net" fill={NET_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}
