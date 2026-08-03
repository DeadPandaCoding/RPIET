import { EXPENSE_CATEGORY_COLORS, INCOME_CATEGORY_COLORS } from './constants'

type BadgeColor = 'emerald' | 'rose' | 'indigo' | 'amber' | 'sky' | 'slate' | 'violet'

const INCOME_BADGE: Record<string, BadgeColor> = {
  'Monthly Rent': 'emerald',
  'Security Deposit': 'sky',
  'Late Fee': 'amber',
  'Utility Reimbursement': 'violet',
  Other: 'slate',
}

const EXPENSE_BADGE: Record<string, BadgeColor> = {
  'Mortgage Interest': 'indigo',
  'Property Tax': 'rose',
  'Cleaning & Maintenance': 'emerald',
  'Appliance Repair': 'amber',
  Insurance: 'sky',
  Utilities: 'slate',
  'HOA Fees': 'violet',
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
