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
  and audience in ('buddies', 'public')
  and not (audience = 'public' and show_on_card is true);

alter table public.posts
  add constraint posts_personal_visibility_check
  check (
    group_id is not null
    or page_id is not null
    or audience not in ('buddies', 'public')
    or (audience = 'buddies' and show_on_card = false)
    or (audience = 'public' and show_on_card = true)
  ) not valid;

alter table public.posts
  validate constraint posts_personal_visibility_check;

commit;
