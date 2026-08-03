import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useData } from '../store/DataContext'
import { useToast } from '../store/toast'
import { formatCurrency, formatDate, todayISO } from '../lib/format'
import { tenantPaymentHistory, type DateRange } from '../utils/reporting'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Textarea } from '../components/ui'
import { PropertySelect, UnitSelect } from '../components/forms'
import type { Tenant } from '../lib/types'

// ---------------------------------------------------------------------------
// Tenant form
// ---------------------------------------------------------------------------

function TenantFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Tenant | null
}) {
  const { create, update, dataset } = useData()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [leaseStart, setLeaseStart] = useState('')
  const [leaseEnd, setLeaseEnd] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setEmail(editing?.email ?? '')
    setPhone(editing?.phone ?? '')
    setLeaseStart(editing?.lease_start ?? '')
    setLeaseEnd(editing?.lease_end ?? '')
    setDueDate(editing?.rent_due_date ? String(editing.rent_due_date) : '')
    setNotes(editing?.notes ?? '')
    setUnitId(editing?.unit_id ?? null)
    const unit = editing ? dataset.units.find((u) => u.id === editing.unit_id) : undefined
    setPropertyId(unit?.property_id ?? null)
  }, [open, editing, dataset.units])

  const submit = async () => {
    if (!name.trim()) {
      toast('Tenant name is required', 'error')
      return
    }
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        unit_id: unitId,
        lease_start: leaseStart || null,
        lease_end: leaseEnd || null,
        rent_due_date: dueDate ? Math.min(Math.max(Number(dueDate), 1), 31) : null,
        notes: notes.trim(),
      }
      if (editing) {
        await update('tenants', editing.id, payload)
        toast('Tenant updated', 'success')
      } else {
        await create('tenants', payload)
        toast('Tenant added', 'success')
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
      title={editing ? 'Edit Tenant' : 'Add Tenant'}
      description="Assign a tenant to a unit and record lease details."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()}>{editing ? 'Save changes' : 'Add tenant'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </Field>
        <Field label="Rent due day of month" hint="1–31">
          <Input type="number" min={1} max={31} value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="1" />
        </Field>
        <Field label="Lease start">
          <Input type="date" value={leaseStart} onChange={(e) => setLeaseStart(e.target.value)} />
        </Field>
        <Field label="Lease end" hint="Leave blank for month-to-month">
          <Input type="date" value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} />
        </Field>
        <Field label="Property">
          <PropertySelect value={propertyId} onChange={setPropertyId} allowNone noneLabel="— Not assigned —" />
        </Field>
        <Field label="Unit">
          <UnitSelect propertyId={propertyId} value={unitId} onChange={setUnitId} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pet agreements, parking, special terms…" />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Tenants() {
  const { dataset, remove } = useData()
  const { toast } = useToast()
  const [modal, setModal] = useState<{ open: boolean; editing: Tenant | null }>({ open: false, editing: null })
  const [deleting, setDeleting] = useState<Tenant | null>(null)
  const [query, setQuery] = useState('')

  const yearRange: DateRange = useMemo(
    () => ({
      preset: 'year' as const,
      start: `${new Date().getFullYear()}-01-01`,
      end: `${new Date().getFullYear()}-12-31`,
      label: String(new Date().getFullYear()),
      year: new Date().getFullYear(),
    }),
    [],
  )
  const paymentRows = useMemo(
    () => tenantPaymentHistory(dataset, yearRange.start, yearRange.end),
    [dataset, yearRange],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return paymentRows
    return paymentRows.filter((r) => {
      const haystack = [r.tenant.name, r.tenant.email, r.tenant.phone, r.property?.name ?? '', r.unit?.unit_name ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [paymentRows, query])

  const currentYear = new Date().getFullYear()
  const today = todayISO()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tenants…"
            className="w-64 pl-9"
          />
        </div>
        <Button onClick={() => setModal({ open: true, editing: null })}>
          <Plus className="size-4" /> Add Tenant
        </Button>
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={<UserRound className="size-12" />}
          title={dataset.tenants.length === 0 ? 'No tenants yet' : 'No matching tenants'}
          description={
            dataset.tenants.length === 0
              ? 'Add tenants and assign them to units to track leases and payment history.'
              : 'Try a different search term.'
          }
          action={
            dataset.tenants.length === 0 ? (
              <Button onClick={() => setModal({ open: true, editing: null })}>
                <Plus className="size-4" /> Add Tenant
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((row) => {
          const t = row.tenant
          const active = !t.lease_end || t.lease_end >= today
          return (
            <Card key={t.id} padded={false} className="flex flex-col">
              <div className="flex items-start gap-3 p-5 pb-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-extrabold text-white shadow-sm">
                  {t.name
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-slate-900">{t.name}</h3>
                    <Badge color={active ? 'emerald' : 'slate'}>{active ? 'Active' : 'Lease ended'}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {row.property?.name ?? 'No property'} {row.unit ? `· ${row.unit.unit_name}` : ''}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 px-5 pb-3 text-xs text-slate-600">
                {t.email && (
                  <p className="flex items-center gap-2"><Mail className="size-3.5 text-slate-400" /> {t.email}</p>
                )}
                {t.phone && (
                  <p className="flex items-center gap-2"><Phone className="size-3.5 text-slate-400" /> {t.phone}</p>
                )}
                <p className="flex items-center gap-2">
                  <CalendarDays className="size-3.5 text-slate-400" />
                  {t.lease_start ? `${formatDate(t.lease_start)} → ${t.lease_end ? formatDate(t.lease_end) : 'ongoing'}` : 'No lease dates'}
                  {t.rent_due_date ? ` · due day ${t.rent_due_date}` : ''}
                </p>
              </div>

              <div className="mt-auto grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/60 px-2 py-3 text-center">
                <div className="px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rent/mo</p>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(row.monthlyRent)}</p>
                </div>
                <div className="px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Paid {currentYear}</p>
                  <p className="text-sm font-bold text-emerald-600">{formatCurrency(row.totalReceived)}</p>
                </div>
                <div className="px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Balance</p>
                  <p className={`text-sm font-bold ${row.outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {row.outstanding > 0 ? `−${formatCurrency(row.outstanding)}` : '✓'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1.5 border-t border-slate-100 px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => setModal({ open: true, editing: t })}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => setDeleting(t)}>
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <TenantFormModal open={modal.open} onClose={() => setModal({ open: false, editing: null })} editing={modal.editing} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove('tenants', deleting.id)
            toast('Tenant deleted', 'success')
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Delete failed', 'error')
          }
        }}
        title="Delete tenant?"
        message={
          <>
            Remove <b>{deleting?.name}</b>? Their unit will be freed and past income entries will be
            kept without a tenant link.
          </>
        }
      />
    </div>
  )
}
