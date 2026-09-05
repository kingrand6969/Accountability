begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The former controls allowed four combinations. Preserve only the exact
-- explicit Public + Buddy Card choice; normalize every ambiguous personal row
-- toward Buddies-only before adding the invariant.
alter table public.posts
  drop constraint if exists posts_personal_visibility_check;

with repaired_personal_posts as (
  update public.posts
  set audience = 'buddies',
      show_on_card = false
  where group_id is null
    and page_id is null
    and not (
      (audience = 'buddies' and show_on_card = false)
      or (audience = 'public' and show_on_card is true)
    )
  returning id, user_id, event_id, post_type
),
repaired_event_groups as (
  select distinct e.group_id, r.user_id
  from public.events e
  join repaired_personal_posts r on r.event_id = e.id
  where e.created_by = r.user_id
    and r.post_type = 'event'
)
-- Event announcements created by 0109 own a separate auto-created group. Use
-- only IDs returned by the repair above so an unrelated pre-existing Buddies
-- event can never cause a coincidentally named group to be downgraded.
update public.groups g
set privacy = 'private'
from repaired_event_groups r
where g.privacy = 'public'
  and g.id = r.group_id
  and g.created_by = r.user_id
  and g.description like 'Event group · % — auto-created when the event was announced.'
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
