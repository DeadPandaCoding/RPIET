/**
 * Central input validation & sanitization for Valora.
 *
 * Every row that enters the app (create + update, in both Supabase and local
 * modes) passes through validateRow / validatePatch before it is written.
 * Strings are trimmed and stripped of control characters; every field is
 * length-capped; dates, emails, categories and amounts are format-checked;
 * and oversized or malformed input is rejected with a friendly error.
 *
 * The UI renders all stored text as React text nodes (no dangerouslySetInnerHTML),
 * so React already prevents HTML/script injection — this layer hardens data
 * quality and blocks oversized / malformed payloads.
 */
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  type TableName,
} from './types'

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const LIMITS = {
  name: 120,
  address: 200,
  notes: 2000,
  unit_name: 100,
  email: 254,
  phone: 40,
  vendor: 120,
  id: 64,
} as const

export const MAX_AMOUNT = 1_000_000_000 // $1B sanity ceiling for amounts
const MAX_RECEIPT_PATH = 500 // Supabase storage path
const MAX_RECEIPT_DATA_URL = 3_500_000 // ~2.5 MB image inflates ~1.33x as base64
const MAX_ROW_SIZE = 4_000_000 // serialized row ceiling (data-URL receipts live here)
export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024 // upload cap

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Control characters (keeps \n and \t, which are meaningful in notes). */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

// ---------------------------------------------------------------------------
// Errors & primitives
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function fail(message: string): never {
  throw new ValidationError(message)
}

/** Trims, strips control characters, and enforces a maximum length. */
export function sanitizeString(value: unknown, max: number, label: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') fail(`${label} must be text`)
  const s = value.replace(CONTROL_RE, '').trim()
  if (s.length > max) fail(`${label} is too long (max ${max} characters)`)
  return s
}

function assertId(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') fail(`${label} is invalid`)
  const s = value.trim()
  if (!s) return null
  if (s.length > LIMITS.id) fail(`${label} is too long`)
  return s
}

function assertDate(value: unknown, label: string, required: boolean): string | null {
  if (value === null || value === undefined || value === '') {
    if (required) fail(`${label} is required`)
    return null
  }
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    fail(`${label} must be a valid date (YYYY-MM-DD)`)
  }
  // Reject impossible dates like 2026-02-31.
  const d = new Date(value + 'T00:00:00Z')
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    fail(`${label} is not a real date`)
  }
  return value
}

function assertEmail(value: unknown): string {
  const s = sanitizeString(value, LIMITS.email, 'Email')
  if (!s) return ''
  if (!EMAIL_RE.test(s)) fail('Enter a valid email address')
  return s.toLowerCase()
}

