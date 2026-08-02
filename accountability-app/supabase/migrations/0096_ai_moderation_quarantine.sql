-- 0096: atomic, service-only quarantine for AI-moderated user content.

alter table public.posts add column if not exists moderation_state text not null default 'visible';
alter table public.post_comments add column if not exists moderation_state text not null default 'visible';
alter table public.stories add column if not exists moderation_state text not null default 'visible';

alter table public.buddy_reports
  add column if not exists source_table text,
  add column if not exists source_id uuid,
  add column if not exists resolution_outcome text;

do $report_outcome_constraint$
begin
  if not exists (select 1 from pg_constraint
    where conrelid='public.buddy_reports'::regclass
      and conname='buddy_reports_resolution_outcome_check') then
    alter table public.buddy_reports add constraint buddy_reports_resolution_outcome_check
      check (resolution_outcome in ('allowed','removed'));
  end if;
end
$report_outcome_constraint$;

do $report_constraint$
begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.buddy_reports'::regclass
      and conname = 'buddy_reports_source_check') then
    alter table public.buddy_reports add constraint buddy_reports_source_check check (
      (source_table is null and source_id is null)
      or (source_table in ('posts', 'post_comments', 'stories') and source_id is not null)
    );
  end if;
end
$report_constraint$;

-- Direct inserts remain available for legacy profile/message/voice reports, but
-- only the definer RPC may attach structured content coordinates.
drop policy if exists "File own reports" on public.buddy_reports;
create policy "File own reports" on public.buddy_reports
  for insert to authenticated
  with check (
    auth.uid() = reporter and source_table is null and source_id is null
  );

create or replace function public.admin_resolve_report(
  p_report uuid, p_resolve boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_source_table text;
  v_source_id uuid;
  v_report public.buddy_reports%rowtype;
begin
  perform admin_assert();
  select source_table,source_id into v_source_table,v_source_id
    from public.buddy_reports where id=p_report;
  if not found then
    raise exception 'Report not found' using errcode='P0002';
  end if;
  if v_source_table is not null then
    if v_source_id is null or v_source_table not in ('posts','post_comments','stories') then
      raise exception 'Invalid structured report source' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'moderation-source:'||v_source_table||':'||v_source_id::text,0
    ));
  end if;
  select * into v_report from public.buddy_reports where id=p_report for update;
  if not found or v_report.source_table is distinct from v_source_table
     or v_report.source_id is distinct from v_source_id then
    raise exception 'Report changed during resolution' using errcode='40001';
  end if;
  if v_report.resolution_outcome='removed' then
    raise exception 'Removed report resolution is final' using errcode='22023';
  end if;
  update public.buddy_reports
     set resolved_at = case when p_resolve then now() else null end,
         resolved_by = case when p_resolve then auth.uid() else null end,
         resolution_outcome = case when p_resolve then 'allowed' else null end
   where id = p_report;
end
$function$;
revoke all on function public.admin_resolve_report(uuid, boolean) from public, anon;
grant execute on function public.admin_resolve_report(uuid, boolean) to authenticated;

-- Serialize buddy report admission and its count in one trigger invocation.
-- Other rate-limited tables retain the generic 0056 behavior unchanged.
create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  cfg public.rate_limits%rowtype;
  n int;
  uid uuid := auth.uid();
begin
  if tg_table_name = 'buddy_reports' then
    perform pg_advisory_xact_lock(
      hashtextextended('report_content:' || new.reporter::text, 0)
    );
  end if;

  if uid is null then
    return new;
  end if;
  select * into cfg from public.rate_limits where tbl = tg_table_name;
  if not found then
    return new;
  end if;
  execute format(
    'select count(*) from public.%I where %I = $1 and created_at > now() - make_interval(secs => $2)',
    tg_table_name, cfg.owner_col
  ) into n using uid, cfg.window_secs;
  if n >= cfg.max_rows then
    raise exception 'Too many actions in a short time — please slow down and try again shortly.'
      using errcode = '54000';
  end if;
  return new;
end
$function$;

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

-- 0063 introduced `removed`; administrator review adds the explicit positive
-- outcome without collapsing older actioned/dismissed audit history.
alter table public.moderation_flags drop constraint if exists moderation_flags_status_check;
alter table public.moderation_flags
  add constraint moderation_flags_status_check
  check (status in ('open', 'approved', 'actioned', 'dismissed', 'removed'));

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

