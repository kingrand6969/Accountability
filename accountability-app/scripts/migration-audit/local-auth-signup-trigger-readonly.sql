begin read only;
set local statement_timeout = '3s';
set local lock_timeout = '1s';

select 'auth_signup_trigger' as category,
       'auth.users.on_auth_user_created' as object_key,
       jsonb_build_object(
         'enabled', t.tgenabled::text,
         'function', pn.nspname || '.' || p.proname,
         'definition_sha256', encode(digest(pg_get_triggerdef(t.oid, true), 'sha256'), 'hex')
       ) as definition
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
 where n.nspname = 'auth'
   and c.relname = 'users'
   and t.tgname = 'on_auth_user_created'
   and not t.tgisinternal;

rollback;
