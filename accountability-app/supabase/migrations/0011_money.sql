-- Accountability App — money tracker (income & expenses).
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.money_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric not null check (amount >= 0),
  category text not null,
  note text,
  tx_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists money_tx_user_date_idx
  on public.money_transactions (user_id, tx_date);

alter table public.money_transactions enable row level security;

drop policy if exists "Users read own transactions" on public.money_transactions;
create policy "Users read own transactions" on public.money_transactions
  for select using (auth.uid() = user_id);
drop policy if exists "Users insert own transactions" on public.money_transactions;
create policy "Users insert own transactions" on public.money_transactions
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users delete own transactions" on public.money_transactions;
create policy "Users delete own transactions" on public.money_transactions
  for delete using (auth.uid() = user_id);
