import { supabase } from '../lib/supabase';
import * as Crypto from 'expo-crypto';
import { finiteNumber, positiveFiniteNumber } from './numeric';

/** Banks & wallets (left pane) and savings goals (right pane). */

export type AccountKind = 'bank' | 'wallet' | 'cash' | 'other';

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  balance: number;
  created_at: string;
};

export type SavingsGoal = {
  id: string;
  name: string;
  target: number | null;
  saved: number;
  created_at: string;
};

export const ACCOUNT_KINDS: { value: AccountKind; label: string; icon: string }[] = [
  { value: 'bank', label: 'Bank', icon: 'business-outline' },
  { value: 'wallet', label: 'E-wallet', icon: 'wallet-outline' },
  { value: 'cash', label: 'Cash', icon: 'cash-outline' },
  { value: 'other', label: 'Other', icon: 'card-outline' },
];

export function accountKindMeta(kind: string) {
  return ACCOUNT_KINDS.find((k) => k.value === kind) ?? ACCOUNT_KINDS[ACCOUNT_KINDS.length - 1];
}

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id,name,kind,balance,created_at')
    .order('balance', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a: any) => ({
    ...a,
    balance: finiteNumber(a.balance, 'account balance'),
  }));
}

export async function getAccount(id: string): Promise<Account | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id,name,kind,balance,created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, balance: finiteNumber(data.balance, 'account balance') } : null;
}

export type AccountInput = { name: string; kind: AccountKind; balance: number };

export async function addAccount(input: AccountInput): Promise<void> {
  const { error } = await supabase.from('accounts').insert(input);
  if (error) throw error;
}

export async function updateAccount(id: string, input: AccountInput): Promise<void> {
  const { error } = await supabase.from('accounts').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function listSavings(): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('id,name,target,saved,created_at')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((g: any) => ({
    ...g,
    target: g.target == null ? null : finiteNumber(g.target, 'savings target'),
    saved: finiteNumber(g.saved, 'savings amount'),
  }));
}

export async function getSavingsGoal(id: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('id,name,target,saved,created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    target: data.target == null ? null : finiteNumber(data.target, 'savings target'),
    saved: finiteNumber(data.saved, 'savings amount'),
  };
}

export type SavingsInput = { name: string; target: number | null; saved: number };

export async function addSavingsGoal(input: SavingsInput): Promise<void> {
  const { error } = await supabase.from('savings_goals').insert(input);
  if (error) throw error;
}

export async function updateSavingsGoal(id: string, input: SavingsInput): Promise<void> {
  const { error } = await supabase.from('savings_goals').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  const { error } = await supabase.from('savings_goals').delete().eq('id', id);
  if (error) throw error;
}

// ---- debts & IOUs ----

export type DebtKind = 'owe' | 'owed'; // owe = you owe them; owed = they owe you

export type Debt = {
  id: string;
  kind: DebtKind;
  counterparty: string;
  amount: number;
  note: string | null;
  due_date: string | null;
  settled: boolean;
  created_at: string;
  // credit-card mode (is_card): monthly cycle + one-tap payments that deduct
  due_day: number | null;
  monthly_payment: number | null;
  credit_limit: number | null;
  is_card: boolean;
  last_paid_at: string | null;
};

const DEBT_SELECT =
  'id,kind,counterparty,amount,note,due_date,settled,created_at,due_day,monthly_payment,credit_limit,is_card,last_paid_at';

export async function listDebts(): Promise<Debt[]> {
  const { data, error } = await supabase
    .from('debts')
    .select(DEBT_SELECT)
    .order('settled')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d: any) => ({
    ...d,
    amount: finiteNumber(d.amount, 'debt amount'),
    monthly_payment:
      d.monthly_payment == null ? null : finiteNumber(d.monthly_payment, 'monthly payment'),
    credit_limit: d.credit_limit == null ? null : finiteNumber(d.credit_limit, 'credit limit'),
  }));
}

export async function getDebt(id: string): Promise<Debt | null> {
  const { data, error } = await supabase.from('debts').select(DEBT_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data
    ? {
        ...data,
        amount: finiteNumber(data.amount, 'debt amount'),
        monthly_payment:
          data.monthly_payment == null
            ? null
            : finiteNumber(data.monthly_payment, 'monthly payment'),
        credit_limit:
          data.credit_limit == null ? null : finiteNumber(data.credit_limit, 'credit limit'),
      }
    : null;
}

export type DebtInput = {
  kind: DebtKind;
  counterparty: string;
  amount: number;
  note: string | null;
  due_date: string | null;
};

export async function addDebt(input: DebtInput): Promise<void> {
  const { error } = await supabase.from('debts').insert(input);
  if (error) throw error;
}

export async function updateDebt(id: string, input: DebtInput): Promise<void> {
  const { error } = await supabase.from('debts').update(input).eq('id', id);
  if (error) throw error;
}

export async function setDebtSettled(id: string, settled: boolean): Promise<void> {
  const { error } = await supabase.from('debts').update({ settled }).eq('id', id);
  if (error) throw error;
}

// ---- credit cards (debts with is_card) ----

export async function addCard(input: {
  counterparty: string;
  amount: number;
  monthly_payment: number | null;
  due_day: number | null;
  credit_limit: number | null;
}): Promise<void> {
  const { error } = await supabase.from('debts').insert({
    kind: 'owe',
    counterparty: input.counterparty,
    amount: input.amount,
    note: null,
    due_date: null,
    is_card: true,
    monthly_payment: input.monthly_payment,
    due_day: input.due_day,
    credit_limit: input.credit_limit,
  });
  if (error) throw error;
}

/** One tap: log the payment, deduct it from the balance. 0 left = settled. */
export async function payCard(
  card: Debt,
  amount: number,
  idempotencyKey = Crypto.randomUUID(),
): Promise<number> {
  const payment = positiveFiniteNumber(amount, 'Payment amount');
  const balance = finiteNumber(card.amount, 'card balance');
  if (payment > balance) throw new Error('Payment cannot exceed the current card balance.');
  const { data, error } = await supabase.rpc('pay_card_atomic', {
    p_debt_id: card.id,
    p_amount: payment,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return finiteNumber(data, 'remaining card balance');
}

/** Paid within the current calendar month? */
export function cardPaidThisMonth(card: Debt): boolean {
  if (!card.last_paid_at) return false;
  const now = new Date();
  const [y, m] = card.last_paid_at.split('-').map(Number);
  return y === now.getFullYear() && m === now.getMonth() + 1;
}

/** ~months to clear at the planned monthly payment. */
export function cardMonthsLeft(card: Debt): number | null {
  if (!card.monthly_payment || card.monthly_payment <= 0 || card.amount <= 0) return null;
  return Math.ceil(card.amount / card.monthly_payment);
}

/** Credit-limit view: what's left to spend and how much of the limit is used. */
export function cardCredit(card: Debt): { available: number; usedPct: number } | null {
  if (!card.credit_limit || card.credit_limit <= 0) return null;
  const available = Math.max(0, Math.round((card.credit_limit - card.amount) * 100) / 100);
  const usedPct = Math.min(1, Math.max(0, card.amount / card.credit_limit));
  return { available, usedPct };
}

export async function deleteDebt(id: string): Promise<void> {
  const { error } = await supabase.from('debts').delete().eq('id', id);
  if (error) throw error;
}
