-- Diet & Money -> timeline mirroring moves into the database.
-- Previously the client did two separate inserts (food_log/transaction, then
-- timeline item): not atomic (retry after a partial failure double-counted)
-- and deletes left ghost timeline items. Triggers make the pair atomic and
-- symmetric.

alter table public.timeline_items
  add column if not exists source_id uuid;

create index if not exists timeline_items_source_idx
  on public.timeline_items (source_id)
  where source_id is not null;

-- food_logs -> 'meal' timeline item
create or replace function public.mirror_food_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.timeline_items (user_id, type, title, note, starts_at, source_id)
    values (
      new.user_id,
      'meal',
      new.name,
      round(new.calories)::text || ' kcal',
      -- log_date is the day the user logged for; anchor mid-day so it sorts sanely
      case
        when new.log_date = current_date then now()
        else new.log_date::timestamp + interval '12 hours'
      end,
      new.id
    );
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.timeline_items where source_id = old.id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists food_logs_mirror on public.food_logs;
create trigger food_logs_mirror
  after insert or delete on public.food_logs
  for each row execute function public.mirror_food_log();

-- money_transactions -> 'expense' / 'income' timeline item
create or replace function public.mirror_money_tx()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.timeline_items (user_id, type, title, note, starts_at, source_id)
    values (
      new.user_id,
      new.kind,
      coalesce(nullif(trim(new.note), ''), initcap(new.category)),
      new.amount::text,
      case
        when new.tx_date = current_date then now()
        else new.tx_date::timestamp + interval '12 hours'
      end,
      new.id
    );
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.timeline_items where source_id = old.id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists money_tx_mirror on public.money_transactions;
create trigger money_tx_mirror
  after insert or delete on public.money_transactions
  for each row execute function public.mirror_money_tx();
