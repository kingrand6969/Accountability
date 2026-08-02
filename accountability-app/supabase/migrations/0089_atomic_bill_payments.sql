-- Atomic, authenticated and retry-safe bill payment.
alter table public.money_transactions
  add column if not exists idempotency_key uuid;
alter table public.money_transactions
  add column if not exists bill_id uuid references public.bills (id) on delete set null;

create unique index if not exists money_transactions_user_idempotency_uidx
  on public.money_transactions (user_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.mark_bill_paid_atomic(
  p_bill_id uuid,
  p_amount numeric,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_bill public.bills%rowtype;
  v_existing uuid;
  v_existing_bill uuid;
  v_transaction_id uuid;
  v_amount numeric(14,2);
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount::text in ('NaN', 'Infinity', '-Infinity')
     or v_amount <= 0 then
    raise exception 'Payment amount must be finite and greater than zero';
  end if;

  select id, bill_id into v_existing, v_existing_bill
  from public.money_transactions
  where user_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing_bill is distinct from p_bill_id then
      raise exception 'Idempotency key already used for another bill';
    end if;
    return v_existing;
  end if;

  select * into v_bill
  from public.bills
  where id = p_bill_id and user_id = v_uid
  for update;
  if not found then raise exception 'Bill not found'; end if;

  update public.bills
  set last_paid_month = to_char(current_date, 'YYYY-MM')
  where id = v_bill.id and user_id = v_uid;

  insert into public.money_transactions
    (user_id, kind, amount, category, note, tx_date, idempotency_key, bill_id)
  values
    (v_uid, 'expense', v_amount, 'bills', v_bill.name, current_date, p_idempotency_key, v_bill.id)
  returning id into v_transaction_id;

  return v_transaction_id;
exception
  when unique_violation then
    select id into v_transaction_id
    from public.money_transactions
    where user_id = v_uid and idempotency_key = p_idempotency_key;
    return v_transaction_id;
end;
$$;

revoke all on function public.mark_bill_paid_atomic(uuid, numeric, uuid) from public, anon;
grant execute on function public.mark_bill_paid_atomic(uuid, numeric, uuid) to authenticated;
