begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '10s';

select 'auth_signup_trigger' as category,
       'auth.users.on_auth_user_created' as object_key,
       jsonb_build_object(
         'enabled', trigger_row.tgenabled::text,
         'function', 'public.handle_new_user',
         'definition_sha256', encode(digest(pg_get_triggerdef(trigger_row.oid, true), 'sha256'), 'hex')
       ) as definition
  from pg_catalog.pg_trigger as trigger_row
  join pg_catalog.pg_class as relation_row on relation_row.oid = trigger_row.tgrelid
  join pg_catalog.pg_namespace as relation_namespace on relation_namespace.oid = relation_row.relnamespace
  join pg_catalog.pg_proc as function_row on function_row.oid = trigger_row.tgfoid
  join pg_catalog.pg_namespace as function_namespace on function_namespace.oid = function_row.pronamespace
 where relation_namespace.nspname = 'auth'
   and relation_row.relname = 'users'
   and trigger_row.tgname = 'on_auth_user_created'
   and function_namespace.nspname = 'public'
   and function_row.proname = 'handle_new_user'
   and not trigger_row.tgisinternal;

rollback;
