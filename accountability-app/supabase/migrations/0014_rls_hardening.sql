-- Accountability App — RLS hardening: add WITH CHECK clauses to UPDATE policies
-- so a row can't be updated into a state that violates ownership, and constrain
-- buddy request responses to valid statuses.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users update own timeline" on public.timeline_items;
create policy "Users update own timeline" on public.timeline_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users update own posts" on public.posts;
create policy "Users update own posts" on public.posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Respond to requests" on public.buddy_requests;
create policy "Respond to requests" on public.buddy_requests
  for update using (auth.uid() = to_user)
  with check (auth.uid() = to_user and status in ('accepted', 'declined'));
