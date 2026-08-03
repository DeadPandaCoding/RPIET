import type { ExpenseCategory, IncomeCategory } from './types'

export const INCOME_CATEGORY_COLORS: Record<IncomeCategory, string> = {
  'Monthly Rent': '#10b981', // emerald-500
  'Security Deposit': '#0ea5e9', // sky-500
  'Late Fee': '#f59e0b', // amber-500
  'Utility Reimbursement': '#8b5cf6', // violet-500
  Other: '#64748b', // slate-500
}

export const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  'Mortgage Interest': '#6366f1', // indigo-500
  'Property Tax': '#ef4444', // red-500
  'Cleaning & Maintenance': '#14b8a6', // teal-500
  'Appliance Repair': '#f97316', // orange-500
  Insurance: '#06b6d4', // cyan-500
  Utilities: '#eab308', // yellow-500
  'HOA Fees': '#a855f7', // purple-500
  'Capital Improvements': '#3b82f6', // blue-500
  Other: '#64748b', // slate-500
}

export const APP_NAME = 'PropertyLedger'
