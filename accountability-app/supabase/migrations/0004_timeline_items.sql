-- Accountability App — the daily timeline spine.
-- Every pillar (calendar event, workout, meal, expense, activity) is a
-- time-stamped item on the user's day.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.timeline_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'event', 'task', 'workout', 'meal', 'expense', 'activity'
  )),
  title text not null,
  note text,
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists timeline_items_user_starts_idx
  on public.timeline_items (user_id, starts_at);

alter table public.timeline_items enable row level security;

drop policy if exists "Users read own timeline" on public.timeline_items;
create policy "Users read own timeline" on public.timeline_items
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own timeline" on public.timeline_items;
create policy "Users insert own timeline" on public.timeline_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own timeline" on public.timeline_items;
create policy "Users update own timeline" on public.timeline_items
  for update using (auth.uid() = user_id);

drop policy if exists "Users delete own timeline" on public.timeline_items;
create policy "Users delete own timeline" on public.timeline_items
  for delete using (auth.uid() = user_id);
