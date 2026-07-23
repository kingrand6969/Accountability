-- Challenge record on the Rankings: wins add, losses subtract, floored at 0
-- (the shown number is your net "Challenge wins" — losses are tracked against
-- it internally but never displayed and can never push you below zero).
--  * A finished challenge is WON by the top scorer(s) among its participants.
--  * A challenge where every participant scored 0 has no result (nobody wins
--    or loses it).

create or replace function public.challenge_record(
  p_user uuid, p_start timestamptz, p_end timestamptz
) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_wins int := 0;
  v_losses int := 0;
  r record;
  v_my numeric;
  v_best numeric;
begin
  for r in
    select c.id, c.metric, c.starts_at, c.ends_at
    from public.challenges c
    join public.challenge_participants cp
      on cp.challenge_id = c.id and cp.user_id = p_user
    where c.ends_at <= now()          -- finished only
      and c.ends_at >= p_start and c.ends_at < p_end
  loop
    select public.compete_score(p_user, r.metric, r.starts_at, r.ends_at) into v_my;
    select max(public.compete_score(cp2.user_id, r.metric, r.starts_at, r.ends_at))
      into v_best
      from public.challenge_participants cp2
      where cp2.challenge_id = r.id;
    if coalesce(v_best, 0) <= 0 then
      continue; -- nobody scored: no result
    elsif v_my >= v_best then
      v_wins := v_wins + 1;
    else
      v_losses := v_losses + 1;
    end if;
  end loop;
  return greatest(0, v_wins - v_losses);
end;
$$;
revoke execute on function public.challenge_record(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- expose it as the 'chwin' metric through the existing scorer
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
    when 'chwin' then
      public.challenge_record(p_user, p_start, p_end)
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
revoke execute on function public.compete_score(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
