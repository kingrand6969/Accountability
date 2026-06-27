import { describe, it, expect } from '@jest/globals';
import { sumByKind, groupByCategory } from './compute';
import type { Transaction } from './types';

const txns: Transaction[] = [
  { id: '1', kind: 'income', amount: 2000, category: 'salary', note: null, tx_date: '2026-06-01' },
  { id: '2', kind: 'expense', amount: 50, category: 'food', note: null, tx_date: '2026-06-02' },
  { id: '3', kind: 'expense', amount: 30, category: 'food', note: null, tx_date: '2026-06-03' },
  { id: '4', kind: 'expense', amount: 100, category: 'bills', note: null, tx_date: '2026-06-04' },
];

describe('sumByKind', () => {
  it('sums income and expenses separately', () => {
    expect(sumByKind(txns, 'income')).toBe(2000);
    expect(sumByKind(txns, 'expense')).toBe(180);
  });
});

describe('groupByCategory', () => {
  it('groups expenses by category, sorted by total desc', () => {
    const g = groupByCategory(txns);
    expect(g).toEqual([
      { category: 'bills', total: 100 },
      { category: 'food', total: 80 },
    ]);
  });
  it('ignores income', () => {
    const g = groupByCategory(txns);
    expect(g.find((x) => x.category === 'salary')).toBeUndefined();
  });
});
