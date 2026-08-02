-- 0096: atomic, service-only quarantine for AI-moderated user content.

alter table public.posts add column if not exists moderation_state text not null default 'visible';
alter table public.post_comments add column if not exists moderation_state text not null default 'visible';
alter table public.stories add column if not exists moderation_state text not null default 'visible';

do $constraints$
declare t text;
begin
  foreach t in array array['posts','post_comments','stories'] loop
    if not exists (
      select 1 from pg_constraint
       where conrelid = format('public.%I', t)::regclass
         and conname = t || '_moderation_state_check'
    ) then
      execute format(
        'alter table public.%I add constraint %I check (moderation_state in (''visible'',''quarantined''))',
        t, t || '_moderation_state_check'
      );
    end if;
  end loop;
end
$constraints$;

alter table public.moderation_flags
  add column if not exists quarantine_reason text,
  add column if not exists check_status text not null default 'confirmed';

do $constraint$
begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.moderation_flags'::regclass
      and conname = 'moderation_flags_check_status_check') then
    alter table public.moderation_flags add constraint moderation_flags_check_status_check
      check (check_status in ('confirmed', 'safe', 'uncertain', 'error'));
  end if;
end
$constraint$;

create unique index if not exists moderation_flags_open_source_idx
  on public.moderation_flags(source_table, source_id)
  where status = 'open';

create or replace function public.quarantine_moderated_content(
  p_source_table text,
  p_source_id uuid,
  p_categories text[],
  p_max_score numeric,
  p_excerpt text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_author_id uuid;
  v_updated integer;
begin
  if p_source_table not in ('posts', 'post_comments', 'stories') then
    raise exception 'Unsupported moderation source: %', p_source_table
      using errcode = '22023';
  end if;

  execute format(
    'update public.%I set moderation_state = ''quarantined'' where id = $1 returning user_id',
    p_source_table
  ) into v_author_id using p_source_id;
  get diagnostics v_updated = row_count;

  -- A stale moderation callback must not create an orphan review item.
  if v_updated = 0 then
    return false;
  end if;

  insert into public.moderation_flags
    (source_table, source_id, author_id, categories, max_score,
     quarantine_reason, check_status, status)
  values
    (p_source_table, p_source_id, v_author_id,
     coalesce(p_categories, '{}'::text[]), p_max_score,
     left(p_excerpt, 500), 'confirmed', 'open')
  on conflict (source_table, source_id) where status = 'open'
  do update set
    author_id = excluded.author_id,
    categories = excluded.categories,
    max_score = excluded.max_score,
    quarantine_reason = excluded.quarantine_reason,
    check_status = 'confirmed';

  return true;
end
$function$;

revoke all on function public.quarantine_moderated_content(text, uuid, text[], numeric, text)
  from public, anon, authenticated;
grant execute on function public.quarantine_moderated_content(text, uuid, text[], numeric, text)
  to service_role;

-- Central post visibility remains the single predicate used by feed reads and
-- interactions; quarantine is checked before every existing audience branch.
create or replace function public.can_view_post(p_post_id uuid, p_viewer uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.posts p
     where p.id = p_post_id
       and p.moderation_state = 'visible'
       and p_viewer is not null
       and (
         p.user_id = p_viewer
         or (
           not public.users_blocked(p_viewer, p.user_id)
           and (
             p.page_id is not null
             or (p.group_id is not null and exists (
               select 1 from public.group_members gm
                where gm.group_id = p.group_id and gm.user_id = p_viewer
             ))
             or (p.group_id is null and p.page_id is null and (
               p.audience = 'public'
               or (p.audience = 'buddies' and public.are_buddies(p.user_id, p_viewer))
             ))
           )
         )
       )
  );
$$;

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using (moderation_state = 'visible' and public.can_view_post(id, auth.uid()));

drop policy if exists "Users update own posts" on public.posts;
create policy "Users update own posts" on public.posts for update to authenticated
  using (user_id = auth.uid() and moderation_state = 'visible')
  with check (
    user_id = auth.uid() and moderation_state = 'visible' and (
      (group_id is null and page_id is null and audience in ('buddies', 'public'))
      or (group_id is not null and page_id is null and audience = 'group')
      or (page_id is not null and group_id is null and audience = 'public')
    )
  );
drop policy if exists "Users delete own posts" on public.posts;
create policy "Users delete own posts" on public.posts for delete to authenticated
  using (user_id = auth.uid() and moderation_state = 'visible');

drop policy if exists "Likes readable by authenticated" on public.post_likes;
create policy "Likes readable by authenticated" on public.post_likes for select to authenticated
  using (public.can_view_post(post_id, auth.uid()));
drop policy if exists "Users insert own likes" on public.post_likes;
create policy "Users insert own likes" on public.post_likes for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_post(post_id, auth.uid()));
drop policy if exists "Users delete own likes" on public.post_likes;
create policy "Users delete own likes" on public.post_likes for delete to authenticated
  using (user_id = auth.uid() and public.can_view_post(post_id, auth.uid()));

