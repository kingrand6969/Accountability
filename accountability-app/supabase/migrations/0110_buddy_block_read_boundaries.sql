-- Close the Buddy Card read boundary for blocks in either direction.
-- This migration is replay-safe and deliberately preserves the 0104 view
-- columns, consent allowlist, metric return schema, security mode, and grants.

create index if not exists buddy_blocks_blocked_blocker_idx
  on public.buddy_blocks (blocked, blocker);

create or replace view public.public_profiles
with (security_invoker = false, security_barrier = true)
as
select
  p.id,
  p.display_name,
  p.avatar_url,
  case
    when p.id = auth.uid()
      or coalesce(p.buddy_card -> 'show_area' = 'true'::jsonb, false)
    then p.area
    else null::text
  end as area,
  p.buddy_opt_in,
  p.relationship_status,
  case when p.birthday_private then null::date else p.birthday end as birthday,
  case when p.gender_private then null::text else p.gender end as gender,
  case
    when p.sexual_orientation_private then null::text
    else p.sexual_orientation
  end as sexual_orientation,
  case
    when p.id = auth.uid()
      or (
        p.show_last_active
        and coalesce(p.buddy_card -> 'show_last_active' = 'true'::jsonb, false)
      )
    then p.last_active_at
    else null::timestamptz
  end as last_active_at,
  p.created_at,
  case
    when p.id = auth.uid()
      or coalesce(p.buddy_card -> 'show_hero' = 'true'::jsonb, false)
    then p.cover_url
    else null::text
  end as cover_url,
  case
    when p.id = auth.uid()
      or coalesce(p.buddy_card -> 'show_bio' = 'true'::jsonb, false)
    then p.bio
    else null::text
  end as bio,
  case
    when p.id = auth.uid() then p.buddy_card
    else
      jsonb_strip_nulls(jsonb_build_object(
        'show_hero',
          coalesce(p.buddy_card -> 'show_hero' = 'true'::jsonb, false),
        'hero_url',
          case when coalesce(p.buddy_card -> 'show_hero' = 'true'::jsonb, false)
            then p.buddy_card -> 'hero_url' else null end,
        'bg_url',
          case when coalesce(p.buddy_card -> 'show_hero' = 'true'::jsonb, false)
            then p.buddy_card -> 'bg_url' else null end,
        'show_headline',
          coalesce(p.buddy_card -> 'show_headline' = 'true'::jsonb, false),
        'headline',
          case when coalesce(p.buddy_card -> 'show_headline' = 'true'::jsonb, false)
            then p.buddy_card -> 'headline' else null end,
        'show_bio',
          coalesce(p.buddy_card -> 'show_bio' = 'true'::jsonb, false),
        'about',
          case when coalesce(p.buddy_card -> 'show_bio' = 'true'::jsonb, false)
            then p.buddy_card -> 'about' else null end,
        'show_traits',
          coalesce(p.buddy_card -> 'show_traits' = 'true'::jsonb, false),
        'traits',
          case when coalesce(p.buddy_card -> 'show_traits' = 'true'::jsonb, false)
            then p.buddy_card -> 'traits' else null end,
        'show_area',
          coalesce(p.buddy_card -> 'show_area' = 'true'::jsonb, false),
        'show_last_active',
          p.show_last_active
          and coalesce(p.buddy_card -> 'show_last_active' = 'true'::jsonb, false),
        'show_rank',
          coalesce(p.buddy_card -> 'show_rank' = 'true'::jsonb, false),
        'rank_name',
          case when coalesce(p.buddy_card -> 'show_rank' = 'true'::jsonb, false)
            then p.buddy_card -> 'rank_name' else null end,
        'show_medals',
          coalesce(p.buddy_card -> 'show_medals' = 'true'::jsonb, false),
        'medals',
          case when coalesce(p.buddy_card -> 'show_medals' = 'true'::jsonb, false)
            then p.buddy_card -> 'medals' else null end,
        'medals_list',
          case when coalesce(p.buddy_card -> 'show_medals' = 'true'::jsonb, false)
            then p.buddy_card -> 'medals_list' else null end,
        'palette_key',
          case
            when p.buddy_card ->> 'palette_key' in (
              'polar_blue',
              'victory_ember',
              'momentum_teal',
              'power_violet'
            ) then p.buddy_card ->> 'palette_key'
            else 'polar_blue'
          end,
        'featured_medal_ids',
          case when coalesce(p.buddy_card -> 'show_medals' = 'true'::jsonb, false)
            then p.buddy_card -> 'featured_medal_ids' else null end,
        'show_consistency',
          coalesce(p.buddy_card -> 'show_consistency' = 'true'::jsonb, false),
        'show_points',
          coalesce(p.buddy_card -> 'show_points' = 'true'::jsonb, false),
        'show_distance',
          coalesce(p.buddy_card -> 'show_distance' = 'true'::jsonb, false),
        'show_challenge_wins',
          coalesce(p.buddy_card -> 'show_challenge_wins' = 'true'::jsonb, false),
        'show_city_rank',
          coalesce(p.buddy_card -> 'show_city_rank' = 'true'::jsonb, false),
        'show_country_rank',
          coalesce(p.buddy_card -> 'show_country_rank' = 'true'::jsonb, false),
        'show_posts',
          coalesce(p.buddy_card -> 'show_posts' = 'true'::jsonb, false)
      ))
  end as buddy_card
from public.profiles p
where p.id = auth.uid()
   or (
     auth.uid() is not null
     and not exists (
       select 1
       from public.buddy_blocks bb
       where (bb.blocker = auth.uid() and bb.blocked = p.id)
          or (bb.blocker = p.id and bb.blocked = auth.uid())
     )
   );

revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;

comment on view public.public_profiles is
  'Authenticated discovery view with strict consent gates that returns no row across a block in either direction.';

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

  if v_caller <> p_target and exists (
    select 1
    from public.buddy_blocks bb
    where (bb.blocker = v_caller and bb.blocked = p_target)
       or (bb.blocker = p_target and bb.blocked = v_caller)
  ) then
    return;
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
    -- show_distance authorizes average and cumulative distance together.
    case when v_show_distance
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
  'Returns no row across a block; otherwise returns owner metrics to self and only explicitly opted-in metrics to authenticated viewers.';

-- Source audit: production callers use buddy_card_social_proof(uuid, uuid).
-- No source caller remains for either historical social_context overload.
-- Conditional revocation keeps this migration safe to replay after the drop.
do $decommission_social_context$
begin
  if to_regprocedure('public.buddy_card_social_context(uuid)') is not null then
    execute 'revoke execute on function public.buddy_card_social_context(uuid) from authenticated, anon, public';
  end if;
  if to_regprocedure('public.buddy_card_social_context(uuid, uuid)') is not null then
    execute 'revoke execute on function public.buddy_card_social_context(uuid, uuid) from authenticated, anon, public';
  end if;
end;
$decommission_social_context$;

drop function if exists public.buddy_card_social_context(uuid);
drop function if exists public.buddy_card_social_context(uuid, uuid);

notify pgrst, 'reload schema';
