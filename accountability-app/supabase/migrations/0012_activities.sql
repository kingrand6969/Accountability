-- Accountability App — GPS activities (runs/walks/rides).
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('run', 'walk', 'ride')),
  distance_m numeric not null default 0,
  duration_s integer not null default 0,
  route jsonb,
  started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists activities_user_started_idx
  on public.activities (user_id, started_at);

alter table public.activities enable row level security;

drop policy if exists "Users read own activities" on public.activities;
create policy "Users read own activities" on public.activities
  for select using (auth.uid() = user_id);
drop policy if exists "Users insert own activities" on public.activities;
create policy "Users insert own activities" on public.activities
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users delete own activities" on public.activities;
create policy "Users delete own activities" on public.activities
  for delete using (auth.uid() = user_id);