-- Keep this transaction deliberately narrow: source-table DDL is complete and
-- no source-table policy/function work begins until after COMMIT. Ordinary
-- callbacks take ROW EXCLUSIVE for INSERT/UPDATE; SHARE is the least mode that
-- blocks those writes and is compatible with CREATE INDEX's own SHARE lock.
begin;
lock table public.moderation_flags in share mode;
lock table public.buddy_reports in share mode;

-- Older callbacks could create multiple open rows for the same source. Keep the
-- newest row as the canonical review item, merge useful evidence into it, and
-- preserve every other row as dismissed audit history before enforcing
-- uniqueness.
with duplicate_sources as (
  select source_table, source_id
    from public.moderation_flags
   where status = 'open'
   group by source_table, source_id
  having count(*) > 1
), canonical as (
  select ds.source_table, ds.source_id,
         (select f.id from public.moderation_flags f
           where f.source_table = ds.source_table and f.source_id = ds.source_id
             and f.status = 'open'
           order by f.created_at desc, f.id desc limit 1) as keep_id,
         (select f.excerpt from public.moderation_flags f
           where f.source_table = ds.source_table and f.source_id = ds.source_id
             and f.status = 'open' and f.excerpt is not null
           order by f.created_at desc, f.id desc limit 1) as excerpt,
         (select f.image_url from public.moderation_flags f
           where f.source_table = ds.source_table and f.source_id = ds.source_id
             and f.status = 'open' and f.image_url is not null
           order by f.created_at desc, f.id desc limit 1) as image_url,
         (select max(f.max_score) from public.moderation_flags f
           where f.source_table = ds.source_table and f.source_id = ds.source_id
             and f.status = 'open') as max_score,
         (select coalesce(array_agg(distinct category order by category), '{}')
            from public.moderation_flags f
            cross join lateral unnest(f.categories) category
           where f.source_table = ds.source_table and f.source_id = ds.source_id
             and f.status = 'open') as categories
    from duplicate_sources ds
), merged as (
  update public.moderation_flags f
     set excerpt = coalesce(c.excerpt, f.excerpt),
         image_url = coalesce(c.image_url, f.image_url),
         max_score = coalesce(c.max_score, f.max_score),
         categories = c.categories
    from canonical c
   where f.id = c.keep_id
  returning f.id
)
update public.moderation_flags f
   set status = 'dismissed', reviewed_at = coalesce(f.reviewed_at, now())
  from canonical c
 where f.source_table = c.source_table and f.source_id = c.source_id
   and f.status = 'open' and f.id <> c.keep_id;

create unique index if not exists moderation_flags_open_source_idx
  on public.moderation_flags(source_table, source_id)
  where status = 'open';

-- Supports the report queue's "open flag first, otherwise newest history"
-- lookup for one allowlisted source. The partial unique index above continues
-- to enforce one open flag; this general index serves final-state history too.
-- Representative lookup shape:
--   where source_table=$1 and source_id=$2
--   order by (status='open') desc, created_at desc, id desc limit 1
create index if not exists moderation_flags_source_history_idx
  on public.moderation_flags(source_table, source_id, created_at desc, id desc);

-- Preserve duplicate report history while closing every older unresolved copy.
with ranked_reports as (
  select id, row_number() over (
    partition by reporter, source_table, source_id
    order by created_at desc, id desc
  ) as position
  from public.buddy_reports
  where source_table is not null and resolved_at is null
)
update public.buddy_reports r
   set resolved_at = now()
  from ranked_reports d
 where r.id = d.id and d.position > 1;

create unique index if not exists buddy_reports_open_structured_idx
  on public.buddy_reports(reporter, source_table, source_id)
  where source_table is not null and resolved_at is null;

commit;

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

  perform pg_advisory_xact_lock(hashtextextended(
    'moderation-source:' || p_source_table || ':' || p_source_id::text, 0
  ));

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
    (source_table, source_id, author_id, excerpt, categories, max_score,
     quarantine_reason, check_status, status)
  values
    (p_source_table, p_source_id, v_author_id, left(p_excerpt, 500),
     coalesce(p_categories, '{}'::text[]), p_max_score,
     left(p_excerpt, 500), 'confirmed', 'open')
  on conflict (source_table, source_id) where status = 'open'
  do update set
    author_id = excluded.author_id,
    excerpt = excluded.excerpt,
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

