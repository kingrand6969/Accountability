-- Event announcements are one replay-safe unit: group + event + feed post.
-- A PostgreSQL function call is transactional, so every raised exception rolls
-- back all three inserts. No exception handler converts a partial failure into
-- success.

begin;

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

  insert into public.groups (name, description, created_by)
  values (
    v_title,
    pg_catalog.concat(
      'Event group · ',
      coalesce(v_location, 'meet-up'),
      ' — auto-created when the event was announced.'
    ),
    p_expected_owner
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

notify pgrst, 'reload schema';

commit;
