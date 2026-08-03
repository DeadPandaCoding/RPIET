/**
 * Smoke test for the core data + reporting pipeline.
 * Run with: npx tsx test/smoke.ts
 */
import { buildSeedDataset } from '../src/lib/storage'
import {
  categoryBreakdown,
  computeTotals,
  monthlySeries,
  propertyPerformance,
  rangeLabel,
  resolveRange,
  tenantPaymentHistory,
} from '../src/utils/reporting'

let failures = 0

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`)
  } else {
    failures++
    console.error(`  ✗ FAIL: ${msg}`)
  }
}

const ds = buildSeedDataset()

console.log('Seed dataset:')
assert(ds.properties.length === 3, `3 properties (got ${ds.properties.length})`)
assert(ds.units.length === 7, `7 units (got ${ds.units.length})`)
assert(ds.tenants.length === 6, `6 tenants (got ${ds.tenants.length})`)
assert(ds.incomes.length > 30, `many income entries (got ${ds.incomes.length})`)
assert(ds.expenses.length > 40, `many expense entries (got ${ds.expenses.length})`)
assert(
  ds.incomes.every((i) => i.amount > 0 && i.property_id),
  'all incomes have positive amounts and a property',
)

// Date range resolution
const month = resolveRange({ preset: 'month', month: '2026-02', start: '', end: '', label: '' } as never)
assert(month.start === '2026-02-01' && month.end === '2026-02-28', `Feb 2026 month range (${month.start} → ${month.end})`)
const quarter = resolveRange({ preset: 'quarter', quarter: 2, year: 2026, start: '', end: '', label: '' } as never)
assert(quarter.start === '2026-04-01' && quarter.end === '2026-06-30', `Q2 2026 quarter range (${quarter.start} → ${quarter.end})`)

// Totals
const totals = computeTotals(ds.incomes, ds.expenses, '2026-01-01', '2026-12-31')
assert(totals.income > 0 && totals.expense > 0, `2026 totals: income=${totals.income.toFixed(0)} expense=${totals.expense.toFixed(0)}`)
assert(Math.abs(totals.net - (totals.income - totals.expense)) < 0.001, 'net = income - expense')

// Monthly series
const series = monthlySeries(ds.incomes, ds.expenses, '2026-01-01', '2026-12-31')
assert(series.length === 12, `12 months in 2026 series (got ${series.length})`)
assert(series.every((p) => p.income >= 0 && p.expense >= 0), 'monthly points have non-negative income/expense')
assert(
  Math.abs(series.reduce((s, p) => s + p.income, 0) - totals.income) < 0.001,
  'series income sums to total income',
)

// Category breakdown
const slices = categoryBreakdown(ds.incomes)
assert(slices[0].category === 'Monthly Rent', `largest income category is Monthly Rent (got ${slices[0]?.category})`)

// Property performance
const perf = propertyPerformance(ds, '2026-01-01', '2026-12-31')
assert(perf.length === 3, `performance rows for 3 properties (got ${perf.length})`)
for (const p of perf) {
  assert(p.income >= 0 && p.expense >= 0, `${p.property.name}: non-negative totals`)
}
assert(perf.some((p) => p.occupancyRate === 1), 'at least one fully occupied property')
const totalPerfIncome = perf.reduce((s, p) => s + p.income, 0)
assert(Math.abs(totalPerfIncome - totals.income) < 0.001, 'performance income sums to totals income')

// Tenant payment history
const tenants = tenantPaymentHistory(ds, '2026-01-01', '2026-12-31')
assert(tenants.length === 6, `payment history for 6 tenants (got ${tenants.length})`)
const emma = tenants.find((t) => t.tenant.name === 'Emma Rodriguez')
assert(!!emma && emma.monthlyRent === 1350, 'Emma has rent 1350/mo')
const emmaExpectedMonths = new Date().getMonth() + 1 // Jan .. current month
assert(!!emma && emma.expectedRent === 1350 * emmaExpectedMonths, `Emma expected through current month (got ${emma?.expectedRent})`)
assert(!!emma && emma.outstanding === 0, 'Emma is paid up')
const marcus = tenants.find((t) => t.tenant.name === 'Marcus Webb')
assert(!!marcus && marcus.expectedRent === 1850 * 6, `Marcus lease ends June → 6 months expected (got ${marcus?.expectedRent})`)

// Range label
console.log('Range labels:', rangeLabel({ preset: 'year', year: 2026, start: '', end: '', label: '' } as never))

if (failures === 0) {
  console.log('\nAll smoke tests passed ✅')
} else {
  console.error(`\n${failures} smoke test(s) failed ❌`)
  process.exit(1)
}
