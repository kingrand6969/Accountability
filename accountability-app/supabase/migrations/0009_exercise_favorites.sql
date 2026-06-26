-- Accountability App — per-user favorite exercises.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.exercise_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id text not null references public.exercises (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table public.exercise_favorites enable row level security;

drop policy if exists "Users read own favorites" on public.exercise_favorites;
create policy "Users read own favorites" on public.exercise_favorites
  for select using (auth.uid() = user_id);
drop policy if exists "Users insert own favorites" on public.exercise_favorites;
create policy "Users insert own favorites" on public.exercise_favorites
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users delete own favorites" on public.exercise_favorites;
create policy "Users delete own favorites" on public.exercise_favorites
  for delete using (auth.uid() = user_id);
