import { supabase } from '../lib/supabase';
import { addTransaction, todayDate } from './api';
import { monthKey, type Bill, type BillCategory } from './billing';

const SELECT = 'id,name,category,amount,min_payment,due_day,last_paid_month,created_at';

function mapBill(row: any): Bill {
  return {
    ...row,
    amount: Number(row.amount),
    min_payment: row.min_payment == null ? null : Number(row.min_payment),
  } as Bill;
}

export async function listBills(): Promise<Bill[]> {
  const { data, error } = await supabase.from('bills').select(SELECT).order('due_day');
  if (error) throw error;
  return (data ?? []).map(mapBill);
}

export async function getBill(id: string): Promise<Bill | null> {
  const { data, error } = await supabase.from('bills').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapBill(data) : null;
}

export type BillInput = {
  name: string;
  category: BillCategory;
  amount: number;
  min_payment: number | null;
  due_day: number;
};

export async function addBill(input: BillInput): Promise<void> {
  const { error } = await supabase.from('bills').insert(input);
  if (error) throw error;
}

export async function updateBill(id: string, input: BillInput): Promise<void> {
  const { error } = await supabase.from('bills').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteBill(id: string): Promise<void> {
  const { error } = await supabase.from('bills').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Mark a bill paid for the current month and log the expense so it shows in
 * Transactions + "Where it goes". For credit cards the caller passes which
 * amount was paid (minimum or statement); other bills default to their amount.
 */
export async function markBillPaid(bill: Bill, paidAmount = bill.amount): Promise<void> {
  const { error } = await supabase
    .from('bills')
    .update({ last_paid_month: monthKey(new Date()) })
    .eq('id', bill.id);
  if (error) throw error;
  if (paidAmount > 0) {
    await addTransaction({
      kind: 'expense',
      amount: paidAmount,
      category: 'bills',
      note: bill.name,
      tx_date: todayDate(),
    });
  }
}

/** Undo an accidental "paid" tap — clears the flag (the logged transaction, if
 *  any, stays in the list where it can be deleted by hand). */
export async function unmarkBillPaid(bill: Bill): Promise<void> {
  const { error } = await supabase
    .from('bills')
    .update({ last_paid_month: null })
    .eq('id', bill.id);
  if (error) throw error;
}
