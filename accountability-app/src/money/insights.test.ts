import { describe, it, expect } from '@jest/globals';
import {
  categorySlices,
  categoryTint,
  groupTxnsByDay,
  spendingInsight,
} from './insights';
import type { Transaction } from './types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  kind: 'expense',
  amount: 100,
  category: 'food',
  note: null,
  tx_date: '2026-07-05',
  created_at: '2026-07-05T21:50:00Z',
  ...over,
});

describe('spendingInsight', () => {
  it('down vs last month', () => {
    const s = spendingInsight(80, 100);
    expect(s.direction).toBe('down');
    expect(s.pct).toBe(20);
    expect(s.diff).toBe(-20);
  });
  it('up vs last month', () => {
    expect(spendingInsight(150, 100).direction).toBe('up');
    expect(spendingInsight(150, 100).pct).toBe(50);
  });
  it('no last month data', () => {
    const s = spendingInsight(50, 0);
    expect(s.direction).toBe('none');
    expect(s.pct).toBeNull();
  });
  it('flat', () => {
    expect(spendingInsight(100, 100).direction).toBe('flat');
  });
});

describe('categorySlices', () => {
  it('shares sum to ~100 and sort by size', () => {
    const cur = [
      tx({ category: 'food', amount: 300 }),
      tx({ category: 'bills', amount: 700 }),
    ];
    const s = categorySlices(cur, []);
    expect(s[0].category).toBe('bills');
    expect(s[0].share).toBe(70);
    expect(s[1].share).toBe(30);
  });
  it('change vs last month per category', () => {
    const cur = [tx({ category: 'food', amount: 120 })];
    const last = [tx({ category: 'food', amount: 100, tx_date: '2026-06-10' })];
    const s = categorySlices(cur, last);
    expect(s[0].changePct).toBe(20);
    expect(s[0].changeDir).toBe('up');
  });
  it('new category this month has null change', () => {
    const s = categorySlices([tx({ category: 'fun' })], []);
    expect(s[0].changePct).toBeNull();
  });
  it('income is excluded', () => {
    const s = categorySlices([tx({ kind: 'income', category: 'salary' })], []);
    expect(s).toHaveLength(0);
  });
});

describe('groupTxnsByDay', () => {
  it('groups consecutive same-day rows with friendly labels', () => {
    const today = new Date(2026, 6, 5);
    const days = groupTxnsByDay(
      [
        tx({ tx_date: '2026-07-05' }),
        tx({ tx_date: '2026-07-05' }),
        tx({ tx_date: '2026-07-04' }),
        tx({ tx_date: '2026-07-01' }),
      ],
      today,
    );
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Wed, Jul 1']);
    expect(days[0].items).toHaveLength(2);
  });
});

describe('categoryTint', () => {
  it('falls back to the neutral tint', () => {
    expect(categoryTint('unknown')).toBe(categoryTint('other'));
  });
});
