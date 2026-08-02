-- Ensure an author can read back a post immediately after INSERT ... RETURNING.
-- All non-owner visibility continues to use the centralized privacy predicate.
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.can_view_post(id, auth.uid())
  );
