/** Pure due-date math for monthly bills — no I/O, fully unit-tested. */

export type BillCategory =
  | 'electricity'
  | 'water'
  | 'internet'
  | 'cable'
  | 'phone'
  | 'rent'
  | 'streaming'
  | 'insurance'
  | 'credit_card'
  | 'other';

export type Bill = {
  id: string;
  name: string;
  category: BillCategory;
  amount: number;
  min_payment: number | null;
  due_day: number;
  last_paid_month: string | null;
  created_at: string;
};

export const BILL_CATEGORIES: { value: BillCategory; label: string; icon: string }[] = [
  { value: 'electricity', label: 'Electricity', icon: 'flash-outline' },
  { value: 'water', label: 'Water', icon: 'water-outline' },
  { value: 'internet', label: 'Internet', icon: 'wifi-outline' },
  { value: 'cable', label: 'Cable / TV', icon: 'tv-outline' },
  { value: 'phone', label: 'Phone', icon: 'phone-portrait-outline' },
  { value: 'rent', label: 'Rent', icon: 'home-outline' },
  { value: 'streaming', label: 'Streaming', icon: 'play-circle-outline' },
  { value: 'insurance', label: 'Insurance', icon: 'shield-checkmark-outline' },
  { value: 'credit_card', label: 'Credit card', icon: 'card-outline' },
  { value: 'other', label: 'Other', icon: 'receipt-outline' },
];

export function billCategoryMeta(value: string) {
  return BILL_CATEGORIES.find((c) => c.value === value) ?? BILL_CATEGORIES[BILL_CATEGORIES.length - 1];
}

/** 'YYYY-MM' for a date — the unit a bill is paid in. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Due date for a 1–31 due day within the given month, clamped to the month's
 *  last day (a bill due "the 31st" is due Jun 30 in June). */
export function dueDateInMonth(dueDay: number, ref: Date): Date {
  const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  return new Date(ref.getFullYear(), ref.getMonth(), Math.min(dueDay, lastDay));
}

export type BillStatus = {
  paid: boolean;
  dueDate: Date;
  /** days until due this month; negative = overdue */
  daysLeft: number;
  overdue: boolean;
  dueSoon: boolean; // within 3 days
};

export function billStatus(bill: Pick<Bill, 'due_day' | 'last_paid_month'>, today: Date): BillStatus {
  const paid = bill.last_paid_month === monthKey(today);
  const dueDate = dueDateInMonth(bill.due_day, today);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLeft = Math.round((dueDate.getTime() - startOfToday.getTime()) / 86400000);
  return {
    paid,
    dueDate,
    daysLeft,
    overdue: !paid && daysLeft < 0,
    dueSoon: !paid && daysLeft >= 0 && daysLeft <= 3,
  };
}

/** Human label: "Paid", "Due today", "3 days left", "5 days overdue", "Due Jul 15". */
export function dueLabel(s: BillStatus): string {
  if (s.paid) return 'Paid this month';
  if (s.daysLeft === 0) return 'Due today';
  if (s.overdue) return `${-s.daysLeft} day${s.daysLeft === -1 ? '' : 's'} overdue`;
  if (s.dueSoon) return `${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left`;
  return `Due ${s.dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** Sort: overdue first, then unpaid by soonest due, paid last. */
export function sortBills<T extends Pick<Bill, 'due_day' | 'last_paid_month'>>(
  bills: T[],
  today: Date,
): T[] {
  return [...bills].sort((a, b) => {
    const sa = billStatus(a, today);
    const sb = billStatus(b, today);
    if (sa.paid !== sb.paid) return sa.paid ? 1 : -1;
    return sa.daysLeft - sb.daysLeft;
  });
}

/** Total still to pay this month (unpaid bills; credit cards count min payment
 *  if set, else the full statement). */
export function unpaidTotal(bills: Bill[], today: Date): number {
  return bills.reduce((sum, b) => {
    if (billStatus(b, today).paid) return sum;
    const due = b.category === 'credit_card' && b.min_payment != null ? b.min_payment : b.amount;
    return sum + due;
  }, 0);
}

/** Amount that needs immediate attention: overdue bills plus unpaid bills due
 * today or within the next three days. Later bills and paid bills are excluded. */
export function billAttentionTotal(bills: Bill[], today: Date): number {
  return bills.reduce((sum, bill) => {
    const status = billStatus(bill, today);
    if (status.paid || (!status.overdue && !status.dueSoon)) return sum;
    const due =
      bill.category === 'credit_card' && bill.min_payment != null
        ? bill.min_payment
        : bill.amount;
    return sum + due;
  }, 0);
}
