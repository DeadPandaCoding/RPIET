import type {
  Dataset,
  Expense,
  Income,
  ISODate,
  Property,
  Tenant,
  Unit,
} from '../lib/types'
import { formatDate, formatMonthKey, monthKey, todayISO } from '../lib/format'

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export type DateRangePreset = 'month' | 'quarter' | 'year' | 'custom'

export interface DateRange {
  preset: DateRangePreset
  start: ISODate
  end: ISODate
  label: string
  month?: string // YYYY-MM
  quarter?: number // 1-4
  year?: number
  customStart?: ISODate
  customEnd?: ISODate
}

function lastDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(
    new Date(year, month + 1, 0).getDate(),
  ).padStart(2, '0')}`
}

export function resolveRange(range: DateRange): { start: ISODate; end: ISODate } {
  switch (range.preset) {
    case 'month': {
      const [y, m] = (range.month ?? todayISO().slice(0, 7)).split('-').map(Number)
      return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: lastDayOfMonth(y, m - 1) }
    }
    case 'quarter': {
      const q = range.quarter ?? 1
      const y = range.year ?? new Date().getFullYear()
      const startMonth = (q - 1) * 3
      return {
        start: `${y}-${String(startMonth + 1).padStart(2, '0')}-01`,
        end: lastDayOfMonth(y, startMonth + 2),
      }
    }
    case 'year': {
      const y = range.year ?? new Date().getFullYear()
      return { start: `${y}-01-01`, end: `${y}-12-31` }
    }
    case 'custom':
    default: {
      const start = range.customStart ?? todayISO()
      const end = range.customEnd ?? todayISO()
      return { start, end: end < start ? start : end }
    }
  }
}

export function rangeLabel(range: DateRange): string {
  const { start, end } = resolveRange(range)
  if (range.preset === 'month') return formatMonthKey(start.slice(0, 7))
  if (range.preset === 'quarter') return `Q${range.quarter} ${range.year}`
  if (range.preset === 'year') return String(range.year)
  return `${formatDate(start)} – ${formatDate(end)}`
}

// ---------------------------------------------------------------------------
// Filtering & totals
// ---------------------------------------------------------------------------

export function inRange<T extends { date: ISODate }>(records: T[], start: ISODate, end: ISODate): T[] {
  return records.filter((r) => r.date >= start && r.date <= end)
}

export interface Totals {
  income: number
  expense: number
  net: number
}

export function computeTotals(incomes: Income[], expenses: Expense[], start?: ISODate, end?: ISODate): Totals {
  const inc = start && end ? inRange(incomes, start, end) : incomes
  const exp = start && end ? inRange(expenses, start, end) : expenses
  const income = inc.reduce((s, i) => s + i.amount, 0)
  const expense = exp.reduce((s, e) => s + e.amount, 0)
  return { income, expense, net: income - expense }
}

// ---------------------------------------------------------------------------
// Monthly trend series (for charts)
// ---------------------------------------------------------------------------

export interface MonthPoint {
  key: string
  label: string
  income: number
  expense: number
  net: number
}

export function monthlySeries(
  incomes: Income[],
  expenses: Expense[],
  start: ISODate,
  end: ISODate,
): MonthPoint[] {
  const points = new Map<string, MonthPoint>()
  const cursor = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  while (cursor <= endDate) {
    const key = monthKey(cursor.toISOString().slice(0, 10))
    points.set(key, { key, label: formatMonthKey(key), income: 0, expense: 0, net: 0 })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  for (const i of inRange(incomes, start, end)) {
    const key = monthKey(i.date)
    const p = points.get(key)
    if (p) p.income += i.amount
  }
  for (const e of inRange(expenses, start, end)) {
    const key = monthKey(e.date)
    const p = points.get(key)
    if (p) p.expense += e.amount
  }
  for (const p of points.values()) p.net = p.income - p.expense
  return [...points.values()]
}

// ---------------------------------------------------------------------------
// Category breakdowns (for donut charts)
// ---------------------------------------------------------------------------

export interface CategorySlice {
  category: string
  amount: number
}

export function categoryBreakdown(records: Array<{ category: string; amount: number }>): CategorySlice[] {
  const map = new Map<string, number>()
  for (const r of records) map.set(r.category, (map.get(r.category) ?? 0) + r.amount)
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

// ---------------------------------------------------------------------------
// Property performance
// ---------------------------------------------------------------------------

export interface PropertyPerformanceRow {
  property: Property
  units: Unit[]
  activeTenants: Tenant[]
  occupiedUnits: number
  occupancyRate: number // 0-1
  monthlyRentPotential: number
  income: number
  expense: number
  net: number
}

export function isTenantActive(t: Tenant): boolean {
  return !t.lease_end || t.lease_end >= todayISO()
}

export function propertyPerformance(
  dataset: Dataset,
  start: ISODate,
  end: ISODate,
): PropertyPerformanceRow[] {
  const incRange = inRange(dataset.incomes, start, end)
  const expRange = inRange(dataset.expenses, start, end)
  const propertyIds = dataset.properties.map((p) => p.id)

  return dataset.properties.map((property) => {
    const units = dataset.units.filter((u) => u.property_id === property.id)
    const unitIds = new Set(units.map((u) => u.id))
    const activeTenants = dataset.tenants.filter(
      (t) => t.unit_id && unitIds.has(t.unit_id) && isTenantActive(t),
    )
    const occupiedUnits = new Set(
      activeTenants.map((t) => t.unit_id).filter(Boolean),
    ).size
    const income = incRange
      .filter((i) => i.property_id === property.id)
      .reduce((s, i) => s + i.amount, 0)
    const expense = expRange
      .filter((e) => e.property_id === property.id)
      .reduce((s, e) => s + e.amount, 0)
    const monthlyRentPotential = units.reduce((s, u) => s + u.rent_amount, 0)

    return {
      property,
      units,
      activeTenants,
      occupiedUnits,
      occupancyRate: units.length ? occupiedUnits / units.length : 0,
      monthlyRentPotential,
      income,
      expense,
      net: income - expense,
    }
  }).filter(() => propertyIds.length >= 0)
}

// ---------------------------------------------------------------------------
// Tenant payment history
// ---------------------------------------------------------------------------

export interface TenantPaymentRow {
  tenant: Tenant
  unit: Unit | undefined
  property: Property | undefined
  monthlyRent: number
  expectedRent: number
  rentReceived: number
  totalReceived: number
  outstanding: number
  deposits: number
  payments: Income[]
  leaseMonthsInRange: number
}

function monthsBetweenInclusive(a: Date, b: Date): number {
  if (b < a) return 0
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  return m + 1
}

function tenantLeaseMonths(t: Tenant, start: ISODate, end: ISODate): number {
  const rangeStart = new Date(`${start}T00:00:00`)
  const rangeEnd = new Date(`${end}T00:00:00`)
  const today = new Date(`${todayISO()}T00:00:00`)
  // Only count months that have already arrived — don't bill the future.
  const cappedEnd = today < rangeEnd ? today : rangeEnd
  const leaseStart = t.lease_start ? new Date(`${t.lease_start}T00:00:00`) : null
  const leaseEnd = t.lease_end ? new Date(`${t.lease_end}T00:00:00`) : null
  const effStart = leaseStart && leaseStart > rangeStart ? leaseStart : rangeStart
  const effEnd = leaseEnd && leaseEnd < cappedEnd ? leaseEnd : cappedEnd
  if (effEnd < effStart) return 0
  return monthsBetweenInclusive(effStart, effEnd)
}

export function tenantPaymentHistory(
  dataset: Dataset,
  start: ISODate,
  end: ISODate,
): TenantPaymentRow[] {
  const incRange = inRange(dataset.incomes, start, end)
  return dataset.tenants.map((tenant) => {
    const unit = dataset.units.find((u) => u.id === tenant.unit_id)
    const property = unit
      ? dataset.properties.find((p) => p.id === unit.property_id)
      : undefined
    const payments = incRange.filter((i) => i.tenant_id === tenant.id)
    const totalReceived = payments.reduce((s, i) => s + i.amount, 0)
    const rentReceived = payments
      .filter((i) => i.category === 'Monthly Rent')
      .reduce((s, i) => s + i.amount, 0)
    const deposits = payments
      .filter((i) => i.category === 'Security Deposit')
      .reduce((s, i) => s + i.amount, 0)
    const leaseMonthsInRange = tenantLeaseMonths(tenant, start, end)
    const expectedRent = leaseMonthsInRange * (unit?.rent_amount ?? 0)
    const outstanding = Math.max(expectedRent - rentReceived, 0)

    return {
      tenant,
      unit,
      property,
      monthlyRent: unit?.rent_amount ?? 0,
      expectedRent,
      rentReceived,
      totalReceived,
      outstanding,
      deposits,
      payments,
      leaseMonthsInRange,
    }
  })
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvEscape(value: string | number): string {
  let s = String(value)
  // CSV / formula-injection guard: a cell starting with = + - @ (or tab/CR)
  // is interpreted by Excel as a formula. Prefix it with a single quote so
  // it opens as plain text. Export amounts never start with these characters,
  // so numeric columns are unaffected.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCSV(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const content = [headers, ...rows]
    .map((r) => r.map(csvEscape).join(','))
    .join('\r\n')
  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface PdfSummaryLine {
  label: string
  value: string
}

export function exportPDF(opts: {
  title: string
  subtitle: string
  headers: string[]
  rows: Array<Array<string | number>>
  summary?: PdfSummaryLine[]
}): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(26, 37, 54) // Valora ink navy
  doc.text(opts.title, 40, 44)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(opts.subtitle, 40, 62)

  if (opts.summary && opts.summary.length) {
    let x = pageWidth - 40
    let y = 44
    for (const line of opts.summary) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(71, 85, 105)
      doc.text(`${line.label}:`, x, y, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(5, 150, 105)
      doc.text(line.value, x + 8, y, { align: 'right' })
      y += 14
    }
  }

  autoTable(doc, {
    head: [opts.headers],
    body: opts.rows.map((r) => r.map(String)),
    startY: opts.summary?.length ? 84 : 78,
    margin: { left: 40, right: 40 },
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [26, 37, 54], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  doc.save(`${opts.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`)
}

// ---------------------------------------------------------------------------
// Receipt helpers
// ---------------------------------------------------------------------------

export function isDataUrl(url: string | null): url is string {
  return !!url && url.startsWith('data:')
}

export function receiptFileName(url: string): string {
  if (!url) return ''
  const fromPath = url.split('/').pop() ?? ''
  return decodeURIComponent(fromPath) || 'receipt'
}
