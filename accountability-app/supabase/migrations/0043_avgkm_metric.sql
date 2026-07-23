-- Compete: add the 'avgkm' metric — average km per day since the member's
-- join date (profiles.created_at). By definition it spans the whole account
-- lifetime, so it deliberately IGNORES p_start/p_end; the period chips in the
-- UI don't apply to it. Leaderboard + buddy standings only — challenges keep
-- their existing 3 metrics (a time-boxed challenge can't be "since join").
-- Body otherwise identical to 0041 (tz-local day bucketing preserved).

create or replace function public.compete_score(
  p_user uuid, p_metric text, p_start timestamptz, p_end timestamptz
) returns numeric language sql stable security definer set search_path = public as $$
  with tz as (select coalesce(tz_offset, 0) as off from public.profiles where id = p_user)
  select case p_metric
    when 'distance' then
      coalesce((select round((sum(distance_m) / 1000.0)::numeric, 2)
                from public.activities
                where user_id = p_user and started_at >= p_start and started_at < p_end), 0)
    when 'avgkm' then
      coalesce((select round(((sum(a.distance_m) / 1000.0)
                / greatest(1, current_date - (select p.created_at::date
                                              from public.profiles p
                                              where p.id = p_user)))::numeric, 2)
                from public.activities a
                where a.user_id = p_user), 0)
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
