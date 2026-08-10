-- Story view receipts are private to the signed-in viewer. Buddy Stars are the
-- followed-person relationship: starrer follows target, without implying friendship.
create table if not exists public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create index if not exists story_views_user_story_idx
  on public.story_views (user_id, story_id);

alter table public.story_views enable row level security;

drop policy if exists story_views_select on public.story_views;
create policy story_views_select on public.story_views
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists story_views_insert on public.story_views;
create policy story_views_insert on public.story_views
  for insert to authenticated
  with check (
    story_views.user_id = auth.uid()
    and exists (
      select 1
      from public.stories visible_story
      where visible_story.id = story_views.story_id
    )
  );

-- Receipts are immutable evidence: viewers cannot retarget them, edit their
-- server timestamp, or remove them after insert.
drop policy if exists story_views_update on public.story_views;

-- Revoke default table privileges first. Omitting viewed_at from the INSERT
-- grant forces PostgreSQL to supply now(), while the stories RLS-backed EXISTS
-- makes blocked, expired, quarantined, and unrelated stories unwritable alike.
revoke all on table public.story_views from public, anon, authenticated;
grant select on table public.story_views to authenticated;
grant insert (story_id, user_id) on table public.story_views to authenticated;

-- A followed viewer is represented by Buddy Stars with the story author as
-- target and the current viewer as starrer. Expiry and blocks guard the whole
-- buddy-or-followed branch, so neither relationship can bypass those checks.
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories
  for select to authenticated
  using (
    moderation_state = 'visible'
    and (
      (user_id = auth.uid())
      or (
        expires_at > now()
        and not public.users_blocked(auth.uid(), user_id)
        and (
          public.are_buddies(user_id, auth.uid())
          or exists (
            select 1
            from public.buddy_stars bs
            where bs.target = stories.user_id
              and bs.starrer = auth.uid()
          )
        )
      )
    )
  );
