-- Debts & IOUs: what you still owe, and what others owe you.
-- Feeds Net Worth on the Accounts pane.

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('owe', 'owed')), -- owe = you owe them; owed = they owe you
  counterparty text not null check (length(trim(counterparty)) between 1 and 80),
  amount numeric(14,2) not null check (amount >= 0),
  note text check (note is null or length(note) <= 200),
  due_date date,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists debts_user_idx on public.debts (user_id, settled, kind);

alter table public.debts enable row level security;

create policy debts_select on public.debts
  for select to authenticated using (user_id = auth.uid());
create policy debts_insert on public.debts
  for insert to authenticated with check (user_id = auth.uid());
create policy debts_update on public.debts
  for update to authenticated using (user_id = auth.uid());
create policy debts_delete on public.debts
  for delete to authenticated using (user_id = auth.uid());