function assertAmount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a number`)
  }
  if (value < 0) fail(`${label} cannot be negative`)
  if (value > MAX_AMOUNT) fail(`${label} is too large`)
  return Math.round(value * 100) / 100
}

function assertEnum(value: unknown, allowed: readonly string[], label: string): string {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail(`${label} is invalid`)
  }
  return value
}

function assertDueDate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    fail('Rent due day must be a whole number from 1 to 31')
  }
  return n
}

function assertReceiptUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') fail('Receipt is invalid')
  const v: string = value
  if (v.startsWith('data:')) {
    if (v.length > MAX_RECEIPT_DATA_URL) {
      fail('Receipt image is too large (max 2.5 MB in demo mode)')
    }
    return v
  }
  if (v.length > MAX_RECEIPT_PATH) fail('Receipt reference is too long')
  return v
}

function assertRowSize(row: Record<string, unknown>, label: string): void {
  let size = 0
  try {
    size = JSON.stringify(row).length
  } catch {
    fail(`${label} could not be serialized`)
  }
  if (size > MAX_ROW_SIZE) fail(`${label} is too large`)
}

// ---------------------------------------------------------------------------
// Per-table row validation
// ---------------------------------------------------------------------------

/**
 * Validates (and sanitizes) a full new row for a table. Returns the cleaned
 * row. Throws ValidationError with a friendly message on any problem.
 */
export function validateRow<T extends Record<string, unknown>>(
  table: TableName,
  row: T,
): T {
  const out: Record<string, unknown> = { ...row }
  switch (table) {
    case 'properties': {
      out.name = sanitizeString(out.name, LIMITS.name, 'Property name')
      if (!out.name) fail('Property name is required')
      out.address = sanitizeString(out.address, LIMITS.address, 'Address')
      if (!out.address) fail('Address is required')
      out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      break
    }
    case 'units': {
      out.property_id = assertId(out.property_id, 'Property') ?? fail('Property is required')
      out.unit_name = sanitizeString(out.unit_name, LIMITS.unit_name, 'Unit name')
      if (!out.unit_name) fail('Unit name is required')
      out.rent_amount = assertAmount(out.rent_amount, 'Rent amount')
      out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      break
    }
    case 'tenants': {
      out.name = sanitizeString(out.name, LIMITS.name, 'Tenant name')
      if (!out.name) fail('Tenant name is required')
      out.email = assertEmail(out.email)
      out.phone = sanitizeString(out.phone, LIMITS.phone, 'Phone')
      out.unit_id = assertId(out.unit_id, 'Unit')
      out.lease_start = assertDate(out.lease_start, 'Lease start', false)
      out.lease_end = assertDate(out.lease_end, 'Lease end', false)
      out.rent_due_date = assertDueDate(out.rent_due_date)
      out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      break
    }
    case 'incomes': {
      out.date = assertDate(out.date, 'Date', true)
      out.property_id = assertId(out.property_id, 'Property') ?? fail('Property is required')
      out.unit_id = assertId(out.unit_id, 'Unit')
      out.tenant_id = assertId(out.tenant_id, 'Tenant')
      out.category = assertEnum(out.category, INCOME_CATEGORIES, 'Category')
      out.amount = assertAmount(out.amount, 'Amount')
      out.payment_method = assertEnum(out.payment_method, PAYMENT_METHODS, 'Payment method')
      out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      break
    }
    case 'expenses': {
      out.date = assertDate(out.date, 'Date', true)
      out.property_id = assertId(out.property_id, 'Property') ?? fail('Property is required')
      out.unit_id = assertId(out.unit_id, 'Unit')
      out.category = assertEnum(out.category, EXPENSE_CATEGORIES, 'Category')
      out.amount = assertAmount(out.amount, 'Amount')
      out.vendor = sanitizeString(out.vendor, LIMITS.vendor, 'Vendor')
      out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      out.receipt_url = assertReceiptUrl(out.receipt_url)
      break
    }
  }
  assertRowSize(out, table)
  return out as T
}

/**
 * Validates a partial update patch — only the fields present in the patch are
 * checked (used by updateRow, including internal cascade patches like
 * { unit_id: null }).
 */
export function validatePatch<T extends Record<string, unknown>>(
  table: TableName,
  patch: T,
): T {
  const out: Record<string, unknown> = { ...patch }
  const has = (k: string) => Object.prototype.hasOwnProperty.call(out, k)
  switch (table) {
    case 'properties': {
      if (has('name')) {
        out.name = sanitizeString(out.name, LIMITS.name, 'Property name')
        if (!out.name) fail('Property name is required')
      }
      if (has('address')) {
        out.address = sanitizeString(out.address, LIMITS.address, 'Address')
        if (!out.address) fail('Address is required')
      }
      if (has('notes')) out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      break
    }
    case 'units': {
      if (has('property_id')) out.property_id = assertId(out.property_id, 'Property')
      if (has('unit_name')) {
        out.unit_name = sanitizeString(out.unit_name, LIMITS.unit_name, 'Unit name')
        if (!out.unit_name) fail('Unit name is required')
      }
      if (has('rent_amount')) out.rent_amount = assertAmount(out.rent_amount, 'Rent amount')
      if (has('notes')) out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      break
    }
    case 'tenants': {
      if (has('name')) {
        out.name = sanitizeString(out.name, LIMITS.name, 'Tenant name')
        if (!out.name) fail('Tenant name is required')
      }
      if (has('email')) out.email = assertEmail(out.email)
      if (has('phone')) out.phone = sanitizeString(out.phone, LIMITS.phone, 'Phone')
      if (has('unit_id')) out.unit_id = assertId(out.unit_id, 'Unit')
      if (has('lease_start')) out.lease_start = assertDate(out.lease_start, 'Lease start', false)
      if (has('lease_end')) out.lease_end = assertDate(out.lease_end, 'Lease end', false)
      if (has('rent_due_date')) out.rent_due_date = assertDueDate(out.rent_due_date)
      if (has('notes')) out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      break
    }
    case 'incomes': {
      if (has('date')) out.date = assertDate(out.date, 'Date', true)
      if (has('property_id')) out.property_id = assertId(out.property_id, 'Property')
      if (has('unit_id')) out.unit_id = assertId(out.unit_id, 'Unit')
      if (has('tenant_id')) out.tenant_id = assertId(out.tenant_id, 'Tenant')
      if (has('category')) out.category = assertEnum(out.category, INCOME_CATEGORIES, 'Category')
      if (has('amount')) out.amount = assertAmount(out.amount, 'Amount')
      if (has('payment_method')) {
        out.payment_method = assertEnum(out.payment_method, PAYMENT_METHODS, 'Payment method')
      }
      if (has('notes')) out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      break
    }
    case 'expenses': {
      if (has('date')) out.date = assertDate(out.date, 'Date', true)
      if (has('property_id')) out.property_id = assertId(out.property_id, 'Property')
      if (has('unit_id')) out.unit_id = assertId(out.unit_id, 'Unit')
      if (has('category')) out.category = assertEnum(out.category, EXPENSE_CATEGORIES, 'Category')
      if (has('amount')) out.amount = assertAmount(out.amount, 'Amount')
      if (has('vendor')) out.vendor = sanitizeString(out.vendor, LIMITS.vendor, 'Vendor')
      if (has('notes')) out.notes = sanitizeString(out.notes, LIMITS.notes, 'Notes')
      if (has('receipt_url')) out.receipt_url = assertReceiptUrl(out.receipt_url)
      break
    }
  }
  return out as T
}

// ---------------------------------------------------------------------------
// Receipt file validation
// ---------------------------------------------------------------------------

/** Rejects empty, oversized, or non-image/PDF receipt uploads. */
export function validateReceiptFile(file: File): void {
  if (!file) fail('No file selected')
  if (file.size <= 0) fail('The selected file is empty')
  if (file.size > MAX_RECEIPT_FILE_BYTES) {
    fail('Receipt is too large (max 10 MB)')
  }
  const isImage = /^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type)
  if (!isImage && file.type !== 'application/pdf') {
    fail('Receipts must be JPG, PNG, or PDF files')
  }
}
