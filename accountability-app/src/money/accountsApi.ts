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
