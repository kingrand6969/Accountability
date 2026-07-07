import { supabase } from '../lib/supabase';

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
  return (data ?? []).map((a: any) => ({ ...a, balance: Number(a.balance) }));
}

export async function getAccount(id: string): Promise<Account | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id,name,kind,balance,created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, balance: Number(data.balance) } : null;
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
    target: g.target == null ? null : Number(g.target),
    saved: Number(g.saved),
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
    target: data.target == null ? null : Number(data.target),
    saved: Number(data.saved),
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
};

const DEBT_SELECT = 'id,kind,counterparty,amount,note,due_date,settled,created_at';

export async function listDebts(): Promise<Debt[]> {
  const { data, error } = await supabase
    .from('debts')
    .select(DEBT_SELECT)
    .order('settled')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d: any) => ({ ...d, amount: Number(d.amount) }));
}

export async function getDebt(id: string): Promise<Debt | null> {
  const { data, error } = await supabase.from('debts').select(DEBT_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, amount: Number(data.amount) } : null;
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

export async function deleteDebt(id: string): Promise<void> {
  const { error } = await supabase.from('debts').delete().eq('id', id);
  if (error) throw error;
}
