import { supabase } from '../lib/supabase';
import { toLocalDateString } from '../timeline/datetime';
import { monthRange } from './compute';
import type { NewTransaction, Transaction } from './types';
import { finiteNumber } from './numeric';

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
  return (data ?? []).map((t: any) => ({
    ...t,
    amount: finiteNumber(t.amount, 'transaction amount'),
  })) as Transaction[];
}

export type IncomeMonth = { month: string; total: number };

/**
 * Income totalled per calendar month for the last `months` months (Pro feature).
 * The database does the grouping (migration 0068) so this is ~12 rows, not a
 * year of transactions. Months with no income are filled in as zero here so the
 * chart always shows a continuous timeline.
 */
export async function getIncomeTrend(months = 12): Promise<IncomeMonth[]> {
  const { data, error } = await supabase.rpc('income_trend', { p_months: months });
  if (error) throw error;
  const byMonth = new Map<string, number>();
  for (const r of (data ?? []) as { month: string; total: number | string }[]) {
    byMonth.set(String(r.month).slice(0, 7), finiteNumber(r.total, 'income trend total'));
  }
  const out: IncomeMonth[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() - (months - 1));
  for (let i = 0; i < months; i++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    out.push({ month: key, total: byMonth.get(key) ?? 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export async function addTransaction(tx: NewTransaction): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('money_transactions')
    .insert({ ...tx, user_id: uid });
  if (error) throw error;
  // A DB trigger (migration 0021) mirrors this onto the timeline atomically
  // (and removes the mirror on delete) — no client-side second insert.
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('money_transactions').delete().eq('id', id);
  if (error) throw error;
}
