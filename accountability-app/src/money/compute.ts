import type { Transaction, TxKind } from './types';

export function sumByKind(txns: Transaction[], kind: TxKind): number {
  return txns
    .filter((t) => t.kind === kind)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function groupByCategory(
  txns: Transaction[],
): { category: string; total: number }[] {
  const map: Record<string, number> = {};
  for (const t of txns) {
    if (t.kind !== 'expense') continue;
    map[t.category] = (map[t.category] ?? 0) + Number(t.amount || 0);
  }
  return Object.entries(map)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/** Local-month [start, end) as YYYY-MM-DD strings. */
export function monthRange(d: Date): { startIso: string; endIso: string } {
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(
      x.getDate(),
    ).padStart(2, '0')}`;
  return {
    startIso: fmt(new Date(d.getFullYear(), d.getMonth(), 1)),
    endIso: fmt(new Date(d.getFullYear(), d.getMonth() + 1, 1)),
  };
}
