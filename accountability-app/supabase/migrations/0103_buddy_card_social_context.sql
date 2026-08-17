create or replace function public.buddy_card_social_context(p_target uuid)
returns table (mutual_buddies bigint, owner_groups bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
begin
  if v_viewer is null then
    raise exception 'Authentication required';
  end if;

  return query
  with viewer_buddies as (
    select case when link.user_a = v_viewer then link.user_b else link.user_a end as buddy_id
    from public.buddy_links link
    where link.user_a = v_viewer or link.user_b = v_viewer
  ), target_buddies as (
    select case when link.user_a = p_target then link.user_b else link.user_a end as buddy_id
    from public.buddy_links link
    where link.user_a = p_target or link.user_b = p_target
  )
  select
    (select count(*) from viewer_buddies viewer
      join target_buddies target using (buddy_id)),
    (select count(*) from public.group_members member where member.user_id = p_target);
end;
$$;
revoke all on function public.buddy_card_social_context(uuid) from public;
revoke all on function public.buddy_card_social_context(uuid) from anon;
grant execute on function public.buddy_card_social_context(uuid) to authenticated;
