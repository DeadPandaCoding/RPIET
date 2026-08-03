// Data model types. Field names match the Supabase schema (snake_case),
// so records round-trip between local storage and Postgres unchanged.

export type ID = string

export type ISODate = string // YYYY-MM-DD

export interface Property {
  id: ID
  name: string
  address: string
  notes: string
  created_at: string
}

export interface Unit {
  id: ID
  property_id: ID
  unit_name: string
  rent_amount: number
  notes: string
  created_at: string
}

export interface Tenant {
  id: ID
  name: string
  email: string
  phone: string
  unit_id: ID | null
  lease_start: ISODate | null
  lease_end: ISODate | null
  rent_due_date: number | null // day of month, 1-31
  notes: string
  created_at: string
}

export const INCOME_CATEGORIES = [
  'Monthly Rent',
  'Security Deposit',
  'Late Fee',
  'Utility Reimbursement',
  'Other',
] as const
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]

export const PAYMENT_METHODS = [
  'Cash',
  'Check',
  'Bank Transfer',
  'Credit Card',
  'Venmo',
  'Zelle',
  'PayPal',
  'Other',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface Income {
  id: ID
  property_id: ID
  unit_id: ID | null
  tenant_id: ID | null
  date: ISODate
  category: IncomeCategory
  amount: number
  payment_method: PaymentMethod
  notes: string
  created_at: string
}

export const EXPENSE_CATEGORIES = [
  'Mortgage Interest',
  'Property Tax',
  'Cleaning & Maintenance',
  'Appliance Repair',
  'Insurance',
  'Utilities',
  'HOA Fees',
  'Capital Improvements',
  'Other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Expense {
  id: ID
  property_id: ID
  unit_id: ID | null
  date: ISODate
  category: ExpenseCategory
  amount: number
  vendor: string
  notes: string
  receipt_url: string | null
  created_at: string
}

export interface Dataset {
  properties: Property[]
  units: Unit[]
  tenants: Tenant[]
  incomes: Income[]
  expenses: Expense[]
}

export type TableName = keyof Dataset

export type StorageMode = 'supabase' | 'local'

/** New-record payloads (id/created_at are generated). */
export type NewIncome = Omit<Income, 'id' | 'created_at'>
export type NewExpense = Omit<Expense, 'id' | 'created_at'>
export type NewProperty = Omit<Property, 'id' | 'created_at'>
export type NewUnit = Omit<Unit, 'id' | 'created_at'>
export type NewTenant = Omit<Tenant, 'id' | 'created_at'>
