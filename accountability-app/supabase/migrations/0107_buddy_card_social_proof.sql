-- Privacy-safe aggregate social proof for the Buddy Card.
-- Only counts cross this boundary; buddy and group identities never do.

create or replace function public.buddy_card_social_proof(
  p_expected_viewer uuid,
  p_target uuid
)
returns table(
  mutual_buddies_count bigint,
  groups_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer_buddies as (
    select case
      when bl.user_a = p_expected_viewer then bl.user_b
      else bl.user_a
    end as buddy_id
    from public.buddy_links bl
    where (bl.user_a = p_expected_viewer or bl.user_b = p_expected_viewer)
      and not exists (
        select 1
        from public.buddy_blocks bb
        where (bb.blocker = p_expected_viewer and bb.blocked = case
                 when bl.user_a = p_expected_viewer then bl.user_b else bl.user_a end)
           or (bb.blocked = p_expected_viewer and bb.blocker = case
                 when bl.user_a = p_expected_viewer then bl.user_b else bl.user_a end)
      )
  ),
  target_buddies as (
    select case
      when bl.user_a = p_target then bl.user_b
      else bl.user_a
    end as buddy_id
    from public.buddy_links bl
    where (bl.user_a = p_target or bl.user_b = p_target)
      and not exists (
        select 1
        from public.buddy_blocks bb
        where (bb.blocker = p_target and bb.blocked = case
                 when bl.user_a = p_target then bl.user_b else bl.user_a end)
           or (bb.blocked = p_target and bb.blocker = case
                 when bl.user_a = p_target then bl.user_b else bl.user_a end)
      )
  ),
  mutual_buddies as (
    select buddy_id from viewer_buddies
    intersect
    select buddy_id from target_buddies
  )
  select
    (select count(*) from mutual_buddies)::bigint,
    case
      when p_expected_viewer = p_target then (
        select count(*)::bigint
        from public.group_members gm
        where gm.user_id = p_target
      )
      else null::bigint
    end
  where p_expected_viewer = auth.uid()
    and public.buddy_card_access_mode(p_target) <> 'unavailable';
$$;

revoke execute on function public.buddy_card_social_proof(uuid, uuid) from public, anon;
grant execute on function public.buddy_card_social_proof(uuid, uuid) to authenticated;

comment on function public.buddy_card_social_proof(uuid, uuid) is
  'Returns aggregate-only Buddy Card social proof. Group count is self-only; blocked and missing targets return no row.';

notify pgrst, 'reload schema';
