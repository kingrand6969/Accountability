import type { TxKind } from './types';

export type Category = { value: string; label: string; emoji: string };

export const EXPENSE_CATEGORIES: Category[] = [
  { value: 'food', label: 'Food', emoji: '🍔' },
  { value: 'transport', label: 'Transport', emoji: '🚗' },
  { value: 'bills', label: 'Bills', emoji: '🧾' },
  { value: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { value: 'health', label: 'Health', emoji: '💊' },
  { value: 'fun', label: 'Fun', emoji: '🎉' },
  { value: 'other', label: 'Other', emoji: '📦' },
];

export const INCOME_CATEGORIES: Category[] = [
  { value: 'salary', label: 'Salary', emoji: '💰' },
  { value: 'gift', label: 'Gift', emoji: '🎁' },
  { value: 'other', label: 'Other', emoji: '📦' },
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
