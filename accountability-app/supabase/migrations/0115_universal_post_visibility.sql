begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The former controls allowed four combinations. Preserve only the exact
-- explicit Public + Buddy Card choice; normalize every ambiguous personal row
-- toward Buddies-only before adding the invariant.
alter table public.posts
  drop constraint if exists posts_personal_visibility_check;

update public.posts
set audience = 'buddies',
    show_on_card = false
where group_id is null
  and page_id is null
  and not (audience = 'public' and show_on_card is true);

-- Event announcements created by 0109 own a separate auto-created group. If
-- an ambiguous legacy announcement was repaired to Buddies-only above, keep
-- that exact linked group out of the public directory as well. The generated
-- description, event link and matching creator avoid touching normal groups.
update public.groups g
set privacy = 'private'
where g.privacy = 'public'
  and g.description like 'Event group · % — auto-created when the event was announced.'
  and exists (
    select 1
    from public.events e
    join public.posts p on p.event_id = e.id
    where e.group_id = g.id
      and e.created_by = p.user_id
      and g.created_by = e.created_by
      and p.post_type = 'event'
      and p.group_id is null
      and p.page_id is null
      and p.audience = 'buddies'
      and p.show_on_card = false
  )
  and not exists (
    select 1
    from public.events e_public
    join public.posts p_public on p_public.event_id = e_public.id
    where e_public.group_id = g.id
      and e_public.created_by = p_public.user_id
      and p_public.post_type = 'event'
      and p_public.audience = 'public'
      and p_public.show_on_card = true
  );

alter table public.posts
  add constraint posts_personal_visibility_check
  check (
    group_id is not null
    or page_id is not null
    or (audience = 'buddies' and show_on_card = false)
    or (audience = 'public' and show_on_card = true)
  ) not valid;

alter table public.posts
  validate constraint posts_personal_visibility_check;

commit;
