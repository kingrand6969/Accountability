create table if not exists public.feed_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  snapshot_at timestamptz not null default now()
);

create table if not exists public.feed_session_items (
  session_id uuid not null references public.feed_sessions (id) on delete cascade,
  position integer not null check (position > 0),
  post_id uuid not null references public.posts (id) on delete cascade,
  source text not null check (source in ('self', 'buddy', 'followed_person', 'joined_group', 'followed_page', 'suggested')),
  suggested boolean not null,
  primary key (session_id, position),
  unique (session_id, post_id),
  check (suggested = (source = 'suggested'))
);

create index if not exists feed_sessions_user_expires_idx on public.feed_sessions (user_id, expires_at);
create index if not exists feed_sessions_expires_id_idx on public.feed_sessions (expires_at, id);
create index if not exists feed_session_items_post_session_idx on public.feed_session_items (post_id, session_id);
create index if not exists posts_user_created_id_idx on public.posts (user_id, created_at desc, id asc);

alter table public.feed_sessions enable row level security;
alter table public.feed_session_items enable row level security;

drop policy if exists feed_sessions_select on public.feed_sessions;
create policy feed_sessions_select on public.feed_sessions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists feed_session_items_select on public.feed_session_items;
create policy feed_session_items_select on public.feed_session_items
  for select to authenticated using (exists (
    select 1 from public.feed_sessions s
     where s.id = session_id and s.user_id = auth.uid()
  ));

revoke all on table public.feed_sessions from public, anon, authenticated;
revoke all on table public.feed_session_items from public, anon, authenticated;
grant select on table public.feed_sessions to authenticated;
grant select on table public.feed_session_items to authenticated;

