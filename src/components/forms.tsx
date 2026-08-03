import type { ID } from '../lib/types'
import { useData } from '../store/DataContext'
import { Select } from './ui'

export function PropertySelect({
  value,
  onChange,
  allowNone = false,
  noneLabel = '— None —',
}: {
  value: ID | null
  onChange: (id: ID | null) => void
  allowNone?: boolean
  noneLabel?: string
}) {
  const { dataset } = useData()
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {allowNone && <option value="">{noneLabel}</option>}
      {!allowNone && <option value="">Select a property…</option>}
      {dataset.properties.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  )
}

export function UnitSelect({
  propertyId,
  value,
  onChange,
  allowNone = false,
  noneLabel = '— Not assigned —',
}: {
  propertyId: ID | null
  value: ID | null
  onChange: (id: ID | null) => void
  allowNone?: boolean
  noneLabel?: string
}) {
  const { unitsForProperty } = useData()
  const units = propertyId ? unitsForProperty(propertyId) : []
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={!propertyId || units.length === 0}
    >
      {allowNone && <option value="">{noneLabel}</option>}
      {!allowNone && <option value="">{propertyId ? 'Select a unit…' : 'Pick a property first'}</option>}
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.unit_name} — ${u.rent_amount.toLocaleString()}/mo
        </option>
      ))}
    </Select>
  )
}

export function TenantSelect({
  value,
  onChange,
  allowNone = true,
  noneLabel = '— None —',
}: {
  value: ID | null
  onChange: (id: ID | null) => void
  allowNone?: boolean
  noneLabel?: string
}) {
  const { dataset } = useData()
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">{noneLabel}</option>}
      {dataset.tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  )
}
