begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'constraint' as category,
       n.nspname || '.' || c.relname || '.' || con.conname as object_key,
       jsonb_build_object(
         'type', con.contype,
         'definition', pg_get_constraintdef(con.oid, true),
         'validated', con.convalidated,
         'deferrable', con.condeferrable,
         'deferred', con.condeferred
       ) as definition
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'storage')
order by object_key;

rollback;
