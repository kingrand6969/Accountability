-- Full Buddy profile boundary.
-- Non-buddies continue to use public.public_profiles, whose JSON and profile
-- columns are consent-filtered. This function returns the fuller profile shape
-- only when PostgreSQL can prove the caller is the owner or an accepted buddy.

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
    and (
      p.id = auth.uid()
      or exists (
        select 1
        from public.buddy_links bl
        where (bl.user_a = auth.uid() and bl.user_b = p.id)
           or (bl.user_b = auth.uid() and bl.user_a = p.id)
      )
    );
$$;

revoke execute on function public.buddy_full_profile(uuid) from public, anon;
grant execute on function public.buddy_full_profile(uuid) to authenticated;

comment on function public.buddy_full_profile(uuid) is
  'Returns full Buddy Card profile fields only to the owner or an accepted buddy; public visitors must use public_profiles.';

notify pgrst, 'reload schema';
