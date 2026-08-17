-- Add bounded Buddy Card presentation settings while preserving the
-- authenticated public-profile privacy boundary established in 0088.

alter table public.profiles
  drop constraint if exists profiles_buddy_card_presentation_check;

alter table public.profiles
  add constraint profiles_buddy_card_presentation_check
  check (
    jsonb_typeof(buddy_card) is distinct from 'object'
    or (
      (
        not (buddy_card ? 'palette_key')
        or (
          jsonb_typeof(buddy_card -> 'palette_key') = 'string'
          and buddy_card ->> 'palette_key' in (
            'polar_blue',
            'victory_ember',
            'momentum_teal',
            'power_violet'
          )
        )
      )
      and (
        not (buddy_card ? 'featured_medal_ids')
        or case
          when jsonb_typeof(buddy_card -> 'featured_medal_ids') = 'array' then
            jsonb_array_length(buddy_card -> 'featured_medal_ids') <= 4
            and not jsonb_path_exists(
              buddy_card -> 'featured_medal_ids',
              '$[*] ? (@.type() != "string")'
            )
          else false
        end
      )
    )
  ) not valid;

with invalid_buddy_card_presentation as (
  select
    id,
    buddy_card ? 'palette_key'
      and not (
        jsonb_typeof(buddy_card -> 'palette_key') = 'string'
        and buddy_card ->> 'palette_key' in (
          'polar_blue',
          'victory_ember',
          'momentum_teal',
          'power_violet'
        )
      ) as remove_palette,
    buddy_card ? 'featured_medal_ids'
      and not (
        case
          when jsonb_typeof(buddy_card -> 'featured_medal_ids') = 'array' then
            jsonb_array_length(buddy_card -> 'featured_medal_ids') <= 4
            and not jsonb_path_exists(
              buddy_card -> 'featured_medal_ids',
              '$[*] ? (@.type() != "string")'
            )
          else false
        end
      ) as remove_featured
  from public.profiles
  where jsonb_typeof(buddy_card) = 'object'
    and (
      buddy_card ? 'palette_key'
      or buddy_card ? 'featured_medal_ids'
    )
)
update public.profiles as p
set buddy_card = case
  when r.remove_palette and r.remove_featured then
    p.buddy_card - 'palette_key' - 'featured_medal_ids'
  when r.remove_palette then p.buddy_card - 'palette_key'
  when r.remove_featured then p.buddy_card - 'featured_medal_ids'
  else p.buddy_card
end
from invalid_buddy_card_presentation r
where p.id = r.id
  and (r.remove_palette or r.remove_featured);

alter table public.profiles
  validate constraint profiles_buddy_card_presentation_check;

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
from public.profiles p;

revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;

comment on view public.public_profiles is
  'Authenticated discovery view with a strict Buddy Card JSON allowlist, presentation settings, and explicit consent gates.';

-- Replay the metric privacy boundary from 0087 so the approved public Fitness
-- section can show both average and cumulative distance under one consent flag.
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
  'Returns owner metrics to self and only explicitly opted-in Buddy Card metrics to other authenticated users.';

