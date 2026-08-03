import type {
  Dataset,
  Expense,
  Income,
  Property,
  Tenant,
  Unit,
} from './types'

const PREFIX = 'rpiet:'
const SEED_FLAG = `${PREFIX}seeded`

type Row = Property | Unit | Tenant | Income | Expense

export function loadTable<K extends keyof Dataset>(table: K): Dataset[K] {
  try {
    const raw = localStorage.getItem(PREFIX + table)
    return raw ? (JSON.parse(raw) as Dataset[K]) : []
  } catch {
    return []
  }
}

function saveTable(table: keyof Dataset, rows: Row[]): void {
  localStorage.setItem(PREFIX + table, JSON.stringify(rows))
}

function clearTables(): void {
  for (const table of ['properties', 'units', 'tenants', 'incomes', 'expenses']) {
    localStorage.removeItem(PREFIX + table)
  }
}

export function shouldSeed(): boolean {
  return localStorage.getItem(SEED_FLAG) !== '1'
}

export function markSeeded(): void {
  localStorage.setItem(SEED_FLAG, '1')
}

// ---------------------------------------------------------------------------
// Local persistence primitives (used by the data layer in demo mode)
// ---------------------------------------------------------------------------

export function localInsert(table: keyof Dataset, row: Row): Row {
  const rows = loadTable(table) as Row[]
  const next = [row, ...rows]
  saveTable(table, next)
  return row
}

export function localUpdate(
  table: keyof Dataset,
  id: string,
  patch: Partial<Row>,
): void {
  const rows = (loadTable(table) as Row[]).map((r) =>
    r.id === id ? ({ ...r, ...patch } as Row) : r,
  )
  saveTable(table, rows)
}

export function localRemove(table: keyof Dataset, id: string): void {
  const rows = (loadTable(table) as Row[]).filter((r) => r.id !== id)
  saveTable(table, rows)
}

export function saveWholeDataset(dataset: Dataset): void {
  ;(Object.keys(dataset) as (keyof Dataset)[]).forEach((table) =>
    saveTable(table, dataset[table] as unknown as Row[]),
  )
}

export function wipeAllLocal(): void {
  clearTables()
}

// ---------------------------------------------------------------------------
// Demo seed data
// ---------------------------------------------------------------------------

const MONTHS_BACK = 14

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * Builds a realistic demo portfolio. All ids are real UUIDs so the dataset
 * can be inserted into Supabase tables with `id uuid primary key`.
 */