-- Complete a human quarantine decision as one transaction.  The Edge Function
-- supplies the already-authenticated actor, but this function independently
-- verifies that identity against admins before exercising service authority.
create or replace function public.review_quarantined_content(
  p_flag uuid,
  p_decision text,
  p_admin_actor uuid,
  p_reason text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_flag public.moderation_flags%rowtype;
  v_discovered_table text;
  v_discovered_id uuid;
  v_state text;
  v_strikes integer := 0;
begin
  if p_flag is null or p_admin_actor is null then
    raise exception 'flag and administrator are required' using errcode = '22023';
  end if;
  if p_decision not in ('approve', 'remove') then
    raise exception 'Unsupported review decision' using errcode = '22023';
  end if;
  if not exists (select 1 from public.admins where user_id = p_admin_actor) then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;

  select source_table, source_id into v_discovered_table, v_discovered_id
    from public.moderation_flags where id = p_flag;
  if not found then
    raise exception 'Moderation flag not found' using errcode = 'P0002';
  end if;
  if v_discovered_table not in ('posts', 'post_comments', 'stories') then
    raise exception 'Unsupported moderation source' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'moderation-source:' || v_discovered_table || ':' || v_discovered_id::text, 0
  ));
  select * into v_flag from public.moderation_flags where id = p_flag for update;
  if not found or v_flag.source_table is distinct from v_discovered_table
     or v_flag.source_id is distinct from v_discovered_id then
    raise exception 'Moderation flag changed during review' using errcode = '40001';
  end if;

  -- A retry (including a conflicting retry) observes and preserves the first
  -- committed final decision. It never re-deletes, re-warns, or re-strikes.
  if v_flag.status <> 'open' then
    return jsonb_build_object(
      'ok', true, 'status', v_flag.status, 'idempotent', true,
      'strikes', coalesce((select strike_count from public.profiles where id=v_flag.author_id), 0)
    );
  end if;

  execute format('select moderation_state from public.%I where id=$1 for update', v_flag.source_table)
    into v_state using v_flag.source_id;
  if v_state is distinct from 'quarantined' then
    raise exception 'Quarantined source not found' using errcode = 'P0002';
  end if;

  if p_decision = 'approve' then
    execute format('update public.%I set moderation_state=''visible'' where id=$1', v_flag.source_table)
      using v_flag.source_id;
    update public.moderation_flags
       set status='approved', reviewed_at=now(), reviewed_by=p_admin_actor
     where id=p_flag;
  else
    if v_flag.author_id = p_admin_actor then
      raise exception 'Administrators cannot sanction themselves' using errcode = '42501';
    end if;
    execute format('delete from public.%I where id=$1', v_flag.source_table) using v_flag.source_id;
    if v_flag.author_id is not null then
      update public.profiles
         set strike_count=strike_count+1,
             warning_message=nullif(left(coalesce(p_message, ''), 2000), ''),
             warned_at=now(), warning_ack_at=null
       where id=v_flag.author_id
       returning strike_count into v_strikes;
      if not found then
        raise exception 'Content author profile not found' using errcode = 'P0002';
      end if;
      insert into public.user_sanctions(user_id, admin_id, action, reason, message)
      values (v_flag.author_id, p_admin_actor, 'remove',
              nullif(left(trim(coalesce(p_reason, '')), 500), ''),
              nullif(left(coalesce(p_message, ''), 2000), ''));
    end if;
    update public.moderation_flags
       set status='removed', reviewed_at=now(), reviewed_by=p_admin_actor
     where id=p_flag;
  end if;

  update public.buddy_reports
     set resolved_at=coalesce(resolved_at, now()),
         resolved_by=coalesce(resolved_by, p_admin_actor),
         resolution_outcome=case when p_decision='approve' then 'allowed' else 'removed' end
   where source_table=v_flag.source_table and source_id=v_flag.source_id and resolved_at is null;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_decision='approve' then 'approved' else 'removed' end,
    'idempotent', false,
    'strikes', v_strikes
  );
