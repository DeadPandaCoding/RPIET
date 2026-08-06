import { useEffect, useMemo, useState } from 'react'
import {
  BedDouble,
  Building2,
  ChevronDown,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useData } from '../store/DataContext'
import { useToast } from '../store/toast'
import { formatCurrency, formatNumber } from '../lib/format'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Textarea } from '../components/ui'
import type { Property, Unit } from '../lib/types'

// ---------------------------------------------------------------------------
// Property form
// ---------------------------------------------------------------------------

function PropertyFormModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Property | null
}) {
  const { create, update } = useData()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setAddress(editing?.address ?? '')
    setNotes(editing?.notes ?? '')
  }, [open, editing])

  const submit = async () => {
    if (!name.trim() || !address.trim()) {
      toast('Name and address are required', 'error')
      return
    }
    try {
      if (editing) {
        await update('properties', editing.id, { name: name.trim(), address: address.trim(), notes: notes.trim() })
        toast('Property updated', 'success')
      } else {
        await create('properties', { name: name.trim(), address: address.trim(), notes: notes.trim() })
        toast('Property added', 'success')
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
      title={editing ? 'Edit Property' : 'Add Property'}
      description="A property contains one or more rental units."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()}>{editing ? 'Save changes' : 'Add property'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Property name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maple Grove Apartments" autoFocus />
        </Field>
        <Field label="Address" required>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="124 Maple Street, Springfield" />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Maintenance schedule, reminders, etc." />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Unit form
// ---------------------------------------------------------------------------

function UnitFormModal({
  open,
  onClose,
  propertyId,
  editing,
}: {
  open: boolean
  onClose: () => void
  propertyId: string
  editing: Unit | null
}) {
  const { create, update } = useData()
  const { toast } = useToast()
  const [unitName, setUnitName] = useState('')
  const [rent, setRent] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setUnitName(editing?.unit_name ?? '')
    setRent(editing ? String(editing.rent_amount) : '')
    setNotes(editing?.notes ?? '')
  }, [open, editing])

  const submit = async () => {
    if (!unitName.trim()) {
      toast('Unit number/name is required', 'error')
      return
    }
    const rentAmount = Math.max(0, Number(rent) || 0)
    try {
      if (editing) {
        await update('units', editing.id, { unit_name: unitName.trim(), rent_amount: rentAmount, notes: notes.trim() })
        toast('Unit updated', 'success')
      } else {
        await create('units', { property_id: propertyId, unit_name: unitName.trim(), rent_amount: rentAmount, notes: notes.trim() })
        toast('Unit added', 'success')
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
      title={editing ? 'Edit Unit' : 'Add Unit'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()}>{editing ? 'Save changes' : 'Add unit'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Unit number / name" required>
          <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="e.g. 2B" autoFocus />
        </Field>
        <Field label="Rent amount ($/month)" required>
          <Input type="number" min={0} step="0.01" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="1350" />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bedrooms, features, condition…" />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Properties() {
  const { dataset, remove } = useData()
  const { toast } = useToast()

  const [propModal, setPropModal] = useState<{ open: boolean; editing: Property | null }>({ open: false, editing: null })
  const [unitModal, setUnitModal] = useState<{ open: boolean; propertyId: string | null; editing: Unit | null }>({ open: false, propertyId: null, editing: null })
  const [deleteProp, setDeleteProp] = useState<Property | null>(null)
  const [deleteUnit, setDeleteUnit] = useState<Unit | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const stats = useMemo(() => {
    const map = new Map<
      string,
      { units: number; occupied: number; rentPotential: number; income: number; expense: number }
    >()
    for (const p of dataset.properties) {
      map.set(p.id, { units: 0, occupied: 0, rentPotential: 0, income: 0, expense: 0 })
    }
    for (const u of dataset.units) {
      const s = map.get(u.property_id)
      if (s) {
        s.units += 1
        s.rentPotential += u.rent_amount
        if (dataset.tenants.some((t) => t.unit_id === u.id && (!t.lease_end || t.lease_end >= new Date().toISOString().slice(0, 10)))) {
          s.occupied += 1
        }
      }
    }
    for (const i of dataset.incomes) {
      const s = map.get(i.property_id)
      if (s) s.income += i.amount
    }
    for (const e of dataset.expenses) {
      const s = map.get(e.property_id)
      if (s) s.expense += e.amount
    }
    return map
  }, [dataset])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="animate-fade-in-up space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {formatNumber(dataset.properties.length)} properties · {formatNumber(dataset.units.length)} units
        </p>
        <Button onClick={() => setPropModal({ open: true, editing: null })}>
          <Plus className="size-4" /> Add Property
        </Button>
      </div>

      {dataset.properties.length === 0 && (
        <EmptyState
          icon={<Building2 className="size-12" />}
          title="No properties yet"
          description="Add your first property to start tracking units, tenants, income, and expenses."
          action={
            <Button onClick={() => setPropModal({ open: true, editing: null })}>
              <Plus className="size-4" /> Add Property
            </Button>
          }
        />
      )}

      <div className="space-y-4">
        {dataset.properties.map((p) => {
          const s = stats.get(p.id)
          const isOpen = expanded.has(p.id)
          const units = dataset.units.filter((u) => u.property_id === p.id)
          const occRate = s && s.units ? Math.round((s.occupied / s.units) * 100) : 0
          return (
            <Card key={p.id} padded={false} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-4 p-5">
                <button
                  onClick={() => toggleExpand(p.id)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-900/60 dark:text-indigo-300 dark:hover:bg-indigo-900"
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                >
                  {isOpen ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{p.name}</h3>
                    {occRate === 100 ? <Badge color="emerald">Full</Badge> : occRate >= 50 ? <Badge color="sky">{occRate}% occupied</Badge> : <Badge color="amber">{occRate}% occupied</Badge>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="size-3.5" /> {p.address}
                  </p>
                  {p.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{p.notes}</p>}
                </div>
                <div className="grid grid-cols-3 gap-6 text-right">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Units</p>
                    <p className="text-sm font-bold text-slate-800">{s?.units ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Net (all-time)</p>
                    <p className={`text-sm font-bold ${(s?.income ?? 0) - (s?.expense ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency((s?.income ?? 0) - (s?.expense ?? 0))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Potential</p>
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(s?.rentPotential ?? 0)}<span className="text-xs font-medium text-slate-400">/mo</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setUnitModal({ open: true, propertyId: p.id, editing: null })}>
                    <Plus className="size-4" /> Unit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPropModal({ open: true, editing: p })}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={() => setDeleteProp(p)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="animate-fade-in-up border-t border-slate-100 bg-slate-50/50">
                  {units.length === 0 ? (
                    <p className="px-5 py-6 text-center text-xs text-slate-400">
                      No units yet — add one to start tracking rent and occupancy.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {units.map((u) => {
                        const tenant = dataset.tenants.find((t) => t.unit_id === u.id && (!t.lease_end || t.lease_end >= new Date().toISOString().slice(0, 10)))
                        return (
                          <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-slate-200/70 text-slate-600">
                              <BedDouble className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-800">{u.unit_name}</p>
                              <p className="text-xs text-slate-500">
                                {tenant ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="size-3" /> {tenant.name}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Vacant</span>
                                )}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-slate-800">{formatCurrency(u.rent_amount)}<span className="text-xs font-medium text-slate-400">/mo</span></p>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setUnitModal({ open: true, propertyId: p.id, editing: u })}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={() => setDeleteUnit(u)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <PropertyFormModal
        open={propModal.open}
        onClose={() => setPropModal({ open: false, editing: null })}
        editing={propModal.editing}
      />
      <UnitFormModal
        open={unitModal.open}
        onClose={() => setUnitModal({ open: false, propertyId: null, editing: null })}
        propertyId={unitModal.propertyId ?? ''}
        editing={unitModal.editing}
      />

      <ConfirmDialog
        open={deleteProp !== null}
        onClose={() => setDeleteProp(null)}
        onConfirm={async () => {
          if (!deleteProp) return
          try {
            await remove('properties', deleteProp.id)
            toast('Property and its units deleted', 'success')
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Delete failed', 'error')
          }
        }}
        title="Delete property?"
        message={
          <>
            This will permanently delete <b>{deleteProp?.name}</b> along with all of its units and
            related transactions. This cannot be undone.
          </>
        }
      />
      <ConfirmDialog
        open={deleteUnit !== null}
        onClose={() => setDeleteUnit(null)}
        onConfirm={async () => {
          if (!deleteUnit) return
          try {
            await remove('units', deleteUnit.id)
            toast('Unit deleted', 'success')
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Delete failed', 'error')
          }
        }}
        title="Delete unit?"
        message={
          <>
            Delete unit <b>{deleteUnit?.unit_name}</b>? Its tenant will be unassigned.
          </>
        }
      />
    </div>
  )
}

export type { Property, Unit }
