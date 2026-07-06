import type { Transaction } from './types';

/** Pure analytics for the Finance page — no I/O, unit-tested. */

/** Per-category accent tints (expense categories) — used for donut segments,
 *  icon tiles and legend dots. Chosen for 4.5:1-safe labels on light glass. */
export const CATEGORY_TINTS: Record<string, string> = {
  food: '#d97706',
  transport: '#2563eb',
  bills: '#6d28d9',
  shopping: '#db2777',
  health: '#0d9488',
  fun: '#e11d48',
  other: '#64748b',
  salary: '#047857',
  gift: '#7c3aed',
};

export function categoryTint(category: string): string {
  return CATEGORY_TINTS[category] ?? CATEGORY_TINTS.other;
}

export type SpendingInsight = {
  direction: 'up' | 'down' | 'flat' | 'none';
  /** whole percent, e.g. 12 for 12% — null when last month had no spending */
  pct: number | null;
  diff: number; // absolute difference (this - last)
};

/** Month-to-date spend vs last month's total — neutral facts, no advice. */
export function spendingInsight(thisSpend: number, lastSpend: number): SpendingInsight {
  if (lastSpend <= 0) {
    return { direction: 'none', pct: null, diff: thisSpend };
  }
  const diff = thisSpend - lastSpend;
  const pct = Math.round((Math.abs(diff) / lastSpend) * 100);
  if (pct === 0) return { direction: 'flat', pct: 0, diff: 0 };
  return { direction: diff > 0 ? 'up' : 'down', pct, diff };
}

export type CategorySlice = {
  category: string;
  total: number;
  /** share of this month's spending, whole percent */
  share: number;
  /** vs last month, whole percent — null when the category is new this month */
  changePct: number | null;
  changeDir: 'up' | 'down' | 'flat';
};

function totalsByCategory(txns: Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txns) {
    if (t.kind !== 'expense') continue;
    m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
  }
  return m;
}

/** Category slices for the donut + rows, sorted by size, with month-over-month change. */
export function categorySlices(cur: Transaction[], last: Transaction[]): CategorySlice[] {
  const curTotals = totalsByCategory(cur);
  const lastTotals = totalsByCategory(last);
  const grand = [...curTotals.values()].reduce((a, b) => a + b, 0);
  if (grand <= 0) return [];
  return [...curTotals.entries()]
    .map(([category, total]) => {
      const prev = lastTotals.get(category) ?? 0;
      let changePct: number | null = null;
      let changeDir: 'up' | 'down' | 'flat' = 'flat';
      if (prev > 0) {
        changePct = Math.round((Math.abs(total - prev) / prev) * 100);
        changeDir = total > prev ? 'up' : total < prev ? 'down' : 'flat';
      }
      return {
        category,
        total,
        share: Math.round((total / grand) * 100),
        changePct,
        changeDir,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export type TxDay = { date: string; label: string; items: Transaction[] };

function dayLabelFor(iso: string, today: Date): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Transactions grouped by day, newest day first (input is already newest-first). */
export function groupTxnsByDay(txns: Transaction[], today = new Date()): TxDay[] {
  const out: TxDay[] = [];
  for (const t of txns) {
    const last = out[out.length - 1];
    if (last && last.date === t.tx_date) last.items.push(t);
    else out.push({ date: t.tx_date, label: dayLabelFor(t.tx_date, today), items: [t] });
  }
  return out;
}

/** "9:50 PM" from the row's created_at (falls back to empty for old rows). */
export function txTime(t: Transaction): string {
  if (!t.created_at) return '';
  return new Date(t.created_at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
