-- Tag buddies on posts (photo tagging). Tags flow into Memories as snapshots.

create table if not exists public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade, -- the tagged buddy
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_tags enable row level security;

-- names are public via public_profiles; the post's own RLS governs post visibility
create policy post_tags_select on public.post_tags
  for select to authenticated using (true);

-- only the post's author can tag, and only people who are their buddies
create policy post_tags_insert on public.post_tags
  for insert to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.buddy_links bl
      where (bl.user_a = auth.uid() and bl.user_b = post_tags.user_id)
         or (bl.user_b = auth.uid() and bl.user_a = post_tags.user_id)
    )
  );

-- the author can untag; the tagged person can remove themselves
create policy post_tags_delete on public.post_tags
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
  );

-- memories keep a snapshot of who was in the moment
alter table public.memories
  add column if not exists tagged text[];