end
$function$;

revoke all on function public.review_quarantined_content(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_quarantined_content(uuid, text, uuid, text, text)
  to service_role;

drop function if exists public.review_quarantined_content(uuid, text);

create or replace function public.remove_reported_post(
  p_report uuid,
  p_admin_actor uuid,
  p_post_hint uuid,
  p_author_hint uuid,
  p_reason text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_report public.buddy_reports%rowtype;
  v_locked_report public.buddy_reports%rowtype;
  v_post_id uuid;
  v_author_id uuid;
  v_post_author uuid;
  v_strikes integer := 0;
  v_legacy_match text[];
begin
  if p_report is null or p_admin_actor is null then
    raise exception 'report and administrator are required' using errcode='22023';
  end if;
  if not exists (select 1 from public.admins where user_id=p_admin_actor) then
    raise exception 'Administrator privileges required' using errcode='42501';
  end if;

  select * into v_report from public.buddy_reports where id=p_report;
  if not found then raise exception 'Report not found' using errcode='P0002'; end if;
  if v_report.source_table is not null then
    if v_report.source_table <> 'posts' or v_report.source_id is null then
      raise exception 'Report is not for a post' using errcode='22023';
    end if;
    v_post_id := v_report.source_id;
  else
    if regexp_count(v_report.reason,
      '\(post [0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\)') <> 1 then
      raise exception 'Legacy report has no unique valid post reference' using errcode='22023';
    end if;
    v_legacy_match := regexp_match(v_report.reason,
      '\(post ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})\)');
    if v_legacy_match is null then
      raise exception 'Legacy report has no valid post reference' using errcode='22023';
    end if;
    v_post_id := v_legacy_match[1]::uuid;
  end if;
  v_author_id := v_report.reported;
  if p_post_hint is not null and p_post_hint <> v_post_id then
    raise exception 'Post does not match report' using errcode='22023';
  end if;
  if p_author_hint is not null and p_author_hint <> v_author_id then
    raise exception 'Author does not match report' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'moderation-source:posts:' || v_post_id::text, 0
  ));
  select * into v_locked_report from public.buddy_reports where id=p_report for update;
  if not found or v_locked_report.source_table is distinct from v_report.source_table
     or v_locked_report.source_id is distinct from v_report.source_id
     or v_locked_report.reported is distinct from v_report.reported
     or v_locked_report.reason is distinct from v_report.reason then
    raise exception 'Report changed during review' using errcode='40001';
  end if;
  if v_locked_report.resolved_at is not null then
    if v_locked_report.resolution_outcome = 'removed' then
      return jsonb_build_object('ok',true,'status','removed','idempotent',true,
        'strikes',coalesce((select strike_count from public.profiles where id=v_author_id),0));
    end if;
    raise exception 'Report was resolved without removal' using errcode='22023';
  end if;
  if v_author_id = p_admin_actor then
    raise exception 'Administrators cannot sanction themselves' using errcode='42501';
  end if;

  select user_id into v_post_author from public.posts where id=v_post_id for update;
  if v_post_author is distinct from v_author_id then
    raise exception 'Reported post or author not found' using errcode='P0002';
  end if;
  delete from public.posts where id=v_post_id;
  update public.profiles set strike_count=strike_count+1,
      warning_message=nullif(left(coalesce(p_message,''),2000),''),
      warned_at=now(), warning_ack_at=null
    where id=v_author_id returning strike_count into v_strikes;
  if not found then raise exception 'Content author profile not found' using errcode='P0002'; end if;
  insert into public.user_sanctions(user_id,admin_id,action,reason,message)
  values(v_author_id,p_admin_actor,'remove',nullif(left(trim(coalesce(p_reason,'')),500),''),
         nullif(left(coalesce(p_message,''),2000),''));
  update public.buddy_reports
     set resolved_at=now(), resolved_by=p_admin_actor, resolution_outcome='removed'
   where (id=p_report or (source_table='posts' and source_id=v_post_id)) and resolved_at is null;
  update public.moderation_flags set status='removed',reviewed_at=now(),reviewed_by=p_admin_actor
   where source_table='posts' and source_id=v_post_id and status='open';
  return jsonb_build_object('ok',true,'status','removed','idempotent',false,'strikes',v_strikes);
