-- Integration coverage for 0096. Run as postgres against a disposable database.
-- Enable the upgrade harness only on a disposable database. This file and the
-- migrations directory must retain their repository-relative layout:
--   psql -v ON_ERROR_STOP=1 -v quarantine_upgrade_harness=1 \
--     -f supabase/tests/ai_moderation_quarantine.sql

\set ON_ERROR_STOP on
\if :{?quarantine_upgrade_harness}
drop index if exists public.moderation_flags_open_source_idx;
drop index if exists public.buddy_reports_open_structured_idx;
delete from public.moderation_flags
 where source_table='posts' and source_id='11111111-1111-1111-1111-111111111111';
insert into public.moderation_flags
  (id,source_table,source_id,excerpt,image_url,categories,max_score,status,created_at)
values
  ('21111111-1111-1111-1111-111111111111','posts','11111111-1111-1111-1111-111111111111',
   'older evidence','r2://legacy/older-image',array['hate'],.4,'open','2026-01-01 00:00:00+00'),
  ('31111111-1111-1111-1111-111111111111','posts','11111111-1111-1111-1111-111111111111',
   'newer evidence',null,array['violence'],.9,'open','2026-01-02 00:00:00+00');
insert into auth.users(id, email) values
  ('41111111-1111-4111-8111-111111111111','reporter-upgrade@test.invalid'),
  ('42111111-1111-4111-8111-111111111111','author-upgrade@test.invalid')
on conflict (id) do nothing;
insert into public.buddy_reports(id, reporter, reported, reason, source_table, source_id, created_at)
values
  ('43111111-1111-4111-8111-111111111111','41111111-1111-4111-8111-111111111111',
   '42111111-1111-4111-8111-111111111111','older report','posts',
   '44111111-1111-4111-8111-111111111111','2026-01-01 00:00:00+00'),
  ('45111111-1111-4111-8111-111111111111','41111111-1111-4111-8111-111111111111',
   '42111111-1111-4111-8111-111111111111','newer report','posts',
   '44111111-1111-4111-8111-111111111111','2026-01-02 00:00:00+00');

-- Run the exact migration reconciliation rather than a test-side copy.
\ir ../migrations/0096_ai_moderation_quarantine.sql
do $upgrade_test$
begin
  if not exists (select 1 from public.moderation_flags
    where id='31111111-1111-1111-1111-111111111111' and status='open'
      and excerpt='newer evidence' and image_url='r2://legacy/older-image'
      and categories=array['hate','violence'] and max_score=.9) then
    raise exception 'newest duplicate was not retained with merged evidence';
  end if;
  if not exists (select 1 from public.moderation_flags
    where id='21111111-1111-1111-1111-111111111111'
      and status='dismissed' and reviewed_at is not null) then
    raise exception 'older duplicate was not preserved as dismissed audit';
  end if;
  if (select count(*) from public.moderation_flags
    where source_table='posts' and source_id='11111111-1111-1111-1111-111111111111'
      and status='open') <> 1 then
    raise exception 'duplicate upgrade did not leave exactly one open flag';
  end if;
  if (select count(*) from public.buddy_reports
      where reporter='41111111-1111-4111-8111-111111111111'
        and source_table='posts' and source_id='44111111-1111-4111-8111-111111111111'
        and resolved_at is null) <> 1
     or not exists (select 1 from public.buddy_reports
       where id='43111111-1111-4111-8111-111111111111' and resolved_at is not null) then
    raise exception 'structured report duplicates were not reconciled with audit history';
  end if;
end
$upgrade_test$;
delete from public.moderation_flags
 where source_table='posts' and source_id='11111111-1111-1111-1111-111111111111';
delete from public.buddy_reports
 where reporter='41111111-1111-4111-8111-111111111111';

-- Prove a subsequent safe application after the upgrade application above.
\ir ../migrations/0096_ai_moderation_quarantine.sql
\endif

