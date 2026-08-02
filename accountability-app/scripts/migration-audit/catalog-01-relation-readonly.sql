begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'relation' as category,
       n.nspname || '.' || c.relname as object_key,
       jsonb_build_object(
         'kind', c.relkind,
         'owner', pg_get_userbyid(c.relowner),
         'partition', c.relispartition,
         'partition_key', pg_get_partkeydef(c.oid),
         'rls', c.relrowsecurity,
         'force_rls', c.relforcerowsecurity,
         'acl', c.relacl
       ) as definition
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'storage')
   and c.relkind in ('r', 'p', 'v', 'm', 'S')
order by object_key;

rollback;
