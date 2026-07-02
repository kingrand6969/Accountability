-- Business Pages: public profiles for gyms, coaches, brands — followable,
-- with their own post feed. Original implementation (the concept is common
-- to every social network; only assets/code are protectable, and ours are ours).

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  category text not null default 'business',
  bio text,
  avatar_url text,
  cover_url text,
  owner uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.page_follows (
  page_id uuid not null references public.pages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (page_id, user_id)
);

create index if not exists page_follows_user_idx on public.page_follows (user_id);

alter table public.pages enable row level security;
alter table public.page_follows enable row level security;

-- pages are public to signed-in users
drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages
  for select to authenticated using (true);

drop policy if exists pages_insert on public.pages;
create policy pages_insert on public.pages
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists pages_update on public.pages;
create policy pages_update on public.pages
  for update to authenticated using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists pages_delete on public.pages;
create policy pages_delete on public.pages
  for delete to authenticated using (owner = auth.uid());

drop policy if exists page_follows_select on public.page_follows;
create policy page_follows_select on public.page_follows
  for select to authenticated using (true);

drop policy if exists page_follows_insert on public.page_follows;
create policy page_follows_insert on public.page_follows
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists page_follows_delete on public.page_follows;
create policy page_follows_delete on public.page_follows
  for delete to authenticated using (user_id = auth.uid());

-- posts can belong to a page (public reach — visible to all signed-in users)
alter table public.posts
  add column if not exists page_id uuid references public.pages (id) on delete cascade;

create index if not exists posts_page_idx on public.posts (page_id, created_at desc);

-- only the page owner may post as the page (rebuild INSERT policy)
drop policy if exists "Users insert own posts" on public.posts;
create policy "Users insert own posts" on public.posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      group_id is null
      or exists (
        select 1 from public.group_members m
        where m.group_id = posts.group_id and m.user_id = auth.uid()
      )
    )
    and (
      page_id is null
      or exists (
        select 1 from public.pages p
        where p.id = posts.page_id and p.owner = auth.uid()
      )
    )
  );
