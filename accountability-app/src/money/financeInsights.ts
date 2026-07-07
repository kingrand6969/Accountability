import { sumByKind } from './compute';
import { categoryMeta, formatAmount } from './categories';
import { categorySlices } from './insights';
import { billStatus, type Bill } from './billing';
import type { Transaction } from './types';

/**
 * "Smart insight" — private, on-device analytics that read like advice. No LLM,
 * no network: everything is computed from the user's own numbers, so nothing
 * leaves the app. (The hero already shows the pacing comparison; these are the
 * OTHER useful observations.)
 */

export type InsightTone = 'good' | 'warn' | 'neutral';
export type FinanceInsight = { key: string; icon: string; tone: InsightTone; text: string };

function txDay(t: Transaction): number {
  return parseInt(t.tx_date.slice(8, 10), 10);
}

export function buildFinanceInsights(args: {
  cur: Transaction[];
  last: Transaction[]; // full previous month
  bills: Bill[];
  today: Date;
}): FinanceInsight[] {
  const { cur, last, bills, today } = args;
  const day = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const expense = sumByKind(cur, 'expense');
  const income = sumByKind(cur, 'income');
  const out: FinanceInsight[] = [];

  // bills due within a week — the most actionable
  const dueSoon = bills.filter((b) => {
    const s = billStatus(b, today);
    return !s.paid && s.daysLeft >= 0 && s.daysLeft <= 7;
  });
  if (dueSoon.length > 0) {
    const total = dueSoon.reduce(
      (a, b) => a + (b.category === 'credit_card' && b.min_payment != null ? b.min_payment : b.amount),
      0,
    );
    out.push({
      key: 'bills',
      icon: 'calendar-outline',
      tone: 'warn',
      text: `${formatAmount(total)} in bills due within 7 days.`,
    });
  }

  // biggest category jump vs the same point last month
  const lastToDate = last.filter((t) => txDay(t) <= day);
  const slices = categorySlices(cur, lastToDate);
  const jump = slices
    .filter((s) => s.changeDir === 'up' && (s.changePct ?? 0) >= 25 && s.total >= 100)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))[0];
  if (jump) {
    out.push({
      key: 'jump',
      icon: 'arrow-up-circle-outline',
      tone: 'warn',
      text: `${categoryMeta(jump.category).label} spending is up ${jump.changePct}% vs last month.`,
    });
  }

  // month-end forecast at the current pace
  if (expense > 0 && day >= 2) {
    const projected = Math.round((expense / day) * daysInMonth);
    out.push({
      key: 'forecast',
      icon: 'trending-up-outline',
      tone: 'neutral',
      text: `At this pace you'll spend about ${formatAmount(projected)} by month-end.`,
    });
  }

  // net positive — reinforce the good behaviour
  if (income > 0 && income > expense) {
    out.push({
      key: 'saved',
      icon: 'checkmark-circle-outline',
      tone: 'good',
      text: `You're net positive — ${formatAmount(income - expense)} kept this month.`,
    });
  }

  // where most of it goes
  if (slices.length > 0 && expense > 0 && slices[0].share >= 30) {
    out.push({
      key: 'top',
      icon: 'pie-chart-outline',
      tone: 'neutral',
      text: `${categoryMeta(slices[0].category).label} is ${slices[0].share}% of your spending.`,
    });
  }

  if (out.length === 0) {
    out.push({
      key: 'start',
      icon: 'sparkles-outline',
      tone: 'neutral',
      text: 'Log a few transactions and your money patterns will show up here.',
    });
  }
  return out;
}
