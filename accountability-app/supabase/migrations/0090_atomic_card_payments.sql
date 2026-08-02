-- Atomic, authenticated and retry-safe card/debt payment.
alter table public.debt_payments
  add column if not exists idempotency_key uuid;

create unique index if not exists debt_payments_user_idempotency_uidx
  on public.debt_payments (user_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.pay_card_atomic(
  p_debt_id uuid,
  p_amount numeric,
  p_idempotency_key uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_debt public.debts%rowtype;
  v_existing uuid;
  v_left numeric(14,2);
  v_amount numeric(14,2);
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;
  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount::text in ('NaN', 'Infinity', '-Infinity')
     or v_amount <= 0 then
    raise exception 'Payment amount must be finite and greater than zero';
  end if;

  select * into v_debt
  from public.debts
  where id = p_debt_id and user_id = v_uid and is_card = true
  for update;
  if not found then raise exception 'Card not found'; end if;

  select debt_id into v_existing
  from public.debt_payments
  where user_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if v_existing <> p_debt_id then
      raise exception 'Idempotency key already used for another card';
    end if;
    return v_debt.amount;
  end if;
  if v_debt.settled or v_debt.amount <= 0 then raise exception 'Card is already paid'; end if;
  if v_amount > v_debt.amount then raise exception 'Payment exceeds current balance'; end if;

  insert into public.debt_payments (user_id, debt_id, amount, paid_at, idempotency_key)
  values (v_uid, v_debt.id, v_amount, current_date, p_idempotency_key);

  v_left := round(v_debt.amount - v_amount, 2);
  update public.debts
  set amount = v_left,
      last_paid_at = current_date,
      settled = (v_left = 0)
  where id = v_debt.id and user_id = v_uid;

  return v_left;
end;
$$;

revoke all on function public.pay_card_atomic(uuid, numeric, uuid) from public, anon;
grant execute on function public.pay_card_atomic(uuid, numeric, uuid) to authenticated;
