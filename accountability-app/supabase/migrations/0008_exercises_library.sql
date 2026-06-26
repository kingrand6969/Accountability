-- Accountability App — full exercise library (seeded from the public-domain
-- free-exercise-db). Read-only reference data for the Gym browser.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.exercises (
  id text primary key,
  name text not null,
  category text,
  equipment text,
  level text,
  primary_muscles text[],
  images text[],
  instructions text[]
);

create index if not exists exercises_equipment_idx on public.exercises (equipment);
create index if not exists exercises_muscles_idx
  on public.exercises using gin (primary_muscles);
create index if not exists exercises_name_idx on public.exercises (lower(name));

alter table public.exercises enable row level security;

drop policy if exists "Exercises readable by authenticated" on public.exercises;
create policy "Exercises readable by authenticated" on public.exercises
  for select using (auth.role() = 'authenticated');
