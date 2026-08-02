-- Read-only postconditions for migration 0096. Returns booleans and catalog
-- metadata only; it does not read user-authored content or mutate client state.
begin read only;

with moderation_columns as (
  select table_name, column_name
    from information_schema.columns
   where table_schema = 'public'
     and (table_name, column_name) in (
       ('posts', 'moderation_state'),
       ('post_comments', 'moderation_state'),
       ('stories', 'moderation_state'),
       ('buddy_reports', 'source_table'),
       ('buddy_reports', 'source_id'),
       ('buddy_reports', 'resolution_outcome'),
       ('moderation_flags', 'quarantine_reason'),
       ('moderation_flags', 'check_status')
     )
), required_constraints as (
  select c.conname
    from (values
      ('posts_moderation_state_check', 'public.posts'::regclass, 'moderation_state'),
      ('post_comments_moderation_state_check', 'public.post_comments'::regclass, 'moderation_state'),
      ('stories_moderation_state_check', 'public.stories'::regclass, 'moderation_state'),
      ('buddy_reports_source_check', 'public.buddy_reports'::regclass, 'source_table'),
      ('buddy_reports_resolution_outcome_check', 'public.buddy_reports'::regclass, 'resolution_outcome'),
      ('moderation_flags_status_check', 'public.moderation_flags'::regclass, 'status'),
      ('moderation_flags_check_status_check', 'public.moderation_flags'::regclass, 'check_status')
    ) expected(conname, conrelid, required_column)
    join pg_constraint c
      on c.conname = expected.conname
     and c.conrelid = expected.conrelid
     and c.connamespace = 'public'::regnamespace
     and c.contype = 'c'
     and c.convalidated
     and position(expected.required_column in regexp_replace(pg_get_constraintdef(c.oid), '\s+', '', 'g')) > 0
), required_indexes as (
  select index_class.relname as indexname
    from (values
      ('moderation_flags_open_source_idx', 'public.moderation_flags'::regclass, true,
       array['source_table','source_id']::text[], '(status=''open''::text)'),
      ('moderation_flags_source_history_idx', 'public.moderation_flags'::regclass, false,
       array['source_table','source_id','created_at','id']::text[], null::text),
      ('buddy_reports_open_structured_idx', 'public.buddy_reports'::regclass, true,
       array['reporter','source_table','source_id']::text[], '((source_tableISNOTNULL)AND(resolved_atISNULL))')
    ) expected(indexname, table_oid, is_unique, columns, predicate)
    join pg_class index_class on index_class.relname = expected.indexname
    join pg_namespace index_ns on index_ns.oid = index_class.relnamespace and index_ns.nspname = 'public'
    join pg_index i on i.indexrelid = index_class.oid and i.indrelid = expected.table_oid
   where i.indisvalid and i.indisready and i.indisunique = expected.is_unique
     and (select array_agg(a.attname::text order by keys.ordinality)
            from unnest(i.indkey::smallint[]) with ordinality keys(attnum, ordinality)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = keys.attnum)
         = expected.columns
     and case when expected.predicate is null then i.indpred is null
              else regexp_replace(pg_get_expr(i.indpred, i.indrelid), '\s+', '', 'g') = expected.predicate end
), routines as (
  select p.oid, p.proname, p.prosecdef as security_definer,
         pg_get_function_identity_arguments(p.oid) arguments,
         pg_get_functiondef(p.oid) definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid = any (array[
       to_regprocedure('public.quarantine_moderated_content(text,uuid,text[],numeric,text)'),
       to_regprocedure('public.review_quarantined_content(uuid,text,uuid,text,text)'),
       to_regprocedure('public.report_content(text,uuid,text)'),
       to_regprocedure('public.enqueue_manual_moderation(text,uuid,uuid)'),
       to_regprocedure('public.admin_resolve_report(uuid,boolean)'),
       to_regprocedure('public.remove_reported_post(uuid,uuid,uuid,uuid,text,text)'),
       to_regprocedure('public.admin_list_reports(boolean,integer)'),
       to_regprocedure('public.admin_list_flags(boolean,integer)'),
       to_regprocedure('public.create_public_post_share(uuid,text)'),
       to_regprocedure('public.get_public_share(uuid)'),
       to_regprocedure('public.resolve_public_share_post(uuid)')
     ]::oid[])
), queue_contract as (
  select
    count(*) filter (where proname = 'admin_list_reports' and security_definer
      and definition like '%resolution_outcome%'
      and definition like '%ai_check_status%'
      and definition like '%content_moderation_state%') = 1 as reports_projection,
    count(*) filter (where proname = 'admin_list_flags' and security_definer
      and definition like '%check_status%'
      and definition like '%quarantine_reason%'
      and definition like '%content_moderation_state%') = 1 as flags_projection
  from routines
), report_contract as (
  select
    count(*) filter (where proname = 'report_content' and security_definer
      and definition like '%Unsupported report source%'
      and definition not like '%buddy_messages%') = 1 as structured_sources_only,
    count(*) filter (where proname = 'review_quarantined_content' and security_definer
      and definition like '%status=''approved''%'
      and definition like '%status=''removed''%'
      and definition like '%resolution_outcome%') = 1 as decision_status_outcome,
    count(*) filter (where proname = 'admin_resolve_report' and security_definer
      and definition like '%resolution_outcome%') = 1 as manual_resolution_outcome
  from routines
), share_contract as (
  select count(*) = 3 as quarantined_shares_blocked
    from routines
   where proname in ('create_public_post_share', 'get_public_share', 'resolve_public_share_post')
     and definition like '%moderation_state%visible%'
), privilege_contract as (
  select
    not has_function_privilege('anon', 'public.report_content(text,uuid,text)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.report_content(text,uuid,text)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.report_content(text,uuid,text)', 'EXECUTE')
      as report_privileges,
    not has_function_privilege('anon', 'public.quarantine_moderated_content(text,uuid,text[],numeric,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.quarantine_moderated_content(text,uuid,text[],numeric,text)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.quarantine_moderated_content(text,uuid,text[],numeric,text)', 'EXECUTE')
      as quarantine_service_only,
    not has_function_privilege('anon', 'public.review_quarantined_content(uuid,text,uuid,text,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.review_quarantined_content(uuid,text,uuid,text,text)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.review_quarantined_content(uuid,text,uuid,text,text)', 'EXECUTE')
      as review_service_only
)
select 'moderation_postconditions' as category,
       '0096' as object_key,
       jsonb_build_object(
  'moderation_columns_present', (select count(*) = 8 from moderation_columns),
  'moderation_constraints_present', (select count(*) = 7 from required_constraints),
  'queue_indexes_present', (select count(*) = 3 from required_indexes),
  'reports_projection', queue_contract.reports_projection,
  'flags_projection', queue_contract.flags_projection,
  'no_private_messages_source', report_contract.structured_sources_only,
  'decision_status_outcome', report_contract.decision_status_outcome,
  'manual_resolution_outcome', report_contract.manual_resolution_outcome,
  'quarantined_shares_blocked', share_contract.quarantined_shares_blocked,
  'report_privileges', privilege_contract.report_privileges,
  'no_client_quarantine_mutation', privilege_contract.quarantine_service_only,
  'no_client_review_mutation', privilege_contract.review_service_only
       ) as definition
from queue_contract, report_contract, share_contract, privilege_contract;

rollback;
