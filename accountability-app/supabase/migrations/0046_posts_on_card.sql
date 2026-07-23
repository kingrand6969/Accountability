-- Buddy card posts: a member can grant specific posts to non-buddy visitors.
-- posts.show_on_card marks a post as viewable on the owner's buddy card by
-- people who are NOT their buddy yet. Buddies see recent posts regardless
-- (they already see them in the feed).

alter table public.posts
  add column if not exists show_on_card boolean not null default false;

-- fast card lookups for the granted subset
create index if not exists posts_card_idx
  on public.posts (user_id, created_at desc) where show_on_card;
