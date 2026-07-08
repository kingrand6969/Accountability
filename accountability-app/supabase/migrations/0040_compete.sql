-- Accountability App — Compete layer: opt-in location, buddy live-location,
-- Pro-created challenges (anyone joins), and city/country leaderboards.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Privacy model:
--   * Coarse city/country live on profiles (world-readable, but only populated
--     when the user opts in via share_location).
--   * PRECISE lat/lng live in buddy_locations, readable ONLY by the owner or an
--     accepted buddy (are_buddies) — never on the world-readable profiles row.
--   * Leaderboard/standings are security-definer AGGREGATES: they return a score
--     plus public profile fields, never raw activity rows.

--------------------------------------------------------------------------------
-- 1. Opt-in coarse location on profiles
--------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists share_location boolean not null default false;

-- table-level UPDATE was revoked in 0016; grant the new client-writable columns
grant update (city, country, share_location) on public.profiles to authenticated;

-- speeds up leaderboard eligibility scans
create index if not exists profiles_location_idx
  on public.profiles (country, city) where share_location;

--------------------------------------------------------------------------------
-- 2. Live buddy location (precise) — buddies-only
--------------------------------------------------------------------------------
create table if not exists public.buddy_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.buddy_locations enable row level security;

drop policy if exists "See own or buddy location" on public.buddy_locations;
create policy "See own or buddy location" on public.buddy_locations
  for select using (auth.uid() = user_id or public.are_buddies(auth.uid(), user_id));

drop policy if exists "Insert own location" on public.buddy_locations;
create policy "Insert own location" on public.buddy_locations
  for insert with check (auth.uid() = user_id);

