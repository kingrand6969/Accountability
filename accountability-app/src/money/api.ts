import { supabase } from '../lib/supabase';
import { toLocalDateString } from '../timeline/datetime';
import { createItem } from '../timeline/api';
import { monthRange } from './compute';
import { categoryMeta, formatAmount } from './categories';
import type { NewTransaction, Transaction } from './types';

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function todayDate(): string {
  return toLocalDateString(new Date());
}

export async function listMonth(month: Date): Promise<Transaction[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { startIso, endIso } = monthRange(month);
  const { data, error } = await supabase
    .from('money_transactions')
    .select('id,kind,amount,category,note,tx_date,created_at')
    .eq('user_id', uid)
    .gte('tx_date', startIso)
    .lt('tx_date', endIso)
    .order('tx_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t: any) => ({ ...t, amount: Number(t.amount) })) as Transaction[];
}

export async function addTransaction(tx: NewTransaction): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('money_transactions')
    .insert({ ...tx, user_id: uid });
  if (error) throw error;
  // Mirror onto the timeline so income/expense count toward today + streak.
  await createItem({
    type: tx.kind,
    title: tx.note?.trim() || categoryMeta(tx.category).label,
    note: formatAmount(tx.amount),
    starts_at: new Date(`${tx.tx_date}T12:00:00`).toISOString(),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('money_transactions').delete().eq('id', id);
  if (error) throw error;
}
