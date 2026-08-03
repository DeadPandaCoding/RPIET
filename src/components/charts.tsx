import {
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

const INCOME_COLOR = '#10b981'
const EXPENSE_COLOR = '#f43f5e'
const NET_COLOR = '#6366f1'

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
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xl">
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
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={{ stroke: '#e2e8f0' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#64748b' }}
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
        <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="expense" name="Expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={26} />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
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
