-- 0066: per-viewer post hiding. "Hide post" removes a post from YOUR feed only
-- (the author keeps it); reporting a post also hides it for the reporter.
-- Deleting is the author's own RLS right (migration 0005); reports reuse
-- buddy_reports and land in the admin dashboard's Reports queue.

create table if not exists public.post_hides (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.post_hides enable row level security;

drop policy if exists "hide own" on public.post_hides;
create policy "hide own" on public.post_hides
  for insert with check (user_id = auth.uid());

drop policy if exists "read own hides" on public.post_hides;
create policy "read own hides" on public.post_hides
  for select using (user_id = auth.uid());

drop policy if exists "unhide own" on public.post_hides;
create policy "unhide own" on public.post_hides
  for delete using (user_id = auth.uid());
