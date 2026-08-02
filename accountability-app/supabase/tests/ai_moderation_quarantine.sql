begin;

-- Integration coverage for 0096. Run as postgres against a disposable database.
-- Idempotency harness (PowerShell, from the repository root):
--   Get-Content -Raw supabase/migrations/0096_ai_moderation_quarantine.sql | docker exec -i <disposable-db> psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--   Get-Content -Raw supabase/migrations/0096_ai_moderation_quarantine.sql | docker exec -i <disposable-db> psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--   Get-Content -Raw supabase/tests/ai_moderation_quarantine.sql | docker exec -i <disposable-db> psql -v ON_ERROR_STOP=1 -U postgres -d postgres
do $test$
declare
  owner_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  post_id uuid := gen_random_uuid();
  comment_parent_id uuid := gen_random_uuid();
  comment_id uuid := gen_random_uuid();
  story_id uuid := gen_random_uuid();
  share_id uuid := gen_random_uuid();
  n integer;
  state text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts'
      and column_name = 'moderation_state'
  ) then raise exception 'posts.moderation_state is missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'post_comments'
      and column_name = 'moderation_state'
  ) then raise exception 'post_comments.moderation_state is missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stories'
      and column_name = 'moderation_state'
  ) then raise exception 'stories.moderation_state is missing'; end if;
  if to_regprocedure('public.quarantine_moderated_content(text,uuid,text[],numeric,text)') is null then
    raise exception 'quarantine function is missing';
  end if;
  if has_function_privilege('public', 'public.quarantine_moderated_content(text,uuid,text[],numeric,text)', 'execute')
     or has_function_privilege('anon', 'public.quarantine_moderated_content(text,uuid,text[],numeric,text)', 'execute')
     or has_function_privilege('authenticated', 'public.quarantine_moderated_content(text,uuid,text[],numeric,text)', 'execute')
     or not has_function_privilege('service_role', 'public.quarantine_moderated_content(text,uuid,text[],numeric,text)', 'execute') then
    raise exception 'quarantine function grants are unsafe';
  end if;
  set local role authenticated;
  begin
    perform public.quarantine_moderated_content('posts', gen_random_uuid(), '{}', 1, 'denied');
    raise exception 'authenticated invoked service-only quarantine function';
  exception when insufficient_privilege then null;
  end;
  reset role;

  insert into auth.users(id, email) values
    (owner_id, owner_id || '@test.invalid'),
    (viewer_id, viewer_id || '@test.invalid');
  insert into public.posts(id, user_id, body, audience) values
    (post_id, owner_id, 'quarantine post', 'public'),
    (comment_parent_id, owner_id, 'visible comment parent', 'public');
  insert into public.post_comments(id, post_id, user_id, body) values
    (comment_id, comment_parent_id, owner_id, 'quarantine comment');
  insert into public.stories(id, user_id, image_url) values
    (story_id, owner_id, 'r2://test/story');
  insert into public.public_shares(id, owner_id, post_id, title)
    values (share_id, owner_id, post_id, 'share');

  begin
    perform public.quarantine_moderated_content('buddy_messages', post_id, array['x'], .9, 'bad');
    raise exception 'unsupported source_table was accepted';
  exception when invalid_parameter_value then null;
  end;

  perform public.quarantine_moderated_content('post_comments', comment_id, array['harassment'], .8, 'bad comment');
  perform public.quarantine_moderated_content('stories', story_id, array['violence'], .7, 'bad story');
  perform public.quarantine_moderated_content('posts', post_id, array['hate'], .95, 'bad post');
  perform public.quarantine_moderated_content('posts', post_id, array['hate','violence'], .99, 'updated excerpt');

  select moderation_state into state from public.posts where id = post_id;
  if state <> 'quarantined' then raise exception 'post was not quarantined'; end if;
  select moderation_state into state from public.post_comments where id = comment_id;
  if state <> 'quarantined' then raise exception 'comment was not quarantined'; end if;
  select moderation_state into state from public.stories where id = story_id;
  if state <> 'quarantined' then raise exception 'story was not quarantined'; end if;
  select moderation_state into state from public.posts where id = comment_parent_id;
  if state <> 'visible' then raise exception 'comment parent was unexpectedly quarantined'; end if;
  select count(*) into n from public.moderation_flags
   where source_table = 'posts' and source_id = post_id and status = 'open';
  if n <> 1 then raise exception 'quarantine is not idempotent: % open flags', n; end if;
  select count(*) into n from public.moderation_flags
   where source_table = 'post_comments' and source_id = comment_id and status = 'open';
  if n <> 1 then raise exception 'comment did not create exactly one open flag'; end if;
  select count(*) into n from public.moderation_flags
   where source_table = 'stories' and source_id = story_id and status = 'open';
  if n <> 1 then raise exception 'story did not create exactly one open flag'; end if;
  if not exists (select 1 from public.moderation_flags where source_table='posts' and source_id=post_id
                 and categories=array['hate','violence'] and max_score=.99
                 and excerpt='updated excerpt' and quarantine_reason='updated excerpt'
                 and check_status='confirmed') then
    raise exception 'open flag metadata was not updated';
  end if;
  insert into public.admins(user_id) values(owner_id);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  if public.admin_list_flags(true, 100)::text not like '%updated excerpt%' then
    raise exception 'admin review queue cannot see the quarantine excerpt';
  end if;
  if exists (
    select 1 from public.moderation_flags
     where status='open' group by source_table, source_id having count(*) > 1
  ) then raise exception 'legacy duplicate open flags were not reconciled'; end if;

  -- This replay database intentionally omits API CRUD grants. Grant them only
  -- inside this transaction so the assertions exercise RLS, then ROLLBACK.
  grant select, insert, update, delete on public.posts, public.post_comments,
    public.post_likes, public.stories, public.public_shares to authenticated;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  begin
    insert into public.posts(user_id, body, audience, moderation_state)
      values(owner_id, 'client quarantine attempt', 'public', 'quarantined');
    raise exception 'client inserted a quarantined post';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stories(user_id, image_url, moderation_state)
      values(owner_id, 'r2://test/tamper', 'quarantined');
    raise exception 'client inserted a quarantined story';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.posts set moderation_state='quarantined' where id=comment_parent_id;
    raise exception 'client changed visible post moderation state';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.posts where id=post_id) then raise exception 'author can read quarantined post'; end if;
  if exists (select 1 from public.post_comments where id=comment_id) then raise exception 'author can read quarantined comment'; end if;
  if exists (select 1 from public.stories where id=story_id) then raise exception 'author can read quarantined story'; end if;
  update public.posts set moderation_state='visible' where id=post_id;
  if found then raise exception 'client cleared quarantined post moderation state'; end if;
  if public.resolve_public_share_post(share_id) is not null then raise exception 'share resolved quarantined post'; end if;
  if exists (select 1 from public.get_public_share(share_id)) then raise exception 'public share exposed quarantined post'; end if;
  begin
    insert into public.post_likes(post_id,user_id) values(post_id, owner_id);
    raise exception 'like on quarantined post succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.post_comments(post_id,user_id,body) values(post_id, owner_id, 'blocked');
    raise exception 'comment on quarantined post succeeded';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role anon;
  if exists (select 1 from public.get_public_share(share_id)) then
    raise exception 'anonymous public share exposed quarantined post';
  end if;
  reset role;

  if public.quarantine_moderated_content('posts', gen_random_uuid(), array['x'], .5, 'missing') then
    raise exception 'missing source returned true';
  end if;
  select count(*) into n from public.moderation_flags where quarantine_reason='missing' and status='open';
  if n <> 0 then raise exception 'missing source created a moderation flag'; end if;
end
$test$;

rollback;
