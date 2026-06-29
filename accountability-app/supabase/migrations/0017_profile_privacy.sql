-- Accountability App — enforce profile privacy (launch-blocker #2).
-- Before: any authenticated user could read ALL columns of ALL profiles, so the
-- birthday/gender/orientation/last-active "private" toggles were cosmetic.
-- After: the base table is readable only for your OWN row; everyone else is read
-- through a view that omits sensitive fields unless the owner made them public.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

drop policy if exists "Profiles readable by authenticated users" on public.profiles;
drop policy if exists "Profiles readable by self" on public.profiles;
create policy "Profiles readable by self" on public.profiles
  for select using (auth.uid() = id);

-- Safe, privacy-respecting view for reading OTHER users' profiles.
-- security_invoker = false: runs with the view owner's rights so it can read
-- across users, but only ever exposes the columns selected here.
create or replace view public.public_profiles
with (security_invoker = false) as
select
  id,
  display_name,
  avatar_url,
  area,
  buddy_opt_in,
  relationship_status,
  case when birthday_private then null else birthday end as birthday,
  case when gender_private then null else gender end as gender,
  case when sexual_orientation_private then null else sexual_orientation end as sexual_orientation,
  case when show_last_active then last_active_at else null end as last_active_at,
  created_at
from public.profiles;

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

notify pgrst, 'reload schema';
