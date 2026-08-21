begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.set_personal_post_visibility(
  p_expected_owner uuid,
  p_post_id uuid,
  p_show_publicly boolean
)
returns table(
  result_post_id uuid,
  result_audience text,
  result_show_on_card boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_group_id uuid;
  v_post_type text;
  v_audience text := case when p_show_publicly then 'public' else 'buddies' end;
begin
  if p_expected_owner is null
    or p_post_id is null
    or p_show_publicly is null
    or auth.uid() is null
    or auth.uid() <> p_expected_owner
  then
    raise exception 'Post visibility could not be updated.' using errcode = '42501';
  end if;

  select p.event_id, p.post_type
  into v_event_id, v_post_type
  from public.posts p
  where p.id = p_post_id
    and p.user_id = p_expected_owner
    and p.group_id is null
    and p.page_id is null
    and p.moderation_state = 'visible'
  for update of p;

  if not found then
    raise exception 'Post visibility could not be updated.' using errcode = '42501';
  end if;

  if v_post_type = 'event' then
    if v_event_id is null then
      raise exception 'Post visibility could not be updated.' using errcode = '42501';
    end if;

    select g.id
    into v_event_group_id
    from public.events e
    join public.groups g on g.id = e.group_id
    where e.id = v_event_id
      and e.created_by = p_expected_owner
      and g.created_by = p_expected_owner
      and g.description like 'Event group · % — auto-created when the event was announced.'
    for update of g;

    if v_event_group_id is null then
      raise exception 'Post visibility could not be updated.' using errcode = '42501';
    end if;
  end if;

  update public.posts
  set audience = case when p_show_publicly then 'public' else 'buddies' end,
      show_on_card = p_show_publicly
  where id = p_post_id
    and user_id = p_expected_owner;

  if v_event_group_id is not null then
    -- The group row lock above is the serialization point for every toggle in
    -- this auto-created event group. Recompute after the target post update so
    -- the last lock holder observes prior commits and cannot overwrite a group
    -- that still has another canonical Public announcement.
    update public.groups g
    set privacy = case
      when exists (
        select 1
        from public.events e_linked
        join public.posts p_linked on p_linked.event_id = e_linked.id
        where e_linked.group_id = v_event_group_id
          and e_linked.created_by = p_expected_owner
          and p_linked.user_id = p_expected_owner
          and p_linked.group_id is null
          and p_linked.page_id is null
          and p_linked.post_type = 'event'
          and p_linked.moderation_state = 'visible'
          and p_linked.audience = 'public'
          and p_linked.show_on_card = true
      ) then 'public'
      else 'private'
    end
    where g.id = v_event_group_id
      and g.created_by = p_expected_owner;
  end if;

  return query select p_post_id, v_audience, p_show_publicly;
end;
$$;

revoke all on function public.set_personal_post_visibility(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_personal_post_visibility(uuid, uuid, boolean)
  to authenticated;

comment on function public.set_personal_post_visibility(uuid, uuid, boolean) is
  'Atomically updates an owner-bound personal post and its exact auto-created event group visibility.';

notify pgrst, 'reload schema';

commit;
