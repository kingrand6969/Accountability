-- Accountability App — diet/calorie tracking.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

alter table public.profiles
  add column if not exists calorie_target integer not null default 2000;

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  name text not null,
  brand text,
  calories numeric not null default 0,
  protein numeric,
  carbs numeric,
  fat numeric,
  quantity_g numeric,
  created_at timestamptz not null default now()
);

create index if not exists food_logs_user_date_idx
  on public.food_logs (user_id, log_date);

alter table public.food_logs enable row level security;

drop policy if exists "Users read own food logs" on public.food_logs;
create policy "Users read own food logs" on public.food_logs
  for select using (auth.uid() = user_id);
drop policy if exists "Users insert own food logs" on public.food_logs;
create policy "Users insert own food logs" on public.food_logs
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users delete own food logs" on public.food_logs;
create policy "Users delete own food logs" on public.food_logs
  for delete using (auth.uid() = user_id);
