import { EXPENSE_CATEGORY_COLORS, INCOME_CATEGORY_COLORS } from './constants'

type BadgeColor = 'emerald' | 'rose' | 'indigo' | 'amber' | 'slate'

const INCOME_BADGE: Record<string, BadgeColor> = {
  'Monthly Rent': 'emerald',
  'Security Deposit': 'indigo',
  'Late Fee': 'amber',
  'Utility Reimbursement': 'indigo',
  Other: 'slate',
}

const EXPENSE_BADGE: Record<string, BadgeColor> = {
  'Mortgage Interest': 'indigo',
  'Property Tax': 'rose',
  'Cleaning & Maintenance': 'emerald',
  'Appliance Repair': 'amber',
  Insurance: 'indigo',
  Utilities: 'slate',
  'HOA Fees': 'indigo',
  'Capital Improvements': 'indigo',
  Other: 'slate',
}

export function incomeBadgeColor(category: string): BadgeColor {
  return INCOME_BADGE[category] ?? 'slate'
}

export function expenseBadgeColor(category: string): BadgeColor {
  return EXPENSE_BADGE[category] ?? 'slate'
}

export function categoryColorFor(category: string): string {
  if (category in INCOME_CATEGORY_COLORS) return incomeBadgeColor(category)
  if (category in EXPENSE_CATEGORY_COLORS) return expenseBadgeColor(category)
  return 'slate'
}