create or replace function public.purge_expired_feed_sessions(
  p_batch integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_deleted integer;
begin
  with expired as (
    select id from public.feed_sessions
     where expires_at <= now()
     order by expires_at, id
     limit least(greatest(coalesce(p_batch, 5000), 1), 10000)
  )
  delete from public.feed_sessions s using expired e where s.id = e.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$function$;

revoke all on function public.purge_expired_feed_sessions(integer)
  from public, anon, authenticated;

do $feed_session_cron$
declare
  v_jobid bigint;
begin
  create extension if not exists pg_cron;
  for v_jobid in select jobid from cron.job where jobname = 'purge-expired-feed-sessions' loop
    perform cron.unschedule(v_jobid);
  end loop;
  perform cron.schedule(
    'purge-expired-feed-sessions',
    '*/15 * * * *',
    'select public.purge_expired_feed_sessions(5000)'
  );
exception when others then
  null;
end
$feed_session_cron$;

create or replace function public.create_unified_feed_session(
  p_candidate_limit integer default 500
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_viewer uuid := auth.uid();
  v_session_id uuid;
  v_candidate_limit integer := least(greatest(coalesce(p_candidate_limit, 500), 1), 1000);
  v_per_source integer;
begin
  if v_viewer is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('feed-session:' || v_viewer::text, 0));
  v_per_source := greatest(1, floor(v_candidate_limit / 6.0)::integer);

  perform public.purge_expired_feed_sessions(5000);
  delete from public.feed_sessions where user_id = v_viewer and expires_at <= now();
  insert into public.feed_sessions (user_id) values (v_viewer) returning id into v_session_id;
  delete from public.feed_sessions
   where id in (
     select id from public.feed_sessions
      where user_id = v_viewer and expires_at > now()
      order by created_at desc, id desc
      offset 3
   );

  insert into public.feed_session_items (session_id, position, post_id, source, suggested)
  with candidate_posts as (
    (select p.id, p.created_at, 'self'::text as source, 0 as source_priority
       from public.posts p
      where p.user_id = v_viewer and p.moderation_state = 'visible'
        and not exists (select 1 from public.post_hides h where h.post_id=p.id and h.user_id=v_viewer)
      order by p.created_at desc, p.id asc limit v_per_source)
    union all
    (select p.id, p.created_at, 'buddy'::text, 1
       from public.posts p
      where p.user_id <> v_viewer and public.are_buddies(v_viewer, p.user_id)
        and p.moderation_state = 'visible'
        and not public.users_blocked(v_viewer, p.user_id)
        and (p.page_id is not null or (p.group_id is not null and exists (select 1 from public.group_members gm where gm.group_id=p.group_id and gm.user_id=v_viewer)) or (p.group_id is null and p.page_id is null and (p.audience='public' or (p.audience='buddies' and public.are_buddies(p.user_id, v_viewer)))))
        and not exists (select 1 from public.post_hides h where h.post_id=p.id and h.user_id=v_viewer)
      order by p.created_at desc, p.id asc limit v_per_source)
    union all
    (select p.id, p.created_at, 'followed_person'::text, 2
       from public.posts p
      where p.user_id <> v_viewer and not public.are_buddies(v_viewer,p.user_id)
        and exists (select 1 from public.buddy_stars s where s.starrer=v_viewer and s.target=p.user_id)
        and p.moderation_state = 'visible' and not public.users_blocked(v_viewer, p.user_id)
        and (p.page_id is not null or (p.group_id is not null and exists (select 1 from public.group_members gm where gm.group_id=p.group_id and gm.user_id=v_viewer)) or (p.group_id is null and p.page_id is null and (p.audience='public' or (p.audience='buddies' and public.are_buddies(p.user_id, v_viewer)))))
        and not exists (select 1 from public.post_hides h where h.post_id=p.id and h.user_id=v_viewer)
      order by p.created_at desc, p.id asc limit v_per_source)
    union all
    (select p.id, p.created_at, 'joined_group'::text, 3
       from public.posts p
      where p.group_id is not null and exists (select 1 from public.group_members gm where gm.group_id=p.group_id and gm.user_id=v_viewer)
        and p.user_id <> v_viewer and not public.are_buddies(v_viewer,p.user_id)
        and not exists (select 1 from public.buddy_stars s where s.starrer=v_viewer and s.target=p.user_id)
        and p.moderation_state = 'visible' and (p.user_id=v_viewer or not public.users_blocked(v_viewer,p.user_id))
        and not exists (select 1 from public.post_hides h where h.post_id=p.id and h.user_id=v_viewer)
      order by p.created_at desc, p.id asc limit v_per_source)
    union all
    (select p.id, p.created_at, 'followed_page'::text, 4
       from public.posts p
      where p.page_id is not null and exists (select 1 from public.page_follows pf where pf.page_id=p.page_id and pf.user_id=v_viewer)
        and p.user_id <> v_viewer and not public.are_buddies(v_viewer,p.user_id)
        and not exists (select 1 from public.buddy_stars s where s.starrer=v_viewer and s.target=p.user_id)
        and not exists (select 1 from public.group_members gm where gm.group_id=p.group_id and gm.user_id=v_viewer)
        and p.moderation_state = 'visible' and (p.user_id=v_viewer or not public.users_blocked(v_viewer,p.user_id))
        and not exists (select 1 from public.post_hides h where h.post_id=p.id and h.user_id=v_viewer)
      order by p.created_at desc, p.id asc limit v_per_source)
    union all
    (select p.id, p.created_at, 'suggested'::text, 5
       from public.posts p
      where p.audience = 'public' and p.user_id <> v_viewer and p.moderation_state = 'visible'
        and not public.users_blocked(v_viewer,p.user_id) and not public.are_buddies(v_viewer,p.user_id)
        and not exists (select 1 from public.buddy_stars s where s.starrer=v_viewer and s.target=p.user_id)
        and not exists (select 1 from public.group_members gm where gm.group_id=p.group_id and gm.user_id=v_viewer)
        and not exists (select 1 from public.page_follows pf where pf.page_id=p.page_id and pf.user_id=v_viewer)
        and (p.page_id is not null or (p.group_id is null and p.page_id is null))
        and not exists (select 1 from public.post_hides h where h.post_id=p.id and h.user_id=v_viewer)
      order by p.created_at desc, p.id asc limit v_per_source)
  ),
  deduplicated as (
    select c.*, row_number() over (partition by c.id order by c.source_priority asc) as candidate_rank
      from candidate_posts c
  ),
  bounded_candidates as (
    select d.id, d.created_at, d.source, d.source_priority
      from deduplicated d where d.candidate_rank = 1
      order by d.source_priority, d.created_at desc, d.id asc
      limit v_candidate_limit
  ),
  scored as (
    select p.id, p.created_at, p.source, p.source_priority,
           (select count(*) from public.post_likes pl where pl.post_id = p.id)
           + (select count(*) from public.post_comments pc
               where pc.post_id = p.id and pc.moderation_state = 'visible') as engagement_score
      from bounded_candidates p
  ),
  connections as (
    select c.*, row_number() over (order by c.source_priority, c.created_at desc, c.engagement_score desc, c.id asc) as connection_rank
      from scored c where c.source <> 'suggested'
  ),
  suggestions as (
    select s.*, row_number() over (order by s.created_at desc, s.engagement_score desc, s.id asc) as suggestion_rank,
           row_number() over (partition by s.id order by s.created_at desc, s.engagement_score desc, s.id asc) as candidate_rank
      from scored s where s.source = 'suggested'
  ),
  connection_count as (select count(*) as connection_count from connections),
  interleaved as (
    select c.id, c.source, false as suggested,
           c.connection_rank + floor((c.connection_rank - 1) / 4.0) as output_position
      from connections c
    union all
    select s.id, s.source, true, s.suggestion_rank * 5 as output_position
      from suggestions s cross join connection_count cc
     where s.candidate_rank = 1 and s.suggestion_rank <= floor(cc.connection_count / 4.0)
       and cc.connection_count > 0
  )
  select v_session_id, row_number() over (order by i.output_position, i.id asc)::integer,
         i.id, i.source, i.suggested
    from interleaved i
   order by i.output_position, i.id asc
   limit v_candidate_limit;

  return v_session_id;
end
$function$;

drop function if exists public.unified_feed_post_ids(timestamptz, uuid, integer);
create or replace function public.unified_feed_post_ids(
  p_session_id uuid,
  p_after_position integer,
  p_limit integer default 20
)
returns table (session_id uuid, position integer, id uuid, source text, suggested boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select i.session_id, i.position, i.post_id, i.source, i.suggested
    from public.feed_session_items i
    join public.feed_sessions s on s.id = i.session_id
    join public.posts p on p.id = i.post_id
   where s.id = p_session_id and s.user_id = auth.uid() and s.expires_at > now()
     and i.position > greatest(coalesce(p_after_position, 0), 0)
     and p.moderation_state = 'visible'
     and not public.users_blocked(auth.uid(), p.user_id)
     and not exists (select 1 from public.post_hides h where h.post_id=p.id and h.user_id=auth.uid())
   order by i.position
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

revoke all on function public.create_unified_feed_session(integer) from public, anon;
grant execute on function public.create_unified_feed_session(integer) to authenticated;
revoke all on function public.unified_feed_post_ids(uuid, integer, integer) from public, anon;
grant execute on function public.unified_feed_post_ids(uuid, integer, integer) to authenticated;
