import { useEffect, useMemo, useState } from 'react'
import { ArrowDownCircle, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useData } from '../store/DataContext'
import { useToast } from '../store/toast'
import { formatCurrency, formatDate, formatNumber } from '../lib/format'
import { downloadCSV, inRange } from '../utils/reporting'
import { INCOME_CATEGORIES, PAYMENT_METHODS, type Income, type IncomeCategory, type PaymentMethod } from '../lib/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { PropertySelect, TenantSelect, UnitSelect } from '../components/forms'
import { DateRangeFilter, defaultRange } from '../components/DateRangeFilter'
import { categoryColorFor } from '../lib/categoryColors'

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function IncomeFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Income | null
}) {
  const { create, update, dataset } = useData()
  const { toast } = useToast()
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<IncomeCategory>('Monthly Rent')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('Zelle')
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setDate(editing?.date ?? '')
    setCategory(editing?.category ?? 'Monthly Rent')
    setAmount(editing ? String(editing.amount) : '')
    setMethod(editing?.payment_method ?? 'Zelle')
    setPropertyId(editing?.property_id ?? null)
    setUnitId(editing?.unit_id ?? null)
    setTenantId(editing?.tenant_id ?? null)
    setNotes(editing?.notes ?? '')
  }, [open, editing])

  const tenantOptions = useMemo(() => {
    if (!unitId) return dataset.tenants
    return dataset.tenants.filter((t) => t.unit_id === unitId)
  }, [dataset.tenants, unitId])

  const submit = async () => {
    if (!date || !propertyId) {
      toast('Date and property are required', 'error')
      return
    }
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt < 0) {
      toast('Enter a valid amount', 'error')
      return
    }
    try {
      const payload = {
        date,
        property_id: propertyId,
        unit_id: unitId,
        tenant_id: tenantId,
        category,
        amount: Math.round(amt * 100) / 100,
        payment_method: method,
        notes: notes.trim(),
      }
      if (editing) {
        await update('incomes', editing.id, payload)
        toast('Income entry updated', 'success')
      } else {
        await create('incomes', payload)
        toast('Income recorded', 'success')
      }
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Income' : 'Record Income'}
      description="Rent, deposits, fees, or reimbursements received."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={() => void submit()}>{editing ? 'Save changes' : 'Record income'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Amount ($)" required>
          <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1350.00" />
        </Field>
        <Field label="Category" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value as IncomeCategory)}>
            {INCOME_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Payment method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Property" required>
          <PropertySelect value={propertyId} onChange={(id) => { setPropertyId(id); setUnitId(null); setTenantId(null) }} />
        </Field>
        <Field label="Unit">
          <UnitSelect propertyId={propertyId} value={unitId} onChange={(id) => { setUnitId(id); setTenantId(null) }} allowNone />
        </Field>
        <Field label="Tenant">
          <TenantSelect value={tenantId} onChange={setTenantId} noneLabel="— No tenant —" />
        </Field>
        <div className="sm:col-span-2" />
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receipt #, reference, payment details…" />
        </Field>
      </div>
      {tenantOptions.length === 0 && unitId && (
        <p className="mt-2 text-xs text-amber-600">No tenants are currently assigned to this unit.</p>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function Incomes() {
  const { dataset, remove } = useData()
  const { toast } = useToast()
  const [modal, setModal] = useState<{ open: boolean; editing: Income | null }>({ open: false, editing: null })
  const [deleting, setDeleting] = useState<Income | null>(null)
  const [range, setRange] = useState(defaultRange)
  const [propertyFilter, setPropertyFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const inPeriod = inRange(dataset.incomes, range.start, range.end)
    return inPeriod
      .filter((i) => !propertyFilter || i.property_id === propertyFilter)
      .filter((i) => !categoryFilter || i.category === categoryFilter)
      .filter((i) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        const prop = dataset.properties.find((p) => p.id === i.property_id)?.name ?? ''
        const unit = dataset.units.find((u) => u.id === i.unit_id)?.unit_name ?? ''
        const tenant = dataset.tenants.find((t) => t.id === i.tenant_id)?.name ?? ''
        return [i.notes, i.payment_method, prop, unit, tenant].join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [dataset, range, propertyFilter, categoryFilter, query])

  const total = useMemo(() => filtered.reduce((s, i) => s + i.amount, 0), [filtered])

  const exportCSV = () => {
    downloadCSV(
      `income-${range.start}-to-${range.end}.csv`,
      ['Date', 'Property', 'Unit', 'Tenant', 'Category', 'Amount', 'Payment Method', 'Notes'],
      filtered.map((i) => [
        i.date,
        dataset.properties.find((p) => p.id === i.property_id)?.name ?? '',
        dataset.units.find((u) => u.id === i.unit_id)?.unit_name ?? '',
        dataset.tenants.find((t) => t.id === i.tenant_id)?.name ?? '',
        i.category,
        i.amount.toFixed(2),
        i.payment_method,
        i.notes,
      ]),
    )
    toast('CSV downloaded', 'success')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter range={range} onChange={setRange} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="success" onClick={() => setModal({ open: true, editing: null })}>
            <Plus className="size-4" /> Record Income
          </Button>
        </div>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-52 pl-9" />
          </div>
          <Select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="w-56">
            <option value="">All properties</option>
            {dataset.properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-48">
            <option value="">All categories</option>
            {INCOME_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total</span>
            <span className="font-display text-base font-semibold text-emerald-600">+{formatCurrency(total)}</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ArrowDownCircle className="size-12" />}
              title="No income in this period"
              description="Record your first income entry, or widen the date range or filters."
              action={
                <Button variant="success" onClick={() => setModal({ open: true, editing: null })}>
                  <Plus className="size-4" /> Record Income
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Property / Unit</th>
                  <th className="px-4 py-3 font-semibold">Tenant</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((i) => {
                  const prop = dataset.properties.find((p) => p.id === i.property_id)
                  const unit = dataset.units.find((u) => u.id === i.unit_id)
                  const tenant = dataset.tenants.find((t) => t.id === i.tenant_id)
                  return (
                    <tr key={i.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(i.date)}</td>
                      <td className="px-4 py-3">
                        <Badge color={categoryColorFor(i.category)}>{i.category}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{prop?.name ?? '—'}</p>
                        {unit && <p className="text-xs text-slate-400">{unit.unit_name}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{tenant?.name ?? '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{i.payment_method}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-emerald-600">+{formatCurrency(i.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setModal({ open: true, editing: i })}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(i)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
          {formatNumber(filtered.length)} {filtered.length === 1 ? 'entry' : 'entries'} · Export for taxes anytime via the CSV button.
        </div>
      </Card>

      <IncomeFormModal open={modal.open} onClose={() => setModal({ open: false, editing: null })} editing={modal.editing} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove('incomes', deleting.id)
            toast('Income entry deleted', 'success')
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Delete failed', 'error')
          }
        }}
        title="Delete income entry?"
        message={
          <>
            Delete the {deleting?.category.toLowerCase()} entry for{' '}
            <b>{formatCurrency(deleting?.amount ?? 0)}</b> on {formatDate(deleting?.date)}?
          </>
        }
      />
    </div>
  )
}