end
$function$;
revoke all on function public.remove_reported_post(uuid,uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.remove_reported_post(uuid,uuid,uuid,uuid,text,text) to service_role;

create or replace function public.admin_list_reports(
  p_open_only boolean default false, p_limit int default 100
)
returns json language plpgsql stable security definer set search_path=public as $function$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)),'[]'::json) into result from (
    select r.id,r.reason,r.created_at,r.resolved_at,
           r.reporter,rp.display_name as reporter_name,
           r.reported,rd.display_name as reported_name,
           coalesce(rd.strike_count,0) as reported_strikes,
           r.source_table,r.source_id,r.resolution_outcome,
           af.id as ai_flag_id,af.check_status as ai_check_status,
           af.categories as ai_categories,af.max_score as ai_max_score,
           coalesce(cs.moderation_state,
             case when af.status='removed' then 'removed'
                  when r.source_table is not null then 'missing' end) as content_moderation_state
      from public.buddy_reports r
      left join public.profiles rp on rp.id=r.reporter
      left join public.profiles rd on rd.id=r.reported
      left join lateral (
        select f.id,f.check_status,f.categories,f.max_score,f.status
          from public.moderation_flags f
         where f.source_table=r.source_table and f.source_id=r.source_id
         order by (f.status='open') desc,f.created_at desc,f.id desc limit 1
      ) af on r.source_table is not null
      left join lateral (
        select p.moderation_state from public.posts p
         where r.source_table='posts' and p.id=r.source_id
        union all
        select c.moderation_state from public.post_comments c
         where r.source_table='post_comments' and c.id=r.source_id
        union all
        select s.moderation_state from public.stories s
         where r.source_table='stories' and s.id=r.source_id
      ) cs on true
     where (not p_open_only) or r.resolved_at is null
     order by (r.resolved_at is null) desc,r.created_at desc
     limit greatest(1,least(coalesce(p_limit,100),300))
  ) t;
  return result;
end
$function$;
revoke all on function public.admin_list_reports(boolean,int) from public,anon;
grant execute on function public.admin_list_reports(boolean,int) to authenticated;

create or replace function public.admin_list_flags(
  p_open_only boolean default true, p_limit int default 100
)
returns json language plpgsql stable security definer set search_path=public as $function$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)),'[]'::json) into result from (
    select f.id,f.source_table,f.source_id,f.excerpt,f.image_url,f.categories,f.max_score,
           f.status,f.created_at,f.author_id,p.display_name as author_name,
           coalesce(p.strike_count,0) as author_strikes,
           f.check_status,f.quarantine_reason,
           coalesce(cs.moderation_state,
             case when f.status='removed' then 'removed' else 'missing' end) as content_moderation_state
      from public.moderation_flags f
      left join public.profiles p on p.id=f.author_id
      left join lateral (
        select x.moderation_state from public.posts x
         where f.source_table='posts' and x.id=f.source_id
        union all
        select x.moderation_state from public.post_comments x
         where f.source_table='post_comments' and x.id=f.source_id
        union all
        select x.moderation_state from public.stories x
         where f.source_table='stories' and x.id=f.source_id
      ) cs on true
     where (not p_open_only) or f.status='open'
     order by (f.status='open') desc,f.created_at desc
     limit greatest(1,least(coalesce(p_limit,100),300))
  ) t;
  return result;
end
$function$;
revoke all on function public.admin_list_flags(boolean,int) from public,anon;
grant execute on function public.admin_list_flags(boolean,int) to authenticated;