begin;
do $test$
declare
  owner_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  reviewer_id uuid := gen_random_uuid();
  post_id uuid := gen_random_uuid();
  comment_parent_id uuid := gen_random_uuid();
  comment_id uuid := gen_random_uuid();
  story_id uuid := gen_random_uuid();
  review_post_id uuid := gen_random_uuid();
  review_comment_parent_id uuid := gen_random_uuid();
  review_comment_id uuid := gen_random_uuid();
  review_story_id uuid := gen_random_uuid();
  stale_post_id uuid := gen_random_uuid();
  report_post_id uuid := gen_random_uuid();
  report_comment_parent_id uuid := gen_random_uuid();
  report_comment_id uuid := gen_random_uuid();
  report_story_id uuid := gen_random_uuid();
  unsafe_url_post_id uuid := gen_random_uuid();
  missing_secret_post_id uuid := gen_random_uuid();
  sync_failure_post_id uuid := gen_random_uuid();
  structured_report_id uuid;
  duplicate_report_id uuid;
  share_id uuid := gen_random_uuid();
  n integer;
  state text;
  post_flag_id uuid;
  comment_flag_id uuid;
  story_flag_id uuid;
  stale_flag_id uuid;
  review_result jsonb;
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
  if to_regprocedure('public.report_content(text,uuid,text)') is null then
    raise exception 'structured report function is missing';
  end if;
  if to_regprocedure('public.review_quarantined_content(uuid,text,uuid,text,text)') is null then
    raise exception 'administrator quarantine review function is missing';
  end if;
  if to_regprocedure('public.review_quarantined_content(uuid,text)') is null then
    raise exception 'minimal administrator quarantine review function is missing';
  end if;
  if has_function_privilege('public', 'public.review_quarantined_content(uuid,text,uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.review_quarantined_content(uuid,text,uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.review_quarantined_content(uuid,text,uuid,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.review_quarantined_content(uuid,text,uuid,text,text)', 'execute') then
    raise exception 'administrator quarantine review grants are unsafe';
  end if;
  if has_function_privilege('public', 'public.review_quarantined_content(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.review_quarantined_content(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.review_quarantined_content(uuid,text)', 'execute')
     or not has_function_privilege('service_role', 'public.review_quarantined_content(uuid,text)', 'execute') then
    raise exception 'minimal administrator quarantine review grants are unsafe';
  end if;
  if has_function_privilege('public', 'public.report_content(text,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.report_content(text,uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.report_content(text,uuid,text)', 'execute')
     or not has_function_privilege('service_role', 'public.report_content(text,uuid,text)', 'execute') then
    raise exception 'structured report function grants are unsafe';
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
    (viewer_id, viewer_id || '@test.invalid'),
    (reviewer_id, reviewer_id || '@test.invalid');
  insert into public.posts(id, user_id, body, audience) values
    (post_id, owner_id, 'quarantine post', 'public'),
    (comment_parent_id, owner_id, 'visible comment parent', 'public'),
    (report_post_id, owner_id, 'reported but still visible', 'public'),
    (report_comment_parent_id, owner_id, 'reported comment parent', 'public'),
    (review_post_id, owner_id, 'review post', 'public'),
    (review_comment_parent_id, owner_id, 'review comment parent', 'public'),
    (stale_post_id, owner_id, 'stale review post', 'public'),
    (unsafe_url_post_id, owner_id, 'unsafe config report', 'public'),
    (missing_secret_post_id, owner_id, 'missing secret report', 'public'),
    (sync_failure_post_id, owner_id, 'sync failure report', 'public');
  insert into public.post_comments(id, post_id, user_id, body) values
    (comment_id, comment_parent_id, owner_id, 'quarantine comment'),
    (review_comment_id, review_comment_parent_id, owner_id, 'review comment'),
    (report_comment_id, report_comment_parent_id, owner_id, 'reported comment');
  insert into public.stories(id, user_id, image_url) values
    (story_id, owner_id, 'r2://test/story'),
    (review_story_id, owner_id, 'r2://test/review-story'),
    (report_story_id, owner_id, 'r2://test/reported-story');
  insert into public.buddy_links(user_a, user_b)
    values (least(owner_id, viewer_id), greatest(owner_id, viewer_id));
  insert into public.public_shares(id, owner_id, post_id, title)
    values (share_id, owner_id, post_id, 'share');
  grant insert on public.buddy_reports to authenticated;

  set local role anon;
  begin
    perform public.report_content('posts', report_post_id, null);
    raise exception 'anonymous caller invoked structured reporting';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  set local role authenticated;
  insert into public.buddy_reports(reporter, reported, reason)
    values(viewer_id, owner_id, 'legacy profile or voice report');
  begin
    insert into public.buddy_reports(reporter, reported, reason, source_table, source_id)
      values(viewer_id, owner_id, 'forged structured report', 'posts', report_post_id);
    raise exception 'direct client insert forged a structured report';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The buddy-specific limiter admits/counts under the same reporter lock used
  -- by report_content. Legacy null-source reports still use their direct path.
  update public.rate_limits
     set max_rows = (select count(*) + 1 from public.buddy_reports where reporter=viewer_id)
   where tbl='buddy_reports';
  set local role authenticated;
  insert into public.buddy_reports(reporter, reported, reason)
    values(viewer_id, owner_id, 'legacy report at remaining capacity');
  begin
    insert into public.buddy_reports(reporter, reported, reason)
      values(viewer_id, owner_id, 'legacy report over capacity');
    raise exception 'serialized buddy report limit was exceeded';
  exception when program_limit_exceeded then null;
  end;
  reset role;
  update public.rate_limits set max_rows=20 where tbl='buddy_reports';

  -- Local HTTP is test-only and requires an explicit server-side opt-in.
  insert into public.internal_config(key, value) values
    ('moderation_url', 'http://127.0.0.1:1/functions/v1/moderate-content'),
    ('moderation_secret', 'test-secret'),
    ('moderation_allow_local', 'true')
  on conflict (key) do update set value = excluded.value;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  set local role authenticated;
  structured_report_id := public.report_content(
    'posts', report_post_id, repeat('x', 510) || chr(1) || ' trailing'
  );
  duplicate_report_id := public.report_content('posts', report_post_id, 'duplicate');
  perform public.report_content('post_comments', report_comment_id, E'  harmful\001\n claim  ');
  perform public.report_content('stories', report_story_id, 'unsafe');
  begin
    perform public.report_content('buddy_messages', report_post_id, null);
    raise exception 'unsupported structured report source was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.report_content('posts', gen_random_uuid(), null);
    raise exception 'unavailable source was accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;

  if not exists (select 1 from public.buddy_reports
    where id = structured_report_id and reporter = viewer_id and reported = owner_id
      and source_table = 'posts' and source_id = report_post_id
      and length(reason) = 500 and reason !~ '[[:cntrl:]]') then
    raise exception 'structured report payload or server-derived identities are wrong';
  end if;
  if duplicate_report_id <> structured_report_id
     or (select count(*) from public.buddy_reports where reporter=viewer_id
         and source_table='posts' and source_id=report_post_id and resolved_at is null) <> 1 then
    raise exception 'duplicate structured report was not idempotent';
  end if;
  if not exists (select 1 from public.buddy_reports
    where reporter=viewer_id and source_table='post_comments'
      and source_id=report_comment_id and reason='harmful claim') then
    raise exception 'report reason controls/whitespace were not normalized';
  end if;
  if (select count(*) from public.buddy_reports where reporter=viewer_id
      and source_table is not null) <> 3 then
    raise exception 'structured reports were not retained';
  end if;
  if (select moderation_state from public.posts where id=report_post_id) <> 'visible'
     or (select moderation_state from public.post_comments where id=report_comment_id) <> 'visible'
     or (select moderation_state from public.stories where id=report_story_id) <> 'visible' then
    raise exception 'manual report quarantined content before AI confirmation';
  end if;
  if not exists (select 1 from net.http_request_queue
    where convert_from(body, 'utf8')::jsonb @> jsonb_build_object('table','posts','id',report_post_id,
      'reason','manual_report','report_id',structured_report_id)) then
    raise exception 'priority manual moderation payload was not queued';
  end if;
  select count(*) into n from net.http_request_queue
   where convert_from(body, 'utf8')::jsonb ->> 'report_id' = structured_report_id::text;
  if n <> 1 then raise exception 'duplicate report queued % moderation jobs', n; end if;

  -- Unsafe URL and missing secret each skip pg_net without losing the report.
  update public.internal_config set value='https://evil.example/functions/v1/moderate-content'
   where key='moderation_url';
  set local role authenticated;
  perform public.report_content('posts', unsafe_url_post_id, 'unsafe url');
  reset role;
  update public.internal_config
     set value = case key
       when 'moderation_url' then 'http://127.0.0.1:1/functions/v1/moderate-content'
       when 'moderation_secret' then '' end
   where key in ('moderation_url', 'moderation_secret');
  set local role authenticated;
  perform public.report_content('posts', missing_secret_post_id, 'missing secret');
  reset role;
  if (select count(*) from public.buddy_reports where reporter=viewer_id
      and source_id in (unsafe_url_post_id, missing_secret_post_id)) <> 2 then
    raise exception 'invalid enqueue config rolled back a report';
  end if;
  if exists (select 1 from net.http_request_queue
    where convert_from(body, 'utf8')::jsonb ->> 'id'
      in (unsafe_url_post_id::text, missing_secret_post_id::text)) then
    raise exception 'unsafe or secretless configuration queued moderation';
  end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  begin
    perform public.report_content('posts', report_post_id, 'self report');
    raise exception 'self report was accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform public.quarantine_moderated_content('posts', report_post_id, array['hate'], .99, 'confirmed later');
  if not exists (select 1 from public.buddy_reports where id=structured_report_id)
     or (select moderation_state from public.posts where id=report_post_id) <> 'quarantined' then
    raise exception 'later confirmed quarantine did not retain the original report';
  end if;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  set local role authenticated;
  begin
    perform public.report_content('posts', report_post_id, 'already quarantined');
    raise exception 'quarantined content accepted a new report';
  exception when insufficient_privilege then null;
  end;
  reset role;

  begin
    perform public.quarantine_moderated_content('buddy_messages', post_id, array['x'], .9, 'bad');
    raise exception 'unsupported source_table was accepted';
  exception when invalid_parameter_value then null;
  end;

  perform public.quarantine_moderated_content('post_comments', comment_id, array['harassment'], .8, 'bad comment');
  perform public.quarantine_moderated_content('stories', story_id, array['violence'], .7, 'bad story');
  perform public.quarantine_moderated_content('posts', post_id, array['hate'], .95, 'bad post');
  perform public.quarantine_moderated_content('posts', post_id, array['hate','violence'], .99, 'updated excerpt');
  perform public.quarantine_moderated_content('posts', review_post_id, array['hate'], .8, 'review post');
  perform public.quarantine_moderated_content('post_comments', review_comment_id, array['harassment'], .8, 'review comment');
  perform public.quarantine_moderated_content('stories', review_story_id, array['violence'], .8, 'review story');
  perform public.quarantine_moderated_content('posts', stale_post_id, array['hate'], .8, 'stale post');

  select id into post_flag_id from public.moderation_flags
   where source_table='posts' and source_id=review_post_id and status='open';
  select id into comment_flag_id from public.moderation_flags
   where source_table='post_comments' and source_id=review_comment_id and status='open';
  select id into story_flag_id from public.moderation_flags
   where source_table='stories' and source_id=review_story_id and status='open';
  select id into stale_flag_id from public.moderation_flags
   where source_table='posts' and source_id=stale_post_id and status='open';

  insert into public.admins(user_id) values(reviewer_id);
  review_result := public.review_quarantined_content(comment_flag_id, 'approve', reviewer_id, null, null);
  if review_result->>'status' <> 'approved'
     or (select moderation_state from public.post_comments where id=review_comment_id) <> 'visible'
     or not exists (select 1 from public.moderation_flags where id=comment_flag_id
                    and status='approved' and reviewed_by=reviewer_id and reviewed_at is not null) then
    raise exception 'comment approval did not restore content';
  end if;
  if not (public.review_quarantined_content(comment_flag_id, 'approve', reviewer_id, null, null)->>'idempotent')::boolean
     or public.review_quarantined_content(comment_flag_id, 'remove', reviewer_id, null, null)->>'status' <> 'approved'
     or not exists (select 1 from public.post_comments where id=review_comment_id) then
    raise exception 'approved decision retry/conflict was not an idempotent no-op';
  end if;

  review_result := public.review_quarantined_content(story_flag_id, 'remove', reviewer_id, 'violence', 'Story removed');
  if review_result->>'status' <> 'removed' or exists (select 1 from public.stories where id=review_story_id)
     or not exists (select 1 from public.moderation_flags where id=story_flag_id
                    and status='removed' and reviewed_by=reviewer_id and reviewed_at is not null) then
    raise exception 'story removal did not delete content';
  end if;
  review_result := public.review_quarantined_content(story_flag_id, 'remove', reviewer_id, 'violence', 'Story removed');
  if not (review_result->>'idempotent')::boolean
     or (select strike_count from public.profiles where id=owner_id) <> 1
     or (select count(*) from public.user_sanctions where user_id=owner_id and action='remove') <> 1 then
    raise exception 'repeated removal added more than one strike/sanction';
  end if;
  if public.review_quarantined_content(story_flag_id, 'approve', reviewer_id, null, null)->>'status' <> 'removed'
     or exists (select 1 from public.stories where id=review_story_id) then
    raise exception 'removed decision was reversed by conflicting approval';
  end if;

  begin
    perform public.review_quarantined_content(post_flag_id, 'approve', viewer_id, null, null);
    raise exception 'non-admin reviewed quarantined content';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_quarantined_content(post_flag_id, 'invalid', reviewer_id, null, null);
    raise exception 'invalid review decision was accepted';
  exception when invalid_parameter_value then null;
  end;
  review_result := public.review_quarantined_content(post_flag_id, 'approve', reviewer_id, null, null);
  if review_result->>'status' <> 'approved'
     or (select moderation_state from public.posts where id=review_post_id) <> 'visible' then
    raise exception 'post approval did not restore content';
  end if;
  delete from public.posts where id=stale_post_id;
  begin
    perform public.review_quarantined_content(stale_flag_id, 'remove', reviewer_id, null, null);
    raise exception 'stale source was sanctioned';
  exception when no_data_found then null;
  end;
  if (select strike_count from public.profiles where id=owner_id) <> 1 then
    raise exception 'stale source changed strike count';
  end if;

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

  -- Stub the isolated enqueue boundary to prove a synchronous exception cannot
  -- roll back the already-accepted report. The outer transaction restores it.
  execute $ddl$
    create or replace function public.enqueue_manual_moderation(
      p_source_table text, p_source_id uuid, p_report_id uuid
    )
    returns boolean language plpgsql security definer set search_path = public
    as $stub$ begin raise exception 'forced synchronous enqueue failure'; end $stub$
  $ddl$;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  set local role authenticated;
  perform public.report_content('posts', sync_failure_post_id, 'sync failure');
  reset role;
  if not exists (select 1 from public.buddy_reports
    where reporter=viewer_id and source_table='posts' and source_id=sync_failure_post_id) then
    raise exception 'synchronous enqueue failure rolled back the report';
  end if;

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
