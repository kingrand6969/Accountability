-- Facebook-style profile cover photo.
alter table public.profiles
  add column if not exists cover_url text;

-- profiles UPDATE is column-scoped since 0016 — the new column must be
-- granted explicitly or clients can't set it.
grant update (cover_url) on public.profiles to authenticated;

-- expose on the privacy view (same columns as before + cover_url appended)
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
  cover_url
from public.profiles;

grant select on public.public_profiles to authenticated;
