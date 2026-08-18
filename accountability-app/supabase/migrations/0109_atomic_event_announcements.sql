-- Event announcements are one replay-safe unit: group + event + feed post.
-- A PostgreSQL function call is transactional, so every raised exception rolls
-- back all three inserts. No exception handler converts a partial failure into
-- success.

begin;

-- Event groups follow the announcement audience. Public event groups remain
-- discoverable, while a Buddies-only event never leaks its title, place or
-- description through the general groups directory.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (
    privacy = 'public'
    or created_by = auth.uid()
    or exists (
      select 1
      from public.group_members gm
      where gm.group_id = groups.id
        and gm.user_id = auth.uid()
    )
  );

-- Event metadata inherits the centralized post boundary, including Buddies,
-- Public, moderation and two-way block checks. Owners retain direct access.
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.posts p
      where p.event_id = events.id
        and public.can_view_post(p.id, auth.uid())
    )
  );

-- Repair event groups created by the legacy multi-step flow before applying
-- the privacy policy above. A group is public only when its owner published an
-- associated Public event announcement.
update public.groups g
set privacy = case
  when exists (
    select 1
    from public.events e
    join public.posts p on p.event_id = e.id
    where e.group_id = g.id
      and p.user_id = e.created_by
      and p.post_type = 'event'
      and p.audience = 'public'
  ) then 'public'
  else 'private'
end
where exists (
  select 1
  from public.events e
  where e.group_id = g.id
);

create or replace function public.create_event_announcement(
  p_expected_owner uuid,
  p_operation_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_location text,
  p_message text,
  p_audience text,
  p_show_on_card boolean default false
)
returns table(
  result_group_id uuid,
  result_event_id uuid,
  result_post_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_location text := nullif(pg_catalog.btrim(coalesce(p_location, '')), '');
  v_body text := nullif(pg_catalog.btrim(coalesce(p_message, '')), '');
  v_show_on_card boolean;
  v_group_id uuid;
  v_event_id uuid;
  v_post_id uuid;
  v_existing_group_id uuid;
  v_existing_event_id uuid;
  v_existing_post_id uuid;
  v_existing_post_type text;
  v_existing_body text;
  v_existing_audience text;
  v_existing_show_on_card boolean;
  v_existing_title text;
  v_existing_starts_at timestamptz;
  v_existing_location text;
begin
  if p_expected_owner is null
    or auth.uid() is null
    or auth.uid() <> p_expected_owner
  then
    raise exception 'account changed' using errcode = '42501';
  end if;

  if p_operation_id is null then
    raise exception 'Event operation id is required.' using errcode = '22023';
  end if;
  if char_length(v_title) not between 3 and 120 then
    raise exception 'Event title must be between 3 and 120 characters.' using errcode = '22023';
  end if;
  if p_starts_at is null then
    raise exception 'Event start time is required.' using errcode = '22023';
  end if;
  if v_location is not null and char_length(v_location) > 200 then
    raise exception 'Event location is too long.' using errcode = '22023';
  end if;
  if v_body is not null and char_length(v_body) > 5000 then
    raise exception 'Event message is too long.' using errcode = '22023';
  end if;
  if p_audience is null or p_audience not in ('buddies', 'public') then
    raise exception 'Event audience must be Buddies or Public.' using errcode = '22023';
  end if;

  v_body := coalesce(v_body, pg_catalog.concat('📅 ', v_title, ' — who''s in?'));
  v_show_on_card := p_audience = 'public' and coalesce(p_show_on_card, false);

  -- Serialize the owner/operation pair so simultaneous retries cannot both
  -- reach the inserts before the unique post operation index is visible.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat(p_expected_owner::text, ':', p_operation_id::text),
      0
    )
  );

  select
    p.id,
    p.event_id,
    p.post_type,
    p.body,
    p.audience,
    p.show_on_card,
    e.group_id,
    e.title,
    e.starts_at,
    e.location
  into
    v_existing_post_id,
    v_existing_event_id,
    v_existing_post_type,
    v_existing_body,
    v_existing_audience,
    v_existing_show_on_card,
    v_existing_group_id,
    v_existing_title,
    v_existing_starts_at,
    v_existing_location
  from public.posts p
  left join public.events e on e.id = p.event_id
  where p.user_id = p_expected_owner
    and p.client_operation_id = p_operation_id
  for update of p;

  if found then
    if v_existing_event_id is null
      or v_existing_group_id is null
      or v_existing_post_type <> 'event'
    then
      raise exception 'Event operation id is already used by a non-event post.'
        using errcode = '23505';
    end if;

    if v_existing_title is distinct from v_title
      or v_existing_starts_at is distinct from p_starts_at
      or v_existing_location is distinct from v_location
      or v_existing_body is distinct from v_body
      or v_existing_audience is distinct from p_audience
      or v_existing_show_on_card is distinct from v_show_on_card
    then
      raise exception 'Event operation id is already used by a different announcement.'
        using errcode = '23505';
    end if;

    return query select
      v_existing_group_id,
      v_existing_event_id,
      v_existing_post_id;
    return;
  end if;

  insert into public.groups (name, description, created_by, privacy)
  values (
    v_title,
    pg_catalog.concat(
      'Event group · ',
      coalesce(v_location, 'meet-up'),
      ' — auto-created when the event was announced.'
    ),
    p_expected_owner,
    case when p_audience = 'public' then 'public' else 'private' end
  )
  returning id into v_group_id;

  insert into public.events (title, starts_at, location, group_id, created_by)
  values (v_title, p_starts_at, v_location, v_group_id, p_expected_owner)
  returning id into v_event_id;

  insert into public.posts (
    user_id,
    body,
    event_id,
    audience,
    show_on_card,
    post_type,
    client_operation_id,
    moderation_state
  )
  values (
    p_expected_owner,
    v_body,
    v_event_id,
    p_audience,
    v_show_on_card,
    'event',
    p_operation_id,
    'visible'
  )
  returning id into v_post_id;

  return query select v_group_id, v_event_id, v_post_id;
