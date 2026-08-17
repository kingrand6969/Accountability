-- Full Buddy profile boundary.
-- Non-buddies continue to use public.public_profiles, whose JSON and profile
-- columns are consent-filtered. This function returns the fuller profile shape
-- only when PostgreSQL can prove the caller is the owner or an accepted buddy.

create or replace function public.buddy_card_access_mode(p_target uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'unavailable'
    when not exists (
      select 1 from public.profiles p where p.id = p_target
    ) then 'unavailable'
    when p_target = auth.uid() then 'self'
    when exists (
      select 1
      from public.buddy_blocks bb
      where (bb.blocker = auth.uid() and bb.blocked = p_target)
         or (bb.blocked = auth.uid() and bb.blocker = p_target)
    ) then 'unavailable'
    when exists (
      select 1
      from public.buddy_links bl
      where (bl.user_a = auth.uid() and bl.user_b = p_target)
         or (bl.user_b = auth.uid() and bl.user_a = p_target)
    ) then 'buddy'
    else 'public'
  end;
$$;

revoke execute on function public.buddy_card_access_mode(uuid) from public, anon;
grant execute on function public.buddy_card_access_mode(uuid) to authenticated;

comment on function public.buddy_card_access_mode(uuid) is
  'Returns self, buddy, public, or unavailable. Missing and blocked targets intentionally share unavailable to avoid leaking why.';

create or replace function public.buddy_full_profile(p_target uuid)
returns table(
  id uuid,
  display_name text,
  avatar_url text,
  area text,
  bio text,
  created_at timestamptz,
  last_active_at timestamptz,
  buddy_card jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.area,
    p.bio,
    p.created_at,
    p.last_active_at,
    coalesce(p.buddy_card, '{}'::jsonb)
  from public.profiles p
  where p.id = p_target
    and auth.uid() is not null
    and public.buddy_card_access_mode(p_target) in ('self', 'buddy');
$$;

revoke execute on function public.buddy_full_profile(uuid) from public, anon;
grant execute on function public.buddy_full_profile(uuid) to authenticated;

comment on function public.buddy_full_profile(uuid) is
  'Returns full Buddy Card profile fields only to the owner or an accepted, unblocked buddy; public visitors must use public_profiles.';

notify pgrst, 'reload schema';
