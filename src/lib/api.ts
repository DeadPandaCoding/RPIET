import type { Dataset, StorageMode, TableName } from './types'
import { getSupabase } from './supabase'
import {
  buildSeedDataset,
  localInsert,
  loadTable,
  localRemove,
  localUpdate,
  saveWholeDataset,
  shouldSeed,
  markSeeded,
  wipeAllLocal,
} from './storage'

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

export function getStorageMode(): StorageMode {
  return getSupabase() ? 'supabase' : 'local'
}

// ---------------------------------------------------------------------------
// Connection testing
// ---------------------------------------------------------------------------

export interface ConnectionStatus {
  ok: boolean
  mode: StorageMode
  message: string
}

export async function testConnection(): Promise<ConnectionStatus> {
  const sb = getSupabase()
  if (!sb) {
    return {
      ok: false,
      mode: 'local',
      message:
        'Supabase not configured. Running on local browser storage. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a .env file to connect.',
    }
  }
  try {
    const { error } = await sb.from('properties').select('id', { count: 'exact', head: true })
    if (error) {
      return {
        ok: false,
        mode: 'supabase',
        message: `Supabase configured but unreachable: ${error.message}. If tables are missing, run supabase/schema.sql in the Supabase SQL Editor.`,
      }
    }
    return {
      ok: true,
      mode: 'supabase',
      message: 'Connected to Supabase.',
    }
  } catch (err) {
    return {
      ok: false,
      mode: 'supabase',
      message: `Supabase connection error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Dataset loading
// ---------------------------------------------------------------------------

export async function loadDataset(): Promise<{ dataset: Dataset; mode: StorageMode }> {
  const mode = getStorageMode()
  const sb = getSupabase()

  if (!sb) {
    if (shouldSeed()) {
      saveWholeDataset(buildSeedDataset())
      markSeeded()
    }
    const dataset: Dataset = {
      properties: loadTable('properties'),
      units: loadTable('units'),
      tenants: loadTable('tenants'),
      incomes: loadTable('incomes'),
      expenses: loadTable('expenses'),
    }
    return { dataset, mode }
  }

  const [props, units, tenants, incomes, expenses] = await Promise.all([
    sb.from('properties').select('*').order('created_at', { ascending: true }),
    sb.from('units').select('*').order('created_at', { ascending: true }),
    sb.from('tenants').select('*').order('created_at', { ascending: true }),
    sb.from('incomes').select('*').order('created_at', { ascending: true }),
    sb.from('expenses').select('*').order('created_at', { ascending: true }),
  ])
  const errs = [props.error, units.error, tenants.error, incomes.error, expenses.error].find(Boolean)
  if (errs) throw new Error(errs.message)

  return {
    mode,
    dataset: {
      properties: props.data ?? [],
      units: units.data ?? [],
      tenants: tenants.data ?? [],
      incomes: incomes.data ?? [],
      expenses: expenses.data ?? [],
    },
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

type Row = Dataset[TableName][number]
type NewRow = Omit<Row, 'id' | 'created_at'>

export async function insertRow(table: TableName, row: NewRow): Promise<Row> {
  const sb = getSupabase()
  if (sb) {
    const { data, error } = await sb
      .from(table)
      .insert(row as Record<string, unknown>)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data as Row
  }
  const created = {
    ...row,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  } as Row
  return localInsert(table, created)
}

export async function updateRow(
  table: TableName,
  id: string,
  patch: Partial<Row>,
): Promise<void> {
  const sb = getSupabase()
  if (sb) {
    const { error } = await sb
      .from(table)
      .update(patch as Record<string, unknown>)
      .eq('id', id)
    if (error) throw new Error(error.message)
    return
  }
  localUpdate(table, id, patch)
}

export async function removeRow(table: TableName, id: string): Promise<void> {
  const sb = getSupabase()
  if (sb) {
    const { error } = await sb.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
    return
  }
  // Local mode: mirror FK behavior (cascade / set null)
  if (table === 'properties') {
    const units = loadTable('units').filter((u) => u.property_id === id)
    for (const u of units) await removeRow('units', u.id)
  } else if (table === 'units') {
    for (const t of loadTable('tenants').filter((t) => t.unit_id === id)) {
      await updateRow('tenants', t.id, { unit_id: null })
    }
    for (const i of loadTable('incomes').filter((i) => i.unit_id === id)) {
      await updateRow('incomes', i.id, { unit_id: null })
    }
    for (const e of loadTable('expenses').filter((e) => e.unit_id === id)) {
      await updateRow('expenses', e.id, { unit_id: null })
    }
  } else if (table === 'tenants') {
    for (const i of loadTable('incomes').filter((i) => i.tenant_id === id)) {
      await updateRow('incomes', i.id, { tenant_id: null })
    }
  }
  localRemove(table, id)
}

// ---------------------------------------------------------------------------
// Receipt uploads
// ---------------------------------------------------------------------------

/**
 * Uploads a receipt image. In Supabase mode the file is stored in the
 * `receipts` bucket and its public URL is returned. In local mode the file
 * is embedded as a data URL (kept under ~2.5MB) so it survives refreshes.
 */
export async function uploadReceipt(file: File): Promise<string> {
  const sb = getSupabase()
  if (sb) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${Date.now()}-${safeName}`
    const { error } = await sb.storage.from('receipts').upload(path, file)
    if (error) throw new Error(error.message)
    const { data } = sb.storage.from('receipts').getPublicUrl(path)
    return data.publicUrl
  }
  if (file.size > 2.5 * 1024 * 1024) {
    throw new Error('Demo mode: receipts are embedded locally and must be under 2.5 MB. Connect Supabase for larger uploads.')
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

// ---------------------------------------------------------------------------
// Demo data management
// ---------------------------------------------------------------------------

export async function seedDemoData(): Promise<void> {
  const sb = getSupabase()
  if (sb) {
    const ds = buildSeedDataset()
    // Wipe existing rows first (order matters for FKs)
    for (const table of ['incomes', 'expenses', 'tenants', 'units', 'properties'] as TableName[]) {
      const { error } = await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) throw new Error(error.message)
    }
    for (const table of ['properties', 'units', 'tenants', 'incomes', 'expenses'] as TableName[]) {
      const { error } = await sb.from(table).insert(ds[table] as unknown as Record<string, unknown>[])
      if (error) throw new Error(error.message)
    }
    return
  }
  saveWholeDataset(buildSeedDataset())
  markSeeded()
}

export async function clearAllData(): Promise<void> {
  const sb = getSupabase()
  if (sb) {
    for (const table of ['incomes', 'expenses', 'tenants', 'units', 'properties'] as TableName[]) {
      const { error } = await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) throw new Error(error.message)
    }
    return
  }
  wipeAllLocal()
  saveWholeDataset({ properties: [], units: [], tenants: [], incomes: [], expenses: [] })
}
