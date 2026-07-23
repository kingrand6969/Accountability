-- 0055: server-side metric rollups.
-- Replaces two expensive client patterns on the Trophy Case / metrics paths:
--   1. downloading EVERY activities row to sum distance/time client-side
--      (PostgREST silently caps responses at 1000 rows, so a very active
--      member's totals were also WRONG once they crossed 1000 activities)
--   2. a ~10-query count fan-out (workouts, challenges, memories, places,
--      posts, likes, groups, messages, goals, profile fields) per screen open.
-- Both functions run as the caller (security invoker) so RLS still applies;
-- the auth.uid() filters just make the intent explicit.

-- Sum / count / longest / hours over the caller's own activities, in one row.
create or replace function public.my_activity_stats()
returns table (km numeric, cnt bigint, longest_km numeric, hours numeric)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(distance_m), 0) / 1000.0,
    count(*),
    coalesce(max(distance_m), 0) / 1000.0,
    coalesce(sum(duration_s), 0) / 3600.0
  from public.activities
  where user_id = auth.uid();
$$;

revoke all on function public.my_activity_stats() from public;
grant execute on function public.my_activity_stats() to authenticated;

-- Every medal/mission tally in ONE round trip. Each expression mirrors the
-- exact filter the client used to issue as its own head-count query.
create or replace function public.my_metric_counts()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'workouts',   (select count(*) from public.timeline_items where user_id = auth.uid() and type = 'workout'),
    'challenges', (select count(*) from public.challenge_participants where user_id = auth.uid()),
    'memories',   (select count(*) from public.memories where user_id = auth.uid()),
    'places',     (select count(*) from public.memories where user_id = auth.uid() and location is not null),
    'posts',      (select count(*) from public.posts where user_id = auth.uid()),
    'likes',      (select count(*) from public.post_likes where user_id = auth.uid()),
    'groups',     (select count(*) from public.group_members where user_id = auth.uid()),
    'messages',   (select count(*) from public.buddy_messages where sender = auth.uid()),
    'goals_hit',  (select count(*) from public.savings_goals
                     where user_id = auth.uid() and target > 0 and saved >= target),
    'profile_fields', (
      select (avatar_url is not null and length(trim(avatar_url)) > 0)::int
           + (bio is not null and length(trim(bio)) > 0)::int
           + (display_name is not null and length(trim(display_name)) > 0)::int
      from public.profiles where id = auth.uid()
    )
  );
$$;

revoke all on function public.my_metric_counts() from public;
grant execute on function public.my_metric_counts() to authenticated;
