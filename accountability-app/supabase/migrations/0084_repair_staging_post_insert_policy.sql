-- Restore the intended owner/group/page INSERT boundary for Feed posts.
-- This is safe to reapply and does not modify existing post rows.
drop policy if exists "Users insert own posts" on public.posts;
drop policy if exists posts_insert_owner on public.posts;
create policy posts_insert_owner on public.posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (group_id is null and page_id is null and audience in ('buddies', 'public'))
      or (
        group_id is not null and page_id is null and audience = 'group'
        and exists (
          select 1 from public.group_members gm
          where gm.group_id = posts.group_id and gm.user_id = auth.uid()
        )
      )
      or (
        page_id is not null and group_id is null and audience = 'public'
        and exists (
          select 1 from public.pages pg
          where pg.id = posts.page_id and pg.owner = auth.uid()
        )
      )
    )
  );
