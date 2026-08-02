-- Short, user-selected video posts. Media remains in the private R2 bucket and
-- is resolved through the same authenticated read path as private photos.
alter table public.posts
  drop constraint if exists posts_post_type_check;

alter table public.posts
  add constraint posts_post_type_check
  check (post_type in (
    'post', 'photo', 'video', 'run', 'workout', 'milestone',
    'event', 'memory', 'savings'
  ));