drop policy if exists "Comments readable by authenticated" on public.post_comments;
create policy "Comments readable by authenticated" on public.post_comments for select to authenticated
  using (moderation_state = 'visible' and public.can_view_post(post_id, auth.uid()));
drop policy if exists "Users insert own comments" on public.post_comments;
create policy "Users insert own comments" on public.post_comments for insert to authenticated
  with check (user_id = auth.uid() and moderation_state = 'visible'
              and public.can_view_post(post_id, auth.uid()));
drop policy if exists "Users delete own comments" on public.post_comments;
create policy "Users delete own comments" on public.post_comments for delete to authenticated
  using (user_id = auth.uid() and moderation_state = 'visible'
         and public.can_view_post(post_id, auth.uid()));

drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select to authenticated
  using (
    moderation_state = 'visible' and (
      user_id = auth.uid()
      or (expires_at > now() and public.are_buddies(user_id, auth.uid())
          and not public.users_blocked(auth.uid(), user_id))
    )
  );
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated
  using (user_id = auth.uid() and moderation_state = 'visible');

-- Existing share creation signature and rendered public response are preserved.
create or replace function public.create_public_post_share(p_post uuid, p_preview_ref text)
returns uuid language plpgsql security definer set search_path = public as $$
declare p record; share_id uuid;
begin
  if p_preview_ref !~ '^r2://share-cards/' or split_part(p_preview_ref, '/', 4) <> auth.uid()::text then
    raise exception 'Invalid share-card reference.' using errcode = '22023';
  end if;
  select id, user_id, body into p from public.posts
   where id = p_post and user_id = auth.uid() and moderation_state = 'visible';
  if not found then
    raise exception 'That post cannot be shared by this account.' using errcode = '42501';
  end if;
  insert into public.public_shares(owner_id, post_id, title, description, preview_image_url, preview_image_ref)
  values (auth.uid(), p.id, left(coalesce(nullif(trim(p.body), ''), 'A win from AccountAbility'), 160),
          'A progress update shared with permission from AccountAbility.', null, p_preview_ref)
  returning id into share_id;
  return share_id;
end;
$$;

create or replace function public.get_public_share(p_share uuid)
returns table(title text, description text, preview_image_url text, sender_name text)
language sql stable security definer set search_path = public as $$
  select s.title, s.description, null::text, pp.display_name
    from public.public_shares s
    join public.posts p on p.id = s.post_id and p.moderation_state = 'visible'
    join public.public_profiles pp on pp.id = s.owner_id
   where s.id = p_share and s.revoked_at is null and s.expires_at > now();
$$;

create or replace function public.resolve_public_share_post(p_share uuid)
returns uuid language sql stable security invoker set search_path = public as $$
  select s.post_id from public.public_shares s
  join public.posts p on p.id = s.post_id and p.moderation_state = 'visible'
  where s.id = p_share and s.revoked_at is null and s.expires_at > now()
    and public.can_view_post(p.id, auth.uid()) limit 1;
$$;

drop policy if exists public_shares_owner_select on public.public_shares;
create policy public_shares_owner_select on public.public_shares for select to authenticated
  using (owner_id = auth.uid() and exists (
    select 1 from public.posts p where p.id = post_id and p.moderation_state = 'visible'
  ));
drop policy if exists public_shares_owner_revoke on public.public_shares;
create policy public_shares_owner_revoke on public.public_shares for update to authenticated
  using (owner_id = auth.uid() and exists (
    select 1 from public.posts p where p.id = post_id and p.moderation_state = 'visible'
  ))
  with check (owner_id = auth.uid());

revoke execute on function public.create_public_post_share(uuid, text) from public, anon;
grant execute on function public.create_public_post_share(uuid, text) to authenticated, service_role;
revoke execute on function public.get_public_share(uuid) from public;
grant execute on function public.get_public_share(uuid) to anon, authenticated, service_role;
revoke all on function public.resolve_public_share_post(uuid) from public, anon;
grant execute on function public.resolve_public_share_post(uuid) to authenticated, service_role;
