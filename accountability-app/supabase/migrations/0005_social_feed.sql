-- Accountability App — social feed: posts, likes, comments.
-- user_id references public.profiles(id) so PostgREST can embed author info.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- POSTS
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
alter table public.posts enable row level security;

drop policy if exists "Posts readable by authenticated" on public.posts;
create policy "Posts readable by authenticated" on public.posts
  for select using (auth.role() = 'authenticated');
drop policy if exists "Users insert own posts" on public.posts;
create policy "Users insert own posts" on public.posts
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own posts" on public.posts;
create policy "Users update own posts" on public.posts
  for update using (auth.uid() = user_id);
drop policy if exists "Users delete own posts" on public.posts;
create policy "Users delete own posts" on public.posts
  for delete using (auth.uid() = user_id);

-- LIKES (one per user per post)
create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;

drop policy if exists "Likes readable by authenticated" on public.post_likes;
create policy "Likes readable by authenticated" on public.post_likes
  for select using (auth.role() = 'authenticated');
drop policy if exists "Users insert own likes" on public.post_likes;
create policy "Users insert own likes" on public.post_likes
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users delete own likes" on public.post_likes;
create policy "Users delete own likes" on public.post_likes
  for delete using (auth.uid() = user_id);

-- COMMENTS
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;

drop policy if exists "Comments readable by authenticated" on public.post_comments;
create policy "Comments readable by authenticated" on public.post_comments
  for select using (auth.role() = 'authenticated');
drop policy if exists "Users insert own comments" on public.post_comments;
create policy "Users insert own comments" on public.post_comments
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users delete own comments" on public.post_comments;
create policy "Users delete own comments" on public.post_comments
  for delete using (auth.uid() = user_id);