drop policy if exists "Update own location" on public.buddy_locations;
create policy "Update own location" on public.buddy_locations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Delete own location" on public.buddy_locations;
create policy "Delete own location" on public.buddy_locations
  for delete using (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- 3. Challenges — only Pro can create, anyone can join
--------------------------------------------------------------------------------
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  metric text not null check (metric in ('consistency', 'distance', 'points')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.challenges enable row level security;
create index if not exists challenges_ends_idx on public.challenges (ends_at desc);

drop policy if exists "Challenges are public" on public.challenges;
create policy "Challenges are public" on public.challenges
  for select using (auth.role() = 'authenticated');

-- server-side Pro gate: must be the creator AND currently Pro
drop policy if exists "Pro users create challenges" on public.challenges;
create policy "Pro users create challenges" on public.challenges
  for insert with check (
    auth.uid() = creator_id
    and exists (select 1 from public.profiles where id = auth.uid() and is_pro = true)
  );

drop policy if exists "Creator edits challenge" on public.challenges;
create policy "Creator edits challenge" on public.challenges
  for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

drop policy if exists "Creator deletes challenge" on public.challenges;
create policy "Creator deletes challenge" on public.challenges
  for delete using (auth.uid() = creator_id);

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
alter table public.challenge_participants enable row level security;

drop policy if exists "Participants are public" on public.challenge_participants;
create policy "Participants are public" on public.challenge_participants
  for select using (auth.role() = 'authenticated');

drop policy if exists "Join a challenge" on public.challenge_participants;
create policy "Join a challenge" on public.challenge_participants
  for insert with check (auth.uid() = user_id);

drop policy if exists "Leave a challenge" on public.challenge_participants;
create policy "Leave a challenge" on public.challenge_participants
  for delete using (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- 4. Scoring — one internal helper, reused by every board
--------------------------------------------------------------------------------
-- Consistency = distinct active days (UTC), Distance = km, Points = a documented
-- blend. NOT granted to clients: only the security-definer RPCs below may call it,
-- so no one can probe an arbitrary user's score directly.
create or replace function public.compete_score(
  p_user uuid, p_metric text, p_start timestamptz, p_end timestamptz
) returns numeric language sql stable security definer set search_path = public as $$
  select case p_metric
    when 'distance' then
      coalesce((select round((sum(distance_m) / 1000.0)::numeric, 2)
                from public.activities
                where user_id = p_user and started_at >= p_start and started_at < p_end), 0)
    when 'points' then
      coalesce((select count(distinct (starts_at at time zone 'UTC')::date)
                from public.timeline_items
                where user_id = p_user and starts_at >= p_start and starts_at < p_end), 0) * 10
      + coalesce((select round((sum(distance_m) / 1000.0)::numeric, 2)
                from public.activities
                where user_id = p_user and started_at >= p_start and started_at < p_end), 0)
      + coalesce((select count(*)
                from public.timeline_items
                where user_id = p_user and type = 'workout'
                  and starts_at >= p_start and starts_at < p_end), 0) * 5
    else -- consistency
      coalesce((select count(distinct (starts_at at time zone 'UTC')::date)
                from public.timeline_items
                where user_id = p_user and starts_at >= p_start and starts_at < p_end), 0)
  end;
$$;

-- period -> start bound helper (week / month / all)
create or replace function public.compete_period_start(p_period text)
returns timestamptz language sql immutable set search_path = public as $$
  select case p_period
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    else '2000-01-01'::timestamptz
  end;
$$;

--------------------------------------------------------------------------------
-- 5. Leaderboards — city / country x metric x period
--------------------------------------------------------------------------------
create or replace function public.leaderboard(p_scope text, p_metric text, p_period text)
returns table(user_id uuid, display_name text, avatar_url text, city text, country text, score numeric, rnk bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz := public.compete_period_start(p_period);
  v_city text;
  v_country text;
begin
  select p.city, p.country into v_city, v_country from public.profiles p where p.id = auth.uid();
  return query
  with elig as (
    select p.id, p.display_name, p.avatar_url, p.city, p.country
    from public.profiles p
    where p.share_location = true and p.country is not null
      and (
        (p_scope = 'country' and p.country = v_country)
        or (p_scope = 'city' and p.country = v_country and p.city is not null and p.city = v_city)
      )
  ),
  scored as (
    select e.id, e.display_name, e.avatar_url, e.city, e.country,
           public.compete_score(e.id, p_metric, v_start, now()) as score
    from elig e
  )
  select s.id, s.display_name, s.avatar_url, s.city, s.country, s.score,
         rank() over (order by s.score desc) as rnk
  from scored s
  where s.score > 0
  order by s.score desc
  limit 100;
end;
$$;
grant execute on function public.leaderboard(text, text, text) to authenticated;

--------------------------------------------------------------------------------
-- 6. Challenge standings
--------------------------------------------------------------------------------
create or replace function public.challenge_standings(p_challenge uuid)
returns table(user_id uuid, display_name text, avatar_url text, score numeric, rnk bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_metric text; v_start timestamptz; v_end timestamptz;
begin
  select metric, starts_at, least(ends_at, now())
    into v_metric, v_start, v_end
    from public.challenges where id = p_challenge;
  if not found then return; end if;
  return query
  with parts as (
    select cp.user_id, p.display_name, p.avatar_url
    from public.challenge_participants cp
    join public.profiles p on p.id = cp.user_id
    where cp.challenge_id = p_challenge
  ),
  scored as (
    select pt.user_id, pt.display_name, pt.avatar_url,
           public.compete_score(pt.user_id, v_metric, v_start, v_end) as score
    from parts pt
  )
  select s.user_id, s.display_name, s.avatar_url, s.score,
         rank() over (order by s.score desc) as rnk
  from scored s
  order by s.score desc;
end;
$$;
grant execute on function public.challenge_standings(uuid) to authenticated;

--------------------------------------------------------------------------------
-- 7. Buddy head-to-head — caller + accepted buddies
--------------------------------------------------------------------------------
create or replace function public.buddy_standings(p_metric text, p_period text)
returns table(user_id uuid, display_name text, avatar_url text, score numeric, rnk bigint, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_start timestamptz := public.compete_period_start(p_period); v_me uuid := auth.uid();
begin
  return query
  with people as (
    select v_me as uid
    union
    select case when bl.user_a = v_me then bl.user_b else bl.user_a end
    from public.buddy_links bl
    where bl.user_a = v_me or bl.user_b = v_me
  ),
  scored as (
    select pe.uid, p.display_name, p.avatar_url,
           public.compete_score(pe.uid, p_metric, v_start, now()) as score
    from people pe join public.profiles p on p.id = pe.uid
  )
  select s.uid, s.display_name, s.avatar_url, s.score,
         rank() over (order by s.score desc) as rnk,
         (s.uid = v_me) as is_me
  from scored s
  order by s.score desc;
end;
$$;
grant execute on function public.buddy_standings(text, text) to authenticated;

--------------------------------------------------------------------------------
-- 8. Lock down function execution
--------------------------------------------------------------------------------
-- CREATE FUNCTION grants EXECUTE to PUBLIC, and Supabase's default privileges also
-- grant it directly to anon + authenticated. Revoke all of that from the internal
-- helpers so the scorer can't be probed directly; keep the three client RPCs open
-- to authenticated only (never anon).
revoke execute on function public.compete_score(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.compete_period_start(text) from public, anon, authenticated;
revoke execute on function public.leaderboard(text, text, text) from public, anon;
revoke execute on function public.challenge_standings(uuid) from public, anon;
revoke execute on function public.buddy_standings(text, text) from public, anon;

grant execute on function public.leaderboard(text, text, text) to authenticated;
grant execute on function public.challenge_standings(uuid) to authenticated;
grant execute on function public.buddy_standings(text, text) to authenticated;
