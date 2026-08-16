-- Server-authorized completed challenge history for the Buddy Card gallery.
-- Applying this migration is a separately approved release action.

-- Raw participant history is private. Challenge surfaces use the aggregate RPC
-- below for counts and the current viewer's own membership state.
drop policy if exists "Participants are public" on public.challenge_participants;
drop policy if exists "Participants read own rows" on public.challenge_participants;
create policy "Participants read own rows" on public.challenge_participants
  for select using (auth.uid() = user_id);

-- Enrollment is server-owned so a client cannot backdate joined_at or join a
-- challenge after its database-time window has closed.
drop policy if exists "Join a challenge" on public.challenge_participants;
revoke insert on table public.challenge_participants from authenticated, anon;

create or replace function public.challenge_participation_summary(p_challenges uuid[])
returns table(
  challenge_id uuid,
  participant_count bigint,
  joined boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_challenges), 0) > 100 then
    raise exception 'At most 100 challenges may be requested.' using errcode = '22023';
  end if;

  return query
  select
    c.id,
    count(cp.user_id) as participant_count,
    coalesce(bool_or(cp.user_id = auth.uid()), false) as joined
  from public.challenges c
  left join public.challenge_participants cp on cp.challenge_id = c.id
  where c.id = any(coalesce(p_challenges, array[]::uuid[]))
  group by c.id;
end;
$$;

revoke execute on function public.challenge_participation_summary(uuid[]) from public, anon;
grant execute on function public.challenge_participation_summary(uuid[]) to authenticated;

comment on function public.challenge_participation_summary(uuid[]) is
  'Returns participant counts plus only the current caller membership boolean for visible challenge cards; never participant rows.';

create or replace function public.join_challenge(
  p_challenge uuid,
  p_timezone_offset integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_open boolean;
begin
  if v_user is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_timezone_offset is null or p_timezone_offset not between -840 and 840 then
    raise exception 'Invalid timezone offset.' using errcode = '22023';
  end if;

  -- A repeated request is a successful no-op, including for a participant row
  -- retained after completion. It cannot create or alter historical membership.
  if exists (
    select 1
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge
      and cp.user_id = v_user
  ) then
    return;
  end if;

  select true
  into v_open
  from public.challenges c
  where c.id = p_challenge
    and c.starts_at <= now()
    and c.ends_at > now();

  if coalesce(v_open, false) is false then
    raise exception 'Challenge is not open.' using errcode = '22023';
  end if;

  insert into public.challenge_participants (
    challenge_id,
    user_id,
    joined_at,
    timezone_offset
  ) values (
    p_challenge,
    v_user,
    now(),
    p_timezone_offset
  )
  on conflict (challenge_id, user_id) do nothing;
end;
$$;

revoke execute on function public.join_challenge(uuid, integer) from public, anon;
grant execute on function public.join_challenge(uuid, integer) to authenticated;

comment on function public.join_challenge(uuid, integer) is
  'Replay-safe enrollment using database time and a server-owned joined_at, limited to the active challenge window.';

create or replace function public.buddy_completed_challenges(p_target uuid)
returns table(
  id uuid,
  title text,
  metric text,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with access as (
    select public.buddy_card_access_mode(p_target) as mode
  )
  select
    c.id,
    c.title,
    c.metric,
    c.ends_at
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  join public.profiles p on p.id = p_target
  cross join access
  where cp.user_id = p_target
    -- A retained participant record plus an ended challenge is the completion
    -- state available in the current schema. This deliberately does not claim
    -- a win; challenge wins remain a separate server-calculated metric.
    and c.ends_at <= now()
    and cp.joined_at <= c.ends_at
    and (
      access.mode in ('self', 'buddy')
      or (
        access.mode = 'public'
        and coalesce(p.buddy_card -> 'show_medals' = 'true'::jsonb, false)
      )
    )
  order by c.ends_at desc
  limit 100;
$$;

revoke execute on function public.buddy_completed_challenges(uuid) from public, anon;
grant execute on function public.buddy_completed_challenges(uuid) to authenticated;

comment on function public.buddy_completed_challenges(uuid) is
  'Returns ended challenges retained on the target participant record only when the caller may open that target Buddy Card achievement gallery.';

notify pgrst, 'reload schema';
