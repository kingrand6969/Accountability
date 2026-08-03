import { supabase } from '../lib/supabase';
import * as Crypto from 'expo-crypto';
import { type Bill, type BillCategory } from './billing';
import { finiteNumber, positiveFiniteNumber } from './numeric';

const SELECT = 'id,name,category,amount,min_payment,due_day,last_paid_month,created_at';

function mapBill(row: any): Bill {
  return {
    ...row,
    amount: finiteNumber(row.amount, 'bill amount'),
    min_payment: row.min_payment == null ? null : finiteNumber(row.min_payment, 'bill minimum payment'),
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
export async function markBillPaid(
  bill: Bill,
  paidAmount = bill.amount,
  idempotencyKey = Crypto.randomUUID(),
): Promise<void> {
  const amount = positiveFiniteNumber(paidAmount, 'Payment amount');
  const { error } = await supabase.rpc('mark_bill_paid_atomic', {
    p_bill_id: bill.id,
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
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
