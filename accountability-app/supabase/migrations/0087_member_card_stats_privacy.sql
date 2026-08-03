-- Enforce Buddy Card metric consent at the database boundary.
--
-- Verification after applying to STAGING:
-- 1. As the card owner, member_card_stats(owner_id) returns every metric.
-- 2. As another authenticated user, every metric is NULL by default.
-- 3. Enabling one buddy_card show_* flag exposes only that matching metric.
-- 4. show_consistency gates consistency plus buddy rank/total.
-- 5. An anonymous call is rejected and EXECUTE remains authenticated-only.
--
-- Confirmed buddies receive no implicit exception here. A metric is visible to
-- a non-owner only when the owner explicitly opted it into their Buddy Card.

create or replace function public.member_card_stats(p_target uuid)
returns table(
  consistency numeric,
  points numeric,
  avgkm numeric,
  distance numeric,
  chwin numeric,
  buddies_rank bigint,
  buddies_total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_card jsonb;
  v_self boolean;
  v_show_consistency boolean;
  v_show_points boolean;
  v_show_distance boolean;
  v_show_chwin boolean;
  v_all timestamptz := '2000-01-01'::timestamptz;
  v_cons numeric;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(p.buddy_card, '{}'::jsonb)
    into v_card
  from public.profiles p
  where p.id = p_target;

  if not found then
    return;
  end if;

  v_self := v_caller = p_target;
  v_show_consistency := v_self or coalesce(v_card -> 'show_consistency' = 'true'::jsonb, false);
  v_show_points := v_self or coalesce(v_card -> 'show_points' = 'true'::jsonb, false);
  v_show_distance := v_self or coalesce(v_card -> 'show_distance' = 'true'::jsonb, false);
  v_show_chwin := v_self or coalesce(v_card -> 'show_challenge_wins' = 'true'::jsonb, false);

  if v_show_consistency then
    v_cons := public.compete_score(p_target, 'consistency', v_all, now());
  end if;

  return query
  with people as (
    select p_target as uid
    where v_show_consistency
    union
    select case when bl.user_a = p_target then bl.user_b else bl.user_a end
    from public.buddy_links bl
    where v_show_consistency
      and (bl.user_a = p_target or bl.user_b = p_target)
  ),
  scored as (
    select pe.uid, public.compete_score(pe.uid, 'consistency', v_all, now()) as score
    from people pe
  ),
  active as (
    select s.uid, s.score
    from scored s
    where s.score > 0
  )
  select
    case when v_show_consistency then v_cons else null::numeric end,
    case when v_show_points
      then public.compete_score(p_target, 'points', v_all, now())
      else null::numeric end,
    -- avgkm is intentionally not separately exposed by the current editor.
    -- It remains owner-only until a dedicated consent toggle is added.
    case when v_self
      then public.compete_score(p_target, 'avgkm', v_all, now())
      else null::numeric end,
    case when v_show_distance
      then public.compete_score(p_target, 'distance', v_all, now())
      else null::numeric end,
    case when v_show_chwin
      then public.compete_score(p_target, 'chwin', v_all, now())
      else null::numeric end,
    case
      when not v_show_consistency or coalesce(v_cons, 0) <= 0 then null::bigint
      else (select count(*) + 1 from active a where a.score > v_cons)
    end,
    case
      when v_show_consistency then (select count(*) from active)
      else null::bigint
    end;
end;
$$;

revoke execute on function public.member_card_stats(uuid) from public, anon;
grant execute on function public.member_card_stats(uuid) to authenticated;

comment on function public.member_card_stats(uuid) is
  'Returns owner metrics to self and only explicitly opted-in Buddy Card metrics to other authenticated users.';
