import { describe, it, expect } from '@jest/globals';
import { buildFinanceInsights } from './financeInsights';
import type { Transaction } from './types';
import type { Bill } from './billing';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  kind: 'expense',
  amount: 100,
  category: 'food',
  note: null,
  tx_date: '2026-07-10',
  created_at: '2026-07-10T10:00:00Z',
  ...over,
});

const bill = (over: Partial<Bill>): Bill => ({
  id: Math.random().toString(36).slice(2),
  name: 'Electric',
  category: 'electricity',
  amount: 500,
  min_payment: null,
  due_day: 15,
  last_paid_month: null,
  created_at: '2026-01-01',
  ...over,
});

const today = new Date(2026, 6, 10); // Jul 10

describe('buildFinanceInsights', () => {
  it('forecasts month-end spend from the current pace', () => {
    // 1000 over 10 days → ~3100 for 31-day July
    const cur = [tx({ amount: 1000 })];
    const r = buildFinanceInsights({ cur, last: [], bills: [], today });
    const f = r.find((i) => i.key === 'forecast');
    expect(f).toBeTruthy();
    expect(f!.text).toContain('3,100');
  });

  it('flags a category jump vs last month', () => {
    const cur = [tx({ category: 'shopping', amount: 400 })];
    const last = [tx({ category: 'shopping', amount: 100, tx_date: '2026-06-05' })];
    const r = buildFinanceInsights({ cur, last, bills: [], today });
    expect(r.find((i) => i.key === 'jump')?.text).toContain('Shopping');
  });

  it('warns about bills due within a week', () => {
    const cur = [tx({ amount: 100 })];
    const r = buildFinanceInsights({ cur, last: [], bills: [bill({ due_day: 15, amount: 500 })], today });
    const b = r.find((i) => i.key === 'bills');
    expect(b?.tone).toBe('warn');
    expect(b?.text).toContain('500');
  });

  it('celebrates a net-positive month', () => {
    const cur = [tx({ kind: 'income', amount: 5000 }), tx({ amount: 1000 })];
    const r = buildFinanceInsights({ cur, last: [], bills: [], today });
    expect(r.find((i) => i.key === 'saved')?.tone).toBe('good');
  });

  it('falls back to an onboarding nudge with no data', () => {
    const r = buildFinanceInsights({ cur: [], last: [], bills: [], today });
    expect(r).toHaveLength(1);
    expect(r[0].key).toBe('start');
  });
});
