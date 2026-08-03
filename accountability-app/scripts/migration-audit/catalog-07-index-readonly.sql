begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'index' as category,
       n.nspname || '.' || t.relname || '.' || i.relname as object_key,
       jsonb_build_object(
         'definition', pg_get_indexdef(ix.indexrelid),
         'predicate', pg_get_expr(ix.indpred, ix.indrelid),
         'unique', ix.indisunique,
         'primary', ix.indisprimary,
         'valid', ix.indisvalid,
         'ready', ix.indisready
       ) as definition
  from pg_catalog.pg_index ix
  join pg_catalog.pg_class i on i.oid = ix.indexrelid
  join pg_catalog.pg_class t on t.oid = ix.indrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
 where n.nspname in ('public', 'storage')
 order by object_key;

rollback;
