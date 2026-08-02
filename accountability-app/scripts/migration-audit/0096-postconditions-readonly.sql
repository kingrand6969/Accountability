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
  select conname
    from pg_constraint
   where connamespace = 'public'::regnamespace
     and conname in (
       'posts_moderation_state_check',
       'post_comments_moderation_state_check',
       'stories_moderation_state_check',
       'buddy_reports_source_check',
       'buddy_reports_resolution_outcome_check',
       'moderation_flags_status_check',
       'moderation_flags_check_status_check'
     )
), required_indexes as (
  select indexname
    from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'moderation_flags_open_source_idx',
       'moderation_flags_source_history_idx',
       'buddy_reports_open_structured_idx'
     )
), routines as (
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) arguments,
         pg_get_functiondef(p.oid) definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'quarantine_moderated_content', 'review_quarantined_content',
       'report_content', 'enqueue_manual_moderation',
       'admin_resolve_report', 'remove_reported_post',
       'admin_list_reports', 'admin_list_flags',
       'create_public_post_share', 'get_public_share',
       'resolve_public_share_post'
     )
), queue_contract as (
  select
    count(*) filter (where proname = 'admin_list_reports'
      and definition like '%resolution_outcome%'
      and definition like '%ai_check_status%'
      and definition like '%content_moderation_state%') = 1 as reports_projection,
    count(*) filter (where proname = 'admin_list_flags'
      and definition like '%check_status%'
      and definition like '%quarantine_reason%'
      and definition like '%content_moderation_state%') = 1 as flags_projection
  from routines
), report_contract as (
  select
    count(*) filter (where proname = 'report_content'
      and definition like '%Unsupported report source%'
      and definition not like '%buddy_messages%') = 1 as structured_sources_only,
    count(*) filter (where proname = 'review_quarantined_content'
      and definition like '%status=''approved''%'
      and definition like '%status=''removed''%'
      and definition like '%resolution_outcome%') = 1 as decision_status_outcome,
    count(*) filter (where proname = 'admin_resolve_report'
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
select
  (select count(*) = 8 from moderation_columns) as moderation_columns_present,
  (select count(*) = 7 from required_constraints) as moderation_constraints_present,
  (select count(*) = 3 from required_indexes) as queue_indexes_present,
  queue_contract.reports_projection,
  queue_contract.flags_projection,
  report_contract.structured_sources_only as no_private_messages_source,
  report_contract.decision_status_outcome,
  report_contract.manual_resolution_outcome,
  share_contract.quarantined_shares_blocked,
  privilege_contract.report_privileges,
  privilege_contract.quarantine_service_only as no_client_quarantine_mutation,
  privilege_contract.review_service_only as no_client_review_mutation
from queue_contract, report_contract, share_contract, privilege_contract;

rollback;
