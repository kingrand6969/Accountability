-- Accountability App — Compete fixes from the adversarial review.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
--  1. Store a per-user timezone offset so "active days" bucket by the user's
--     LOCAL day (matching the streak on Insights/Track) instead of UTC.
--  2. compete_score: bucket active days locally, and count GPS activities
--     (type='activity') toward the points "workout" bonus, not just manual
--     'workout' items. Consistency intentionally still counts every pillar,
--     to match the app's own streak definition.

alter table public.profiles
  add column if not exists tz_offset int; -- minutes, from JS getTimezoneOffset()
grant update (tz_offset) on public.profiles to authenticated;

create or replace function public.compete_score(
  p_user uuid, p_metric text, p_start timestamptz, p_end timestamptz
) returns numeric language sql stable security definer set search_path = public as $$
  with tz as (select coalesce(tz_offset, 0) as off from public.profiles where id = p_user)
  select case p_metric
    when 'distance' then
      coalesce((select round((sum(distance_m) / 1000.0)::numeric, 2)
                from public.activities
                where user_id = p_user and started_at >= p_start and started_at < p_end), 0)
    when 'points' then
      coalesce((select count(distinct (((starts_at at time zone 'UTC')
                  - make_interval(mins => (select off from tz)))::date))
                from public.timeline_items
                where user_id = p_user and starts_at >= p_start and starts_at < p_end), 0) * 10
      + coalesce((select round((sum(distance_m) / 1000.0)::numeric, 2)
                from public.activities
                where user_id = p_user and started_at >= p_start and started_at < p_end), 0)
      + coalesce((select count(*)
                from public.timeline_items
                where user_id = p_user and type in ('workout', 'activity')
                  and starts_at >= p_start and starts_at < p_end), 0) * 5
    else -- consistency: any pillar counts, bucketed by the user's local day
      coalesce((select count(distinct (((starts_at at time zone 'UTC')
                  - make_interval(mins => (select off from tz)))::date))
                from public.timeline_items
                where user_id = p_user and starts_at >= p_start and starts_at < p_end), 0)
  end;
$$;

-- CREATE OR REPLACE keeps the ACL, but re-assert the lockdown belt-and-braces.
revoke execute on function public.compete_score(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
