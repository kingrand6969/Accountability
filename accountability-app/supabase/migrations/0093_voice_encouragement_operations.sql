drop policy if exists encouragements_select on public.post_encouragements;
create policy encouragements_select on public.post_encouragements
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.can_view_post(post_id, auth.uid())
  );
