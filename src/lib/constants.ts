import type { ExpenseCategory, IncomeCategory } from './types'

export const INCOME_CATEGORY_COLORS: Record<IncomeCategory, string> = {
  'Monthly Rent': '#10b981', // emerald-500
  'Security Deposit': '#0ea5e9', // sky-500
  'Late Fee': '#f59e0b', // amber-500
  'Utility Reimbursement': '#a88443', // champagne gold
  Other: '#94a3b8', // slate-400 — readable on ivory AND navy
}

export const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  'Mortgage Interest': '#46587b', // mid navy — legible on ivory AND navy
  'Property Tax': '#ef4444', // red-500
  'Cleaning & Maintenance': '#14b8a6', // teal-500
  'Appliance Repair': '#f97316', // orange-500
  Insurance: '#06b6d4', // cyan-500
  Utilities: '#eab308', // yellow-500
  'HOA Fees': '#9c6b3f', // copper
  'Capital Improvements': '#3b82f6', // blue-500
  Other: '#64748b', // slate-500
}

export const APP_NAME = 'Valora'
