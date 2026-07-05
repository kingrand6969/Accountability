import { describe, it, expect } from '@jest/globals';
import {
  billStatus,
  dueDateInMonth,
  dueLabel,
  monthKey,
  sortBills,
  unpaidTotal,
  type Bill,
} from './billing';

const bill = (over: Partial<Bill>): Bill => ({
  id: 'x',
  name: 'Test',
  category: 'electricity',
  amount: 100,
  min_payment: null,
  due_day: 15,
  last_paid_month: null,
  created_at: '2026-01-01',
  ...over,
});

describe('monthKey', () => {
  it('pads the month', () => {
    expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01');
    expect(monthKey(new Date(2026, 11, 31))).toBe('2026-12');
  });
});

describe('dueDateInMonth', () => {
  it('uses the due day within the month', () => {
    expect(dueDateInMonth(15, new Date(2026, 6, 5)).getDate()).toBe(15);
  });
  it('clamps day 31 to shorter months', () => {
    const d = dueDateInMonth(31, new Date(2026, 5, 10)); // June
    expect(d.getDate()).toBe(30);
    expect(d.getMonth()).toBe(5);
  });
  it('clamps to Feb 28 on non-leap years', () => {
    expect(dueDateInMonth(30, new Date(2026, 1, 3)).getDate()).toBe(28);
  });
});

describe('billStatus', () => {
  const today = new Date(2026, 6, 5); // Jul 5
  it('counts days left', () => {
    const s = billStatus(bill({ due_day: 8 }), today);
    expect(s.daysLeft).toBe(3);
    expect(s.dueSoon).toBe(true);
    expect(s.overdue).toBe(false);
  });
  it('flags overdue', () => {
    const s = billStatus(bill({ due_day: 1 }), today);
    expect(s.overdue).toBe(true);
    expect(s.daysLeft).toBe(-4);
  });
  it('paid this month wins over overdue', () => {
    const s = billStatus(bill({ due_day: 1, last_paid_month: '2026-07' }), today);
    expect(s.paid).toBe(true);
    expect(s.overdue).toBe(false);
  });
  it('a payment from LAST month does not count', () => {
    const s = billStatus(bill({ due_day: 1, last_paid_month: '2026-06' }), today);
    expect(s.paid).toBe(false);
  });
});

describe('dueLabel', () => {
  const today = new Date(2026, 6, 5);
  it('due today', () => {
    expect(dueLabel(billStatus(bill({ due_day: 5 }), today))).toBe('Due today');
  });
  it('days overdue', () => {
    expect(dueLabel(billStatus(bill({ due_day: 3 }), today))).toBe('2 days overdue');
  });
  it('paid', () => {
    expect(dueLabel(billStatus(bill({ last_paid_month: '2026-07' }), today))).toBe(
      'Paid this month',
    );
  });
});

describe('sortBills', () => {
  it('overdue first, paid last', () => {
    const today = new Date(2026, 6, 5);
    const list = [
      bill({ id: 'paid', due_day: 1, last_paid_month: '2026-07' }),
      bill({ id: 'later', due_day: 25 }),
      bill({ id: 'overdue', due_day: 2 }),
      bill({ id: 'soon', due_day: 7 }),
    ];
    expect(sortBills(list, today).map((b) => b.id)).toEqual([
      'overdue',
      'soon',
      'later',
      'paid',
    ]);
  });
});

describe('unpaidTotal', () => {
  const today = new Date(2026, 6, 5);
  it('sums unpaid bills, credit cards at min payment', () => {
    const list = [
      bill({ amount: 120 }), // unpaid utility
      bill({ amount: 80, last_paid_month: '2026-07' }), // paid — excluded
      bill({ category: 'credit_card', amount: 1500, min_payment: 45 }), // min due
      bill({ category: 'credit_card', amount: 900, min_payment: null }), // full statement
    ];
    expect(unpaidTotal(list, today)).toBe(120 + 45 + 900);
  });
});