export function buildSeedDataset(): Dataset {
  const now = new Date().toISOString()
  const uid = () => crypto.randomUUID()

  const dayOfMonth = (offset: number, day: number) => {
    const d = new Date()
    d.setMonth(d.getMonth() - offset)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, last))
    return d.toISOString().slice(0, 10)
  }

  const p1 = uid()
  const p2 = uid()
  const p3 = uid()

  const u1a = uid()
  const u1b = uid()
  const u1c = uid()
  const u2a = uid()
  const u2b = uid()
  const u3a = uid()
  const u3b = uid()

  const t1 = uid()
  const t2 = uid()
  const t3 = uid()
  const t4 = uid()
  const t5 = uid()
  const t6 = uid()

  const properties: Property[] = [
    {
      id: p1,
      name: 'Maple Grove Apartments',
      address: '124 Maple Street, Springfield',
      notes: 'Two-story walkup with laundry in basement. Water heater due for replacement in 2027.',
      created_at: now,
    },
    {
      id: p2,
      name: 'Harborview Heights',
      address: '88 Harbor Blvd, Portland',
      notes: 'Waterfront duplex. Flood insurance required by lender.',
      created_at: now,
    },
    {
      id: p3,
      name: 'Sunnyvale Townhomes',
      address: '15 Sunset Ave, Denver',
      notes: 'HOA-managed community; HOA covers exterior and roof.',
      created_at: now,
    },
  ]

  const units: Unit[] = [
    { id: u1a, property_id: p1, unit_name: '1A', rent_amount: 1350, notes: '2BR/1BA, renovated kitchen', created_at: now },
    { id: u1b, property_id: p1, unit_name: '1B', rent_amount: 1425, notes: '2BR/1BA, street parking', created_at: now },
    { id: u1c, property_id: p1, unit_name: '2A', rent_amount: 1380, notes: '2BR/1BA, top floor', created_at: now },
    { id: u2a, property_id: p2, unit_name: 'Unit 1', rent_amount: 1850, notes: '3BR/2BA, waterfront view', created_at: now },
    { id: u2b, property_id: p2, unit_name: 'Unit 2', rent_amount: 1975, notes: '3BR/2BA, private patio', created_at: now },
    { id: u3a, property_id: p3, unit_name: 'A', rent_amount: 950, notes: '2BR/1BA townhome', created_at: now },
    { id: u3b, property_id: p3, unit_name: 'B', rent_amount: 1050, notes: '2BR/1BA townhome', created_at: now },
  ]

  const tenants: Tenant[] = [
    {
      id: t1, name: 'Emma Rodriguez', email: 'emma.rodriguez@example.com',
      phone: '(555) 210-8841', unit_id: u1a, lease_start: '2024-09-01',
      lease_end: null, rent_due_date: 1, notes: 'Prefers email. Renewed for 2026.', created_at: now,
    },
    {
      id: t2, name: 'James Chen', email: 'jchen@example.com',
      phone: '(555) 330-1198', unit_id: u1b, lease_start: '2025-02-15',
      lease_end: null, rent_due_date: 15, notes: '', created_at: now,
    },
    {
      id: t3, name: 'Priya Patel', email: 'priya.patel@example.com',
      phone: '(555) 442-7733', unit_id: u1c, lease_start: '2024-06-01',
      lease_end: null, rent_due_date: 1, notes: 'Has two cats (approved).', created_at: now,
    },
    {
      id: t4, name: 'Marcus Webb', email: 'marcus.webb@example.com',
      phone: '(555) 512-3320', unit_id: u2a, lease_start: '2025-01-01',
      lease_end: '2026-06-30', rent_due_date: 1, notes: 'Lease ending — send renewal notice.', created_at: now,
    },
    {
      id: t5, name: 'Sofia Martinez', email: 'sofia.m@example.com',
      phone: '(555) 691-2045', unit_id: u2b, lease_start: '2025-03-01',
      lease_end: null, rent_due_date: 3, notes: 'Autopay via bank transfer.', created_at: now,
    },
    {
      id: t6, name: 'Daniel Kim', email: 'd.kim@example.com',
      phone: '(555) 720-9914', unit_id: u3a, lease_start: '2024-11-01',
      lease_end: null, rent_due_date: 1, notes: '', created_at: now,
    },
  ]

  const incomes: Income[] = []
  const expenses: Expense[] = []

  // --- Income: monthly rent per tenant for the last ~14 months ---------------
  const tenantRent: Record<string, { unitId: string; propertyId: string; rent: number; due: number }> = {
    [t1]: { unitId: u1a, propertyId: p1, rent: 1350, due: 1 },
    [t2]: { unitId: u1b, propertyId: p1, rent: 1425, due: 15 },
    [t3]: { unitId: u1c, propertyId: p1, rent: 1380, due: 1 },
    [t4]: { unitId: u2a, propertyId: p2, rent: 1850, due: 1 },
    [t5]: { unitId: u2b, propertyId: p2, rent: 1975, due: 3 },
    [t6]: { unitId: u3a, propertyId: p3, rent: 950, due: 1 },
  }

  for (const [tidKey, cfg] of Object.entries(tenantRent)) {
    const tenant = tenants.find((t) => t.id === tidKey)!
    const start = new Date(`${tenant.lease_start}T00:00:00`)
    const months = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)) + 1
    const n = Math.min(Math.max(months, 1), MONTHS_BACK)
    for (let i = 0; i < n; i++) {
      const date = dayOfMonth(i, cfg.due)
      // Skip the very first month for Sofia to simulate a late start
      const skip = tidKey === t5 && i === n - 1
      if (skip) continue
      incomes.push({
        id: uid(),
        property_id: cfg.propertyId,
        unit_id: cfg.unitId,
        tenant_id: tidKey,
        date,
        category: 'Monthly Rent',
        amount: cfg.rent,
        payment_method:
          tidKey === t5 ? 'Bank Transfer' : tidKey === t4 ? 'Check' : 'Zelle',
        notes: '',
        created_at: now,
      })
    }
  }

  // Security deposits at lease start
  incomes.push({
    id: uid(), property_id: p1, unit_id: u1b, tenant_id: t2,
    date: '2025-02-15', category: 'Security Deposit', amount: 1425,
    payment_method: 'Check', notes: 'Held in escrow account.', created_at: now,
  })
  incomes.push({
    id: uid(), property_id: p2, unit_id: u2b, tenant_id: t5,
    date: '2025-03-01', category: 'Security Deposit', amount: 1975,
    payment_method: 'Bank Transfer', notes: '', created_at: now,
  })

  // Late fees
  incomes.push({
    id: uid(), property_id: p2, unit_id: u2a, tenant_id: t4,
    date: dayOfMonth(2, 8), category: 'Late Fee', amount: 75,
    payment_method: 'Check', notes: 'Rent paid 7 days late.', created_at: now,
  })
  incomes.push({
    id: uid(), property_id: p1, unit_id: u1c, tenant_id: t3,
    date: dayOfMonth(4, 10), category: 'Late Fee', amount: 60,
    payment_method: 'Zelle', notes: '', created_at: now,
  })

  // Utility reimbursements
  incomes.push({
    id: uid(), property_id: p3, unit_id: u3b, tenant_id: null,
    date: dayOfMonth(1, 15), category: 'Utility Reimbursement', amount: 42.5,
    payment_method: 'Venmo', notes: 'Former tenant — electric overage for June.', created_at: now,
  })

  // --- Expenses --------------------------------------------------------------
  const pushExp = (e: Omit<Expense, 'id' | 'created_at'>) =>
    expenses.push({ ...e, id: uid(), created_at: now })

  // Monthly mortgage interest per property
  const mortgage: Record<string, number> = { [p1]: 720, [p2]: 980, [p3]: 410 }
  for (const [pid, amt] of Object.entries(mortgage)) {
    for (let i = 0; i < MONTHS_BACK; i++) {
      pushExp({
        property_id: pid, unit_id: null, date: dayOfMonth(i, 3),
        category: 'Mortgage Interest', amount: amt,
        vendor: 'First National Bank', notes: '', receipt_url: null,
      })
    }
  }

  // Quarterly property tax
  const tax: Record<string, number> = { [p1]: 1180, [p2]: 1540, [p3]: 690 }
  for (const [pid, amt] of Object.entries(tax)) {
    for (let i = 0; i < MONTHS_BACK; i += 3) {
      pushExp({
        property_id: pid, unit_id: null, date: dayOfMonth(i, 12),
        category: 'Property Tax', amount: amt,
        vendor: 'County Assessor', notes: 'Q payment', receipt_url: null,
      })
    }
  }

  // Annual insurance
  const ins: Record<string, number> = { [p1]: 1250, [p2]: 980, [p3]: 620 }
  for (const [pid, amt] of Object.entries(ins)) {
    pushExp({
      property_id: pid, unit_id: null, date: dayOfMonth(11, 20),
      category: 'Insurance', amount: amt,
      vendor: 'Liberty Mutual', notes: 'Annual renewal', receipt_url: null,
    })
  }

  // Monthly utilities (common areas) + HOA for p3
  for (let i = 0; i < MONTHS_BACK; i++) {
    pushExp({
      property_id: p1, unit_id: null, date: dayOfMonth(i, 18),
      category: 'Utilities', amount: 85,
      vendor: 'Springfield Water', notes: 'Common water/sewer', receipt_url: null,
    })
    pushExp({
      property_id: p2, unit_id: null, date: dayOfMonth(i, 18),
      category: 'Utilities', amount: 120,
      vendor: 'Portland Energy', notes: 'Common electric + water', receipt_url: null,
    })
    pushExp({
      property_id: p3, unit_id: null, date: dayOfMonth(i, 1),
      category: 'HOA Fees', amount: 175,
      vendor: 'Sunnyvale HOA', notes: 'Monthly dues', receipt_url: null,
    })
  }

  // One-off maintenance / repairs
  const oneOffs: Omit<Expense, 'id' | 'created_at'>[] = [
    { property_id: p1, unit_id: u1a, date: isoDaysAgo(5), category: 'Appliance Repair', amount: 215, vendor: 'Appliance Pros', notes: 'Fridge compressor replaced — unit 1A.', receipt_url: null },
    { property_id: p1, unit_id: null, date: isoDaysAgo(40), category: 'Cleaning & Maintenance', amount: 160, vendor: 'Sparkle Cleaning Co.', notes: 'Common hallway deep clean.', receipt_url: null },
    { property_id: p2, unit_id: u2a, date: isoDaysAgo(12), category: 'Cleaning & Maintenance', amount: 185, vendor: 'Handy & Co.', notes: 'Gutter cleaning + caulking.', receipt_url: null },
    { property_id: p2, unit_id: null, date: isoDaysAgo(70), category: 'Appliance Repair', amount: 340, vendor: 'Coastal HVAC', notes: 'Water heater service.', receipt_url: null },
    { property_id: p3, unit_id: u3b, date: isoDaysAgo(25), category: 'Appliance Repair', amount: 95, vendor: 'FixIt Fast', notes: 'Dishwasher leak — valve replaced.', receipt_url: null },
    { property_id: p1, unit_id: null, date: dayOfMonth(6, 15), category: 'Capital Improvements', amount: 3200, vendor: 'Comfort Air Systems', notes: 'HVAC replacement — Maple Grove.', receipt_url: null },
    { property_id: p2, unit_id: null, date: dayOfMonth(10, 9), category: 'Capital Improvements', amount: 6800, vendor: 'Rooftop Masters', notes: 'New roof — Harborview Heights.', receipt_url: null },
    { property_id: p3, unit_id: null, date: dayOfMonth(3, 22), category: 'Insurance', amount: 620, vendor: 'StateFarm', notes: 'Annual renewal — Sunnyvale.', receipt_url: null },
  ]
  for (const e of oneOffs) pushExp(e)

  return { properties, units, tenants, incomes, expenses }
}
