-- Customizable buddy card: { bg: preset key, mode: 'profile'|'custom',
-- headline, about }. Shown to non-linked users who view you in buddy search.
alter table public.profiles
  add column if not exists buddy_card jsonb;

-- profiles UPDATE is column-scoped (0016) — grant the new column
grant update (buddy_card) on public.profiles to authenticated;

-- expose on the privacy view (same columns as 0024 + buddy_card appended)
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false) as
select
  id,
  display_name,
  avatar_url,
  area,
  buddy_opt_in,
  relationship_status,
  case when birthday_private then null::date else birthday end as birthday,
  case when gender_private then null::text else gender end as gender,
  case when sexual_orientation_private then null::text else sexual_orientation end
    as sexual_orientation,
  case when show_last_active then last_active_at
       else null::timestamptz end as last_active_at,
  created_at,
  cover_url,
  bio,
  buddy_card
from public.profiles;

grant select on public.public_profiles to authenticated;
