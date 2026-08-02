begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'extension' as category,
       e.extname as object_key,
       jsonb_build_object('version', e.extversion, 'schema', n.nspname) as definition
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
 order by object_key;

rollback;
