import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, FileText } from 'lucide-react'
import { useData } from '../store/DataContext'
import { useToast } from '../store/toast'
import { formatCurrency, formatDate, formatNumber } from '../lib/format'
import {
  computeTotals,
  downloadCSV,
  exportPDF,
  propertyPerformance,
  rangeLabel,
  tenantPaymentHistory,
} from '../utils/reporting'
import { Button, Card, EmptyState } from '../components/ui'
import { DateRangeFilter, defaultRange } from '../components/DateRangeFilter'
import { PropertyNetChart } from '../components/charts'

type Tab = 'properties' | 'tenants'

export function Reports() {
  const { dataset } = useData()
  const { toast } = useToast()
  const [range, setRange] = useState(defaultRange)
  const [tab, setTab] = useState<Tab>('properties')
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)

  const totals = useMemo(
    () => computeTotals(dataset.incomes, dataset.expenses, range.start, range.end),
    [dataset, range],
  )
  const perfRows = useMemo(
    () => propertyPerformance(dataset, range.start, range.end),
    [dataset, range],
  )
  const tenantRows = useMemo(
    () => tenantPaymentHistory(dataset, range.start, range.end),
    [dataset, range],
  )
  const periodLabel = rangeLabel(range)

  // ---- Exports -------------------------------------------------------------

  const exportPropsCSV = () => {
    downloadCSV(
      `property-performance-${range.start}-to-${range.end}.csv`,
      ['Property', 'Address', 'Units', 'Occupied', 'Occupancy %', 'Monthly Rent Potential', 'Income', 'Expenses', 'Net Income'],
      perfRows.map((r) => [
        r.property.name,
        r.property.address,
        r.units.length,
        r.occupiedUnits,
        `${Math.round(r.occupancyRate * 100)}%`,
        r.monthlyRentPotential.toFixed(2),
        r.income.toFixed(2),
        r.expense.toFixed(2),
        r.net.toFixed(2),
      ]),
    )
    toast('Property performance CSV downloaded', 'success')
  }

  const exportPropsPDF = () => {
    exportPDF({
      title: 'Property Performance Report',
      subtitle: `Portfolio comparison · ${periodLabel}`,
      summary: [
        { label: 'Total Income', value: formatCurrency(totals.income) },
        { label: 'Total Expenses', value: formatCurrency(totals.expense) },
        { label: 'Net Income', value: formatCurrency(totals.net) },
      ],
      headers: ['Property', 'Units', 'Occupied', 'Occupancy', 'Potential/mo', 'Income', 'Expenses', 'Net'],
      rows: perfRows.map((r) => [
        r.property.name,
        r.units.length,
        r.occupiedUnits,
        `${Math.round(r.occupancyRate * 100)}%`,
        formatCurrency(r.monthlyRentPotential),
        formatCurrency(r.income),
        formatCurrency(r.expense),
        formatCurrency(r.net),
      ]),
    })
    toast('PDF report downloaded', 'success')
  }

  const exportTenantCSV = () => {
    downloadCSV(
      `tenant-payments-${range.start}-to-${range.end}.csv`,
      ['Tenant', 'Property', 'Unit', 'Rent/Month', 'Lease Months', 'Expected Rent', 'Rent Received', 'Total Received', 'Outstanding', 'Deposits'],
      tenantRows.map((r) => [
        r.tenant.name,
        r.property?.name ?? '',
        r.unit?.unit_name ?? '',
        r.monthlyRent.toFixed(2),
        r.leaseMonthsInRange,
        r.expectedRent.toFixed(2),
        r.rentReceived.toFixed(2),
        r.totalReceived.toFixed(2),
        r.outstanding.toFixed(2),
        r.deposits.toFixed(2),
      ]),
    )
    toast('Tenant payments CSV downloaded', 'success')
  }

  const exportTenantPDF = () => {
    const withOutstanding = tenantRows.filter((r) => r.outstanding > 0)
    const totalOutstanding = tenantRows.reduce((s, r) => s + r.outstanding, 0)
    exportPDF({
      title: 'Tenant Payment History',
      subtitle: `Per tenant · ${periodLabel}`,
      summary: [
        { label: 'Expected Rent', value: formatCurrency(tenantRows.reduce((s, r) => s + r.expectedRent, 0)) },
        { label: 'Rent Received', value: formatCurrency(tenantRows.reduce((s, r) => s + r.rentReceived, 0)) },
        { label: 'Outstanding', value: formatCurrency(totalOutstanding) },
      ],
      headers: ['Tenant', 'Property', 'Unit', 'Rent/Month', 'Expected', 'Received', 'Outstanding', 'Deposits'],
      rows: tenantRows.map((r) => [
        r.tenant.name,
        r.property?.name ?? '',
        r.unit?.unit_name ?? '',
        formatCurrency(r.monthlyRent),
        formatCurrency(r.expectedRent),
        formatCurrency(r.rentReceived),
        formatCurrency(r.outstanding),
        formatCurrency(r.deposits),
      ]),
    })
    toast(
      withOutstanding.length > 0 ? `PDF exported — ${withOutstanding.length} tenant(s) have outstanding balances` : 'PDF report downloaded',
      withOutstanding.length > 0 ? 'info' : 'success',
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter range={range} onChange={setRange} />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={tab === 'properties' ? exportPropsCSV : exportTenantCSV}
            disabled={tab === 'properties' ? perfRows.length === 0 : tenantRows.length === 0}
          >
            <Download className="size-4" /> CSV
          </Button>
          <Button
            variant="secondary"
            onClick={tab === 'properties' ? exportPropsPDF : exportTenantPDF}
            disabled={tab === 'properties' ? perfRows.length === 0 : tenantRows.length === 0}
          >
            <FileText className="size-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Income</p>
          <p className="mt-1 text-xl font-extrabold text-emerald-700">{formatCurrency(totals.income)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Expenses</p>
          <p className="mt-1 text-xl font-extrabold text-rose-700">{formatCurrency(totals.expense)}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${totals.net >= 0 ? 'border-indigo-200 bg-indigo-50' : 'border-rose-200 bg-rose-50'}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Net (NOI)</p>
          <p className={`mt-1 text-xl font-extrabold ${totals.net >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>{formatCurrency(totals.net)}</p>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1 sm:w-fit">
        {(
          [
            { key: 'properties', label: 'Property Performance' },
            { key: 'tenants', label: 'Tenant Payment History' },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all sm:flex-none ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'properties' && (
        <div className="space-y-4">
          {perfRows.length === 0 ? (
            <EmptyState title="No properties to compare" description="Add properties to see performance comparisons." />
          ) : (
            <>
              <Card title="Net Income by Property" subtitle="Income, expenses, and net across the portfolio">
                <PropertyNetChart rows={perfRows} />
              </Card>

              <Card padded={false} title={`Property Comparison · ${periodLabel}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="px-4 py-3 font-semibold">Property</th>
                        <th className="px-4 py-3 text-center font-semibold">Units</th>
                        <th className="px-4 py-3 text-center font-semibold">Occupied</th>
                        <th className="px-4 py-3 text-center font-semibold">Occupancy</th>
                        <th className="px-4 py-3 text-right font-semibold">Potential/mo</th>
                        <th className="px-4 py-3 text-right font-semibold">Income</th>
                        <th className="px-4 py-3 text-right font-semibold">Expenses</th>
                        <th className="px-4 py-3 text-right font-semibold">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {perfRows.map((r) => (
                        <tr key={r.property.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{r.property.name}</p>
                            <p className="text-xs text-slate-400">{r.property.address}</p>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-600">{r.units.length}</td>
                          <td className="px-4 py-3 text-center text-slate-600">{r.occupiedUnits}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-bold ${r.occupancyRate >= 1 ? 'text-emerald-600' : r.occupancyRate >= 0.5 ? 'text-sky-600' : 'text-amber-600'}`}>
                              {Math.round(r.occupancyRate * 100)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(r.monthlyRentPotential)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(r.income)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-rose-600">{formatCurrency(r.expense)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${r.net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{formatCurrency(r.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === 'tenants' && (
        <div className="space-y-4">
          {tenantRows.length === 0 ? (
            <EmptyState title="No tenants to report" description="Add tenants and record income to see payment history." />
          ) : (
            <Card padded={false} title={`Tenant Payment History · ${periodLabel}`} subtitle="Expected rent is calculated from leases within the selected period">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-semibold" />
                      <th className="px-4 py-3 font-semibold">Tenant</th>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 text-right font-semibold">Rent/mo</th>
                      <th className="px-4 py-3 text-right font-semibold">Expected</th>
                      <th className="px-4 py-3 text-right font-semibold">Received</th>
                      <th className="px-4 py-3 text-right font-semibold">Deposits</th>
                      <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tenantRows.map((r) => {
                      const open = expandedTenant === r.tenant.id
                      return (
                        <Fragment key={r.tenant.id}>
                          <tr className="transition-colors hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setExpandedTenant(open ? null : r.tenant.id)}
                                className="flex size-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                aria-label="Toggle payment history"
                              >
                                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800">{r.tenant.name}</p>
                              <p className="text-xs text-slate-400">{r.property?.name ?? '—'}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{r.unit?.unit_name ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(r.monthlyRent)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(r.expectedRent)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(r.rentReceived)}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{r.deposits > 0 ? formatCurrency(r.deposits) : '—'}</td>
                            <td className={`px-4 py-3 text-right font-bold ${r.outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {r.outstanding > 0 ? formatCurrency(r.outstanding) : '✓'}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={8} className="bg-slate-50/70 px-6 py-4">
                                <TenantPaymentDetail tenantId={r.tenant.id} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400">
        {formatNumber(perfRows.length)} properties · {formatNumber(tenantRows.length)} tenants · Exports reflect the selected period ({periodLabel}).
      </p>
    </div>
  )
}

function TenantPaymentDetail({ tenantId }: { tenantId: string }) {
  const { dataset } = useData()
  const payments = dataset.incomes
    .filter((i) => i.tenant_id === tenantId)
    .sort((a, b) => b.date.localeCompare(a.date))
  if (payments.length === 0) {
    return <p className="text-xs text-slate-500">No income recorded for this tenant.</p>
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {payments.map((p) => (
        <div key={p.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">{p.category}</span>
            <span className="text-xs font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {formatDate(p.date)} · {p.payment_method}
          </p>
        </div>
      ))}
    </div>
  )
}
