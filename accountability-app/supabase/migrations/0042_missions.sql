-- Missions: lightweight per-user progress for action quests (flex your rank,
-- share a run selfie at distance milestones, …). Metric-based missions (streak,
-- buddies, challenges, distance) are computed client-side from data we already
-- store, so only *action* missions ever land a row here.

create table if not exists public.mission_progress (
  user_id    uuid not null references auth.users (id) on delete cascade,
  mission_id text not null,
  value      numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, mission_id)
);

alter table public.mission_progress enable row level security;

-- a member only ever sees / writes their own progress
drop policy if exists mission_progress_select on public.mission_progress;
create policy mission_progress_select on public.mission_progress
  for select using (auth.uid() = user_id);

drop policy if exists mission_progress_insert on public.mission_progress;
create policy mission_progress_insert on public.mission_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists mission_progress_update on public.mission_progress;
create policy mission_progress_update on public.mission_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atomically advance a mission. p_max=false increments (value += p_value);
-- p_max=true keeps the high-water mark (value = greatest(value, p_value)) —
-- used by the run-selfie mission where p_value is the run's distance in km.
create or replace function public.mission_bump(p_mission text, p_value numeric, p_max boolean)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.mission_progress (user_id, mission_id, value, updated_at)
  values (auth.uid(), p_mission, p_value, now())
  on conflict (user_id, mission_id) do update
    set value = case
                  when p_max then greatest(public.mission_progress.value, excluded.value)
                  else public.mission_progress.value + excluded.value
                end,
        updated_at = now()
  returning value into v;
  return v;
end;
$$;

revoke all on function public.mission_bump(text, numeric, boolean) from public, anon;
grant execute on function public.mission_bump(text, numeric, boolean) to authenticated;
