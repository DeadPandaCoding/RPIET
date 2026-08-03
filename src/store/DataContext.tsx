import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  Dataset,
  Expense,
  Income,
  Property,
  StorageMode,
  TableName,
  Tenant,
  Unit,
} from '../lib/types'
import {
  clearAllData,
  getStorageMode,
  insertRow,
  loadDataset,
  removeRow,
  seedDemoData,
  testConnection,
  type ConnectionStatus,
  updateRow,
  uploadReceipt as uploadReceiptApi,
} from '../lib/api'
import { loadTable } from '../lib/storage'

type RowOf<T extends TableName> = Dataset[T][number]
type NewRowOf<T extends TableName> = Omit<RowOf<T>, 'id' | 'created_at'>

export interface DataContextValue {
  mode: StorageMode
  dataset: Dataset
  loading: boolean
  error: string | null
  connection: ConnectionStatus | null
  refresh: () => Promise<void>

  // CRUD
  create: <T extends TableName>(table: T, row: NewRowOf<T>) => Promise<RowOf<T>>
  update: (table: TableName, id: string, patch: Partial<RowOf<TableName>>) => Promise<void>
  remove: (table: TableName, id: string) => Promise<void>
  uploadReceipt: (file: File) => Promise<string>

  // Demo data management
  seedDemo: () => Promise<void>
  clearAll: () => Promise<void>

  // Lookups
  propertyById: (id: string | null | undefined) => Property | undefined
  unitById: (id: string | null | undefined) => Unit | undefined
  tenantById: (id: string | null | undefined) => Tenant | undefined
  unitsForProperty: (propertyId: string) => Unit[]
  tenantsForUnit: (unitId: string | null | undefined) => Tenant[]
  propertyForUnit: (unitId: string | null | undefined) => Property | undefined
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<Dataset>({
    properties: [],
    units: [],
    tenants: [],
    incomes: [],
    expenses: [],
  })
  const [mode, setMode] = useState<StorageMode>(() => getStorageMode())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const { dataset: ds, mode: m } = await loadDataset()
      setDataset(ds)
      setMode(m)
      const conn = await testConnection()
      setConnection(conn)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const reloadTable = useCallback((table: TableName) => {
    setDataset((d) => {
      const next = { ...d } as Record<string, unknown>
      next[table] = loadTable(table)
      return next as unknown as Dataset
    })
  }, [])

  const create = useCallback(
    async <T extends TableName>(table: T, row: NewRowOf<T>) => {
      const created = (await insertRow(table, row as never)) as RowOf<T>
      if (getStorageMode() === 'supabase') {
        await refresh()
      } else {
        reloadTable(table)
      }
      return created
    },
    [refresh, reloadTable],
  )

  const update = useCallback(
    async (table: TableName, id: string, patch: Partial<RowOf<TableName>>) => {
      await updateRow(table, id, patch as never)
      if (getStorageMode() === 'supabase') {
        await refresh()
      } else {
        reloadTable(table)
      }
    },
    [refresh, reloadTable],
  )

  const remove = useCallback(
    async (table: TableName, id: string) => {
      await removeRow(table, id)
      if (getStorageMode() === 'supabase') {
        // DB cascades may have touched other tables — resync.
        await refresh()
      } else {
        // Local mode mirrors FK cascades inside removeRow, then reload affected tables.
        reloadTable(table)
        reloadTable('tenants')
        reloadTable('units')
        reloadTable('incomes')
        reloadTable('expenses')
      }
    },
    [refresh, reloadTable],
  )

  const uploadReceipt = useCallback((file: File) => uploadReceiptApi(file), [])

  const seedDemo = useCallback(async () => {
    await seedDemoData()
    await refresh()
  }, [refresh])

  const clearAll = useCallback(async () => {
    await clearAllData()
    await refresh()
  }, [refresh])

  // ---- Lookup helpers ------------------------------------------------------
  const lookups = useMemo(() => {
    const propertyById = (id: string | null | undefined) =>
      dataset.properties.find((p) => p.id === id)
    const unitById = (id: string | null | undefined) =>
      dataset.units.find((u) => u.id === id)
    const tenantById = (id: string | null | undefined) =>
      dataset.tenants.find((t) => t.id === id)
    const unitsForProperty = (propertyId: string) =>
      dataset.units.filter((u) => u.property_id === propertyId)
    const tenantsForUnit = (unitId: string | null | undefined) =>
      dataset.tenants.filter((t) => t.unit_id === unitId)
    const propertyForUnit = (unitId: string | null | undefined) => {
      const unit = unitById(unitId)
      return unit ? propertyById(unit.property_id) : undefined
    }
    return {
      propertyById,
      unitById,
      tenantById,
      unitsForProperty,
      tenantsForUnit,
      propertyForUnit,
    }
  }, [dataset])

  const value: DataContextValue = {
    mode,
    dataset,
    loading,
    error,
    connection,
    refresh,
    create,
    update,
    remove,
    uploadReceipt,
    seedDemo,
    clearAll,
    ...lookups,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}

export type { Income, Expense, Property, Tenant, Unit }
