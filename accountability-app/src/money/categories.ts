import type { TxKind } from './types';

/** icon = Ionicons name; emoji kept for text-only contexts. */
export type Category = { value: string; label: string; emoji: string; icon: string };

export const EXPENSE_CATEGORIES: Category[] = [
  { value: 'food', label: 'Food', emoji: '🍔', icon: 'fast-food-outline' },
  { value: 'transport', label: 'Transport', emoji: '🚗', icon: 'car-outline' },
  { value: 'bills', label: 'Bills', emoji: '🧾', icon: 'receipt-outline' },
  { value: 'shopping', label: 'Shopping', emoji: '🛍️', icon: 'bag-outline' },
  { value: 'health', label: 'Health', emoji: '💊', icon: 'medkit-outline' },
  { value: 'fun', label: 'Fun', emoji: '🎉', icon: 'sparkles-outline' },
  { value: 'other', label: 'Other', emoji: '📦', icon: 'cube-outline' },
];

export const INCOME_CATEGORIES: Category[] = [
  { value: 'salary', label: 'Salary', emoji: '💰', icon: 'cash-outline' },
  { value: 'gift', label: 'Gift', emoji: '🎁', icon: 'gift-outline' },
  { value: 'other', label: 'Other', emoji: '📦', icon: 'cube-outline' },
];

export function categoriesFor(kind: TxKind): Category[] {
  return kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function categoryMeta(value: string): Category {
  return (
    [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.value === value) ?? {
      value,
      label: value,
      emoji: '📦',
      icon: 'cube-outline',
    }
  );
}

/** Format an amount for display, e.g. 1250.5 -> "1,250.50". */
export function formatAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
