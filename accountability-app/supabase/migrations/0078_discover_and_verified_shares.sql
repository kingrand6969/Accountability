-- Discover + trustworthy cross-feature sharing.
-- Personal posts are buddy-only unless their author deliberately chooses Public.
-- Blocking is respected in both directions at the database boundary.

alter table public.posts
  add column if not exists audience text not null default 'buddies'
    check (audience in ('buddies', 'public', 'group')),
  add column if not exists post_type text not null default 'post'
    check (post_type in ('post', 'photo', 'run', 'workout', 'milestone', 'event', 'memory', 'savings')),
  add column if not exists share_data jsonb not null default '{}'::jsonb,
  add column if not exists activity_id uuid references public.activities (id) on delete set null;

create index if not exists posts_discover_idx
  on public.posts (audience, created_at desc)
  where group_id is null and page_id is null;
create index if not exists posts_activity_idx
  on public.posts (activity_id)
  where activity_id is not null;

-- Preserve the established meaning of existing group/page posts while making
-- historical personal posts buddy-only (the safer migration default).
update public.posts set audience = 'group' where group_id is not null;
update public.posts set audience = 'public' where page_id is not null;
update public.posts set post_type = 'event' where event_id is not null;
update public.posts set post_type = 'photo'
 where event_id is null and image_url is not null and post_type = 'post';

create or replace function public.users_blocked(u1 uuid, u2 uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.buddy_blocks b
     where (b.blocker = u1 and b.blocked = u2)
        or (b.blocker = u2 and b.blocked = u1)
  );
$$;
revoke all on function public.users_blocked(uuid, uuid) from public;
grant execute on function public.users_blocked(uuid, uuid) to authenticated;

-- Central visibility predicate used by posts, likes and comments. SECURITY
-- DEFINER avoids recursive posts RLS while exposing only a boolean.
create or replace function public.can_view_post(p_post_id uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.posts p
     where p.id = p_post_id
       and p_viewer is not null
       and (
         p.user_id = p_viewer
         or (
           not public.users_blocked(p_viewer, p.user_id)
           and (
             (p.page_id is not null)
             or (
               p.group_id is not null
               and exists (
                 select 1 from public.group_members gm
                  where gm.group_id = p.group_id and gm.user_id = p_viewer
               )
             )
             or (
               p.group_id is null and p.page_id is null
               and (
                 p.audience = 'public'
                 or (p.audience = 'buddies' and public.are_buddies(p.user_id, p_viewer))
               )
             )
           )
         )
       )
  );
$$;

revoke all on function public.can_view_post(uuid, uuid) from public;
grant execute on function public.can_view_post(uuid, uuid) to authenticated;

drop policy if exists "Posts readable by authenticated" on public.posts;
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (public.can_view_post(id, auth.uid()));

-- Rebuild author checks while preserving group membership and page ownership.
drop policy if exists "Users insert own posts" on public.posts;
create policy "Users insert own posts" on public.posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (group_id is null and page_id is null and audience in ('buddies', 'public'))
      or (
        group_id is not null and page_id is null and audience = 'group'
        and exists (
          select 1 from public.group_members gm
           where gm.group_id = posts.group_id and gm.user_id = auth.uid()
        )
      )
      or (
        page_id is not null and group_id is null and audience = 'public'
        and exists (
          select 1 from public.pages pg
           where pg.id = posts.page_id and pg.owner = auth.uid()
        )
      )
    )
  );

drop policy if exists "Users update own posts" on public.posts;
create policy "Users update own posts" on public.posts
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      (group_id is null and page_id is null and audience in ('buddies', 'public'))
      or (group_id is not null and page_id is null and audience = 'group')
      or (page_id is not null and group_id is null and audience = 'public')
    )
  );

-- Likes and comments cannot be used to inspect or interact with a post the
-- viewer is not allowed to see.
drop policy if exists "Likes readable by authenticated" on public.post_likes;
create policy "Likes readable by authenticated" on public.post_likes
  for select to authenticated using (public.can_view_post(post_id, auth.uid()));
drop policy if exists "Users insert own likes" on public.post_likes;
create policy "Users insert own likes" on public.post_likes
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_post(post_id, auth.uid()));

drop policy if exists "Comments readable by authenticated" on public.post_comments;
create policy "Comments readable by authenticated" on public.post_comments
  for select to authenticated using (public.can_view_post(post_id, auth.uid()));
drop policy if exists "Users insert own comments" on public.post_comments;
create policy "Users insert own comments" on public.post_comments
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_post(post_id, auth.uid()));

-- A Run post may only point at the author's own saved GPS activity. Verified
-- values are copied server-side; the client cannot forge the verification data.
create or replace function public.hydrate_verified_run_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  if new.post_type <> 'run' then
    new.activity_id := null;
    return new;
  end if;
  if new.activity_id is null then
    raise exception 'A verified Run post requires a saved activity.' using errcode = '23514';
  end if;
  select id, user_id, type, distance_m, duration_s, started_at
    into a from public.activities where id = new.activity_id;
  if not found or a.user_id <> new.user_id then
    raise exception 'That activity cannot be shared by this account.' using errcode = '42501';
  end if;
  new.share_data := coalesce(new.share_data, '{}'::jsonb) || jsonb_build_object(
    'verified', true,
    'activity_type', a.type,
    'distance_m', round(a.distance_m),
    'duration_s', a.duration_s,
    'started_at', a.started_at
  );
  return new;
end;
$$;

drop trigger if exists hydrate_verified_run_share on public.posts;
create trigger hydrate_verified_run_share
  before insert or update of post_type, activity_id, share_data
  on public.posts for each row execute function public.hydrate_verified_run_share();

-- My Day is buddy-first too. This closes the previous "every signed-in user"
-- story policy and applies the same two-way block rule.
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      expires_at > now()
      and public.are_buddies(user_id, auth.uid())
      and not public.users_blocked(auth.uid(), user_id)
    )
  );