create or replace function public.enqueue_manual_moderation(
  p_source_table text,
  p_source_id uuid,
  p_report_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_url text;
  v_secret text;
  v_request_host text;
  v_config_host text;
  v_allow_local boolean := false;
begin
  select value into v_url from public.internal_config where key = 'moderation_url';
  select value into v_secret from public.internal_config where key = 'moderation_secret';
  select value into v_config_host from public.internal_config where key = 'moderation_host';
  select coalesce(value = 'true', false) into v_allow_local
    from public.internal_config where key = 'moderation_allow_local';
  begin
    v_request_host := split_part(
      coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'host',
      ':', 1
    );
  exception when others then
    v_request_host := null;
  end;
  if v_request_host !~ '^[a-z0-9-]+\.supabase\.co$' then
    v_request_host := null;
  end if;
  v_config_host := lower(trim(coalesce(v_request_host, v_config_host, '')));

  if coalesce(v_secret, '') <> '' and (
    (v_config_host ~ '^[a-z0-9-]+\.supabase\.co$'
     and v_url = 'https://' || v_config_host || '/functions/v1/moderate-content')
    or (v_allow_local and v_url ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?/functions/v1/moderate-content$')
  ) then
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'table', p_source_table, 'id', p_source_id,
        'reason', 'manual_report', 'report_id', p_report_id
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-moderation-secret', v_secret
      )
    );
    return true;
  end if;
  return false;
exception when others then
  return false;
end
$function$;

revoke all on function public.enqueue_manual_moderation(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_manual_moderation(text, uuid, uuid)
  to service_role;

create or replace function public.report_content(
  p_source_table text,
  p_source_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_reporter_id uuid := auth.uid();
  v_author_id uuid;
  v_parent_post_id uuid;
  v_report_id uuid;
  v_reason text := nullif(left(trim(regexp_replace(coalesce(p_reason, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), 500), '');
begin
  if v_reporter_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('report_content:' || v_reporter_id::text, 0));
  if p_source_id is null or p_source_table not in ('posts', 'post_comments', 'stories') then
    raise exception 'Unsupported report source.' using errcode = '22023';
  end if;

  if p_source_table = 'posts' then
    select user_id into v_author_id from public.posts
     where id = p_source_id and moderation_state = 'visible'
       and public.can_view_post(id, v_reporter_id);
  elsif p_source_table = 'post_comments' then
    select user_id, post_id into v_author_id, v_parent_post_id
      from public.post_comments
     where id = p_source_id and moderation_state = 'visible';
    if found and not public.can_view_post(v_parent_post_id, v_reporter_id) then
      v_author_id := null;
    end if;
  else
    select user_id into v_author_id from public.stories
     where id = p_source_id and moderation_state = 'visible' and expires_at > now()
       and (user_id = v_reporter_id or (
         public.are_buddies(user_id, v_reporter_id)
         and not public.users_blocked(v_reporter_id, user_id)
       ));
  end if;

  if v_author_id is null then
    raise exception 'Content is unavailable.' using errcode = '42501';
  end if;
  if v_author_id = v_reporter_id then
    raise exception 'You cannot report your own content.' using errcode = '42501';
  end if;

  insert into public.buddy_reports(reporter, reported, reason, source_table, source_id)
  values (v_reporter_id, v_author_id, coalesce(v_reason, 'User reported content'),
          p_source_table, p_source_id)
  on conflict (reporter, source_table, source_id)
    where source_table is not null and resolved_at is null
  do nothing
  returning id into v_report_id;

  if v_report_id is null then
    select id into v_report_id from public.buddy_reports
     where reporter = v_reporter_id and source_table = p_source_table
       and source_id = p_source_id and resolved_at is null;
    return v_report_id;
  end if;
  begin
    perform public.enqueue_manual_moderation(p_source_table, p_source_id, v_report_id);
  exception when others then
    return v_report_id;
  end;

  return v_report_id;
end
$function$;

revoke all on function public.report_content(text, uuid, text) from public, anon;
grant execute on function public.report_content(text, uuid, text) to authenticated, service_role;

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

drop policy if exists "Users insert own posts" on public.posts;
drop policy if exists posts_insert_owner on public.posts;
create policy posts_insert_owner on public.posts for insert to authenticated
  with check (
    user_id = auth.uid() and moderation_state = 'visible' and (
      (group_id is null and page_id is null and audience in ('buddies', 'public'))
      or (group_id is not null and page_id is null and audience = 'group' and exists (
        select 1 from public.group_members gm
         where gm.group_id = posts.group_id and gm.user_id = auth.uid()
      ))
      or (page_id is not null and group_id is null and audience = 'public' and exists (
        select 1 from public.pages pg
         where pg.id = posts.page_id and pg.owner = auth.uid()
      ))
    )
  );

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
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert to authenticated
  with check (user_id = auth.uid() and moderation_state = 'visible');
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
