import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpCircle, Download, ImageIcon, Paperclip, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useData } from '../store/DataContext'
import { useToast } from '../store/toast'
import { formatCurrency, formatDate, formatNumber } from '../lib/format'
import { downloadCSV, inRange, isDataUrl, receiptFileName } from '../utils/reporting'
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from '../lib/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Select, Textarea } from '../components/ui'
import { PropertySelect, UnitSelect } from '../components/forms'
import { DateRangeFilter, defaultRange } from '../components/DateRangeFilter'
import { expenseBadgeColor } from '../lib/categoryColors'

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function ExpenseFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Expense | null
}) {
  const { create, update, uploadReceipt } = useData()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('Cleaning & Maintenance')
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(editing?.date ?? '')
    setCategory(editing?.category ?? 'Cleaning & Maintenance')
    setAmount(editing ? String(editing.amount) : '')
    setVendor(editing?.vendor ?? '')
    setPropertyId(editing?.property_id ?? null)
    setUnitId(editing?.unit_id ?? null)
    setNotes(editing?.notes ?? '')
    setReceipt(editing?.receipt_url ?? null)
  }, [open, editing])

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
        category,
        amount: Math.round(amt * 100) / 100,
        vendor: vendor.trim(),
        notes: notes.trim(),
        receipt_url: receipt,
      }
      if (editing) {
        await update('expenses', editing.id, payload)
        toast('Expense updated', 'success')
      } else {
        await create('expenses', payload)
        toast('Expense recorded', 'success')
      }
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error')
    }
  }

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadReceipt(file)
      setReceipt(url)
      toast('Receipt attached', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Expense' : 'Record Expense'}
      description="Costs you paid — mortgage interest, repairs, taxes, insurance, and more."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={uploading}>
            {editing ? 'Save changes' : 'Record expense'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Amount ($)" required>
          <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="215.00" />
        </Field>
        <Field label="Category" required>
          <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor / payee">
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Appliance Pros" />
        </Field>
        <Field label="Property" required>
          <PropertySelect value={propertyId} onChange={(id) => { setPropertyId(id); setUnitId(null) }} />
        </Field>
        <Field label="Unit (optional)">
          <UnitSelect propertyId={propertyId} value={unitId} onChange={setUnitId} allowNone noneLabel="— Whole property —" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was the cost for, invoice #, warranty info…" />
        </Field>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
        <p className="mb-2 text-xs font-semibold text-slate-600">Receipt</p>
        {receipt ? (
          <div className="flex items-center gap-3">
            {isDataUrl(receipt) ? (
              <img src={receipt} alt="Receipt" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-lg border border-slate-200 bg-white text-indigo-500">
                <ImageIcon className="size-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-700">{receiptFileName(receipt)}</p>
              {!isDataUrl(receipt) && (
                <a href={receipt} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline">
                  Open in new tab
                </a>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setReceipt(null)}>
              <X className="size-4" /> Remove
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Paperclip className="size-4" /> {uploading ? 'Uploading…' : 'Attach receipt'}
            </Button>
            <span className="text-xs text-slate-400">JPG, PNG or PDF</span>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Expenses() {
  const { dataset, remove } = useData()
  const { toast } = useToast()
  const [modal, setModal] = useState<{ open: boolean; editing: Expense | null }>({ open: false, editing: null })
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [range, setRange] = useState(defaultRange)
  const [propertyFilter, setPropertyFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const inPeriod = inRange(dataset.expenses, range.start, range.end)
    return inPeriod
      .filter((e) => !propertyFilter || e.property_id === propertyFilter)
      .filter((e) => !categoryFilter || e.category === categoryFilter)
      .filter((e) => {
        if (!query.trim()) return true
        const q = query.toLowerCase()
        const prop = dataset.properties.find((p) => p.id === e.property_id)?.name ?? ''
        return [e.notes, e.vendor, e.category, prop].join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [dataset, range, propertyFilter, categoryFilter, query])

  const total = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered])

  const exportCSV = () => {
    downloadCSV(
      `expenses-${range.start}-to-${range.end}.csv`,
      ['Date', 'Property', 'Unit', 'Category', 'Amount', 'Vendor', 'Notes', 'Receipt'],
      filtered.map((e) => [
        e.date,
        dataset.properties.find((p) => p.id === e.property_id)?.name ?? '',
        dataset.units.find((u) => u.id === e.unit_id)?.unit_name ?? '',
        e.category,
        e.amount.toFixed(2),
        e.vendor,
        e.notes,
        e.receipt_url ?? '',
      ]),
    )
    toast('CSV downloaded', 'success')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter range={range} onChange={setRange} />
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="size-4" /> CSV
          </Button>
          <Button onClick={() => setModal({ open: true, editing: null })}>
            <Plus className="size-4" /> Record Expense
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
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-52">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total</span>
            <span className="text-base font-extrabold text-rose-600">{formatCurrency(total)}</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ArrowUpCircle className="size-12" />}
              title="No expenses in this period"
              description="Record your first expense, or widen the date range or filters."
              action={
                <Button onClick={() => setModal({ open: true, editing: null })}>
                  <Plus className="size-4" /> Record Expense
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
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Receipt</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((e) => {
                  const prop = dataset.properties.find((p) => p.id === e.property_id)
                  const unit = dataset.units.find((u) => u.id === e.unit_id)
                  return (
                    <tr key={e.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(e.date)}</td>
                      <td className="px-4 py-3">
                        <Badge color={expenseBadgeColor(e.category)}>{e.category}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{prop?.name ?? '—'}</p>
                        {unit && <p className="text-xs text-slate-400">{unit.unit_name}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{e.vendor || '—'}</td>
                      <td className="px-4 py-3">
                        {e.receipt_url ? (
                          <a
                            href={e.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                          >
                            <Paperclip className="size-3.5" /> View
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-rose-600">−{formatCurrency(e.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setModal({ open: true, editing: e })}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(e)}>
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
          {formatNumber(filtered.length)} entries · Attach receipts for easy tax documentation.
        </div>
      </Card>

      <ExpenseFormModal open={modal.open} onClose={() => setModal({ open: false, editing: null })} editing={modal.editing} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove('expenses', deleting.id)
            toast('Expense deleted', 'success')
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Delete failed', 'error')
          }
        }}
        title="Delete expense entry?"
        message={
          <>
            Delete the {deleting?.category.toLowerCase()} expense of{' '}
            <b>{formatCurrency(deleting?.amount ?? 0)}</b> on {formatDate(deleting?.date)}?
          </>
        }
      />
    </div>
  )
}
