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
    update public.groups
    set privacy = case when p_show_publicly then 'public' else 'private' end
    where id = v_event_group_id
      and created_by = p_expected_owner;
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
