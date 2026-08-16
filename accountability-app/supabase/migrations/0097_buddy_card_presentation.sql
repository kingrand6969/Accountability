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