-- Merge a bounded Buddy Card patch inside one PostgreSQL statement. This
-- prevents the editor and the rank refresher from overwriting keys committed
-- by one another between a client-side read and write.
create or replace function public.patch_my_buddy_card(
  p_expected_owner uuid,
  p_patch jsonb,
  p_patch_kind text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_patch jsonb := p_patch;
  v_allowed text[];
  v_boolean_keys constant text[] := array[
    'show_headline', 'show_traits', 'show_rank', 'show_medals', 'show_area',
    'show_bio', 'show_last_active', 'show_consistency', 'show_points',
    'show_distance', 'show_challenge_wins', 'show_city_rank',
    'show_country_rank', 'show_posts'
  ];
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_expected_owner is null or auth.uid() <> p_expected_owner then
    raise exception 'Account changed. Buddy Card was not saved.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'Buddy Card patch must be a JSON object' using errcode = '22023';
  end if;

  if p_patch_kind = 'editor' then
    v_allowed := array[
      'palette_key', 'featured_medal_ids', 'mode', 'headline', 'about', 'traits',
      'show_headline', 'show_traits', 'show_rank', 'show_medals', 'show_area',
      'show_bio', 'show_last_active', 'show_consistency', 'show_points',
      'show_distance', 'show_challenge_wins', 'show_city_rank',
      'show_country_rank', 'show_posts'
    ];
  elsif p_patch_kind = 'rank' then
    v_allowed := array['rank_name', 'medals', 'medals_list'];
  else
    raise exception 'Unknown Buddy Card patch kind' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as supplied(key)
    where not (supplied.key = any(v_allowed))
  ) then
    raise exception 'Buddy Card patch contains disallowed keys' using errcode = '22023';
  end if;

  if p_patch_kind = 'editor' then
    if exists (
      select 1
      from jsonb_each(p_patch) as supplied(key, value)
      where supplied.key = any(v_boolean_keys)
        and jsonb_typeof(supplied.value) <> 'boolean'
    ) then
      raise exception 'Buddy Card visibility values must be booleans' using errcode = '22023';
    end if;
    if p_patch ? 'palette_key' and (
      jsonb_typeof(p_patch -> 'palette_key') <> 'string'
      or p_patch ->> 'palette_key' not in (
        'polar_blue', 'victory_ember', 'momentum_teal', 'power_violet'
      )
    ) then
      raise exception 'Invalid Buddy Card palette' using errcode = '22023';
    end if;
    if p_patch ? 'mode' and (
      jsonb_typeof(p_patch -> 'mode') <> 'string'
      or p_patch ->> 'mode' not in ('profile', 'custom')
    ) then
      raise exception 'Invalid Buddy Card mode' using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_each(p_patch) as supplied(key, value)
      where supplied.key = any(array['headline', 'about'])
        and jsonb_typeof(supplied.value) <> 'string'
    ) then
      raise exception 'Buddy Card text values must be strings' using errcode = '22023';
    end if;
    if p_patch ? 'headline' and length(p_patch ->> 'headline') > 90 then
      raise exception 'Buddy Card headline is too long' using errcode = '22023';
    end if;
    if p_patch ? 'about' and length(p_patch ->> 'about') > 400 then
      raise exception 'Buddy Card About text is too long' using errcode = '22023';
    end if;
    if p_patch ? 'featured_medal_ids' then
      if jsonb_typeof(p_patch -> 'featured_medal_ids') <> 'array' then
        raise exception 'Invalid featured medals' using errcode = '22023';
      end if;
      if jsonb_array_length(p_patch -> 'featured_medal_ids') > 4
        or jsonb_path_exists(
          p_patch -> 'featured_medal_ids',
          '$[*] ? (@.type() != "string")'
        )
      then
        raise exception 'Invalid featured medals' using errcode = '22023';
      end if;
    end if;
    if p_patch ? 'traits' then
      if jsonb_typeof(p_patch -> 'traits') <> 'array' then
        raise exception 'Invalid Buddy Card traits' using errcode = '22023';
      end if;
      if jsonb_array_length(p_patch -> 'traits') > 3
        or jsonb_path_exists(p_patch -> 'traits', '$[*] ? (@.type() != "string")')
      then
        raise exception 'Invalid Buddy Card traits' using errcode = '22023';
      end if;
    end if;
  else
    if p_patch ? 'rank_name' and jsonb_typeof(p_patch -> 'rank_name') <> 'string' then
      raise exception 'Invalid rank name' using errcode = '22023';
    end if;
    if p_patch ? 'medals' then
      if jsonb_typeof(p_patch -> 'medals') <> 'number' then
        raise exception 'Invalid medal count' using errcode = '22023';
      end if;
      if (p_patch ->> 'medals')::numeric < 0
        or trunc((p_patch ->> 'medals')::numeric) <> (p_patch ->> 'medals')::numeric
      then
        raise exception 'Invalid medal count' using errcode = '22023';
      end if;
    end if;
    if p_patch ? 'medals_list' then
      if jsonb_typeof(p_patch -> 'medals_list') <> 'array' then
        raise exception 'Invalid medal list' using errcode = '22023';
      end if;
      if jsonb_array_length(p_patch -> 'medals_list') > 256 then
        raise exception 'Invalid medal list' using errcode = '22023';
      end if;
      if exists (
        select 1
        from jsonb_array_elements(p_patch -> 'medals_list') as medal(value)
        where jsonb_typeof(medal.value) <> 'object'
          or jsonb_typeof(medal.value -> 'id') <> 'string'
          or jsonb_typeof(medal.value -> 'tier') <> 'number'
      ) then
        raise exception 'Invalid medal list entry' using errcode = '22023';
      end if;
      if exists (
        select 1
        from jsonb_array_elements(p_patch -> 'medals_list') as medal(value)
        where (medal.value ->> 'tier')::numeric < 0
          or trunc((medal.value ->> 'tier')::numeric) <> (medal.value ->> 'tier')::numeric
      ) then
        raise exception 'Invalid medal list entry' using errcode = '22023';
      end if;
    end if;
  end if;

  update public.profiles as p
  set buddy_card = (
    case
      when jsonb_typeof(p.buddy_card) = 'object' then p.buddy_card
      else '{}'::jsonb
    end
  ) || v_patch
  where p.id = p_expected_owner
    and p.id = auth.uid()
  returning p.buddy_card into v_result;

  if not found then
    raise exception 'Buddy Card could not be saved for this account' using errcode = '42501';
  end if;
  return v_result;
end;
$$;

revoke execute on function public.patch_my_buddy_card(uuid, jsonb, text) from public, anon;
grant execute on function public.patch_my_buddy_card(uuid, jsonb, text) to authenticated;

comment on function public.patch_my_buddy_card(uuid, jsonb, text) is
  'Atomically merges an allowlisted editor or rank patch into the authenticated owner Buddy Card.';
