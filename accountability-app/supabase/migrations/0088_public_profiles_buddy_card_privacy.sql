-- Harden the authenticated public-profile boundary with per-card consent.
--
-- Verification after applying to STAGING:
-- 1. As owner, select your own row and confirm area/cover_url/bio are visible.
-- 2. As another authenticated user, confirm area, cover_url and bio are NULL
--    when buddy_card show_area/show_hero/show_bio are absent or false.
-- 3. Enable one flag at a time and confirm only its matching field appears.
-- 4. Confirm confirmed buddies receive no implicit exception.
-- 5. Confirm anon cannot SELECT and authenticated cannot SELECT profiles.
-- 6. Re-run Discover, incoming requests, buddies, active buddies, Buddy Card,
--    and public share previews against the staging project.
-- 7. Add an unknown key to buddy_card and confirm it never appears in this view.
-- 8. Confirm last_active_at requires both profiles.show_last_active and
--    buddy_card.show_last_active for every non-owner.
--
-- display_name/avatar_url remain authenticated discovery identity fields.
-- Existing birthday/gender/orientation/show_last_active choices remain enforced.

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
  'Authenticated discovery view with a strict Buddy Card JSON allowlist and explicit consent gates.';