end;
$$;

-- Attendance is authorized by the same post the viewer actually saw. The
-- immutable expected owner prevents a retained event id from being rebound to
-- another creator, and ON CONFLICT makes repeated taps/retries harmless.
create or replace function public.attend_event(
  p_event_id uuid,
  p_expected_owner uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_group_id uuid;
begin
  if v_viewer is null
    or p_event_id is null
    or p_expected_owner is null
  then
    raise exception 'Event is not available.' using errcode = '42501';
  end if;

  select e.group_id
  into v_group_id
  from public.events e
  where e.id = p_event_id
    and e.created_by = p_expected_owner
    and exists (
      select 1
      from public.posts p
      where p.event_id = e.id
        and p.user_id = p_expected_owner
        and p.post_type = 'event'
        and public.can_view_post(p.id, v_viewer)
    )
  limit 1;

  if v_group_id is null then
    raise exception 'Event is not available.' using errcode = '42501';
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group_id, v_viewer)
  on conflict (group_id, user_id) do nothing;
end;
$$;

revoke all on function public.create_event_announcement(
  uuid,
  uuid,
  text,
  timestamptz,
  text,
  text,
  text,
  boolean
) from public, anon, authenticated, service_role;

grant execute on function public.create_event_announcement(
  uuid,
  uuid,
  text,
  timestamptz,
  text,
  text,
  text,
  boolean
) to authenticated;

revoke all on function public.attend_event(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.attend_event(uuid, uuid)
  to authenticated;

comment on function public.create_event_announcement(
  uuid,
  uuid,
  text,
  timestamptz,
  text,
  text,
  text,
  boolean
) is 'Atomically creates an owner-bound, replay-safe event group, event and feed announcement.';

comment on function public.attend_event(uuid, uuid)
  is 'Replay-safely joins an event group only when its owner-bound announcement is currently viewable.';

notify pgrst, 'reload schema';

commit;
