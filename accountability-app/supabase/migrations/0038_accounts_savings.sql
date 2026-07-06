-- Finance side-panes: banks & wallets (left swipe) and savings goals (right swipe).

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  kind text not null check (kind in ('bank', 'wallet', 'cash', 'other')),
  balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  target numeric(14,2) check (target is null or target > 0),
  saved numeric(14,2) not null default 0 check (saved >= 0),
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
alter table public.savings_goals enable row level security;

create policy accounts_select on public.accounts
  for select to authenticated using (user_id = auth.uid());
create policy accounts_insert on public.accounts
  for insert to authenticated with check (user_id = auth.uid());
create policy accounts_update on public.accounts
  for update to authenticated using (user_id = auth.uid());
create policy accounts_delete on public.accounts
  for delete to authenticated using (user_id = auth.uid());

create policy savings_select on public.savings_goals
  for select to authenticated using (user_id = auth.uid());
create policy savings_insert on public.savings_goals
  for insert to authenticated with check (user_id = auth.uid());
create policy savings_update on public.savings_goals
  for update to authenticated using (user_id = auth.uid());
create policy savings_delete on public.savings_goals
  for delete to authenticated using (user_id = auth.uid());
