begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'view' as category,
       schemaname || '.' || viewname as object_key,
       jsonb_build_object('owner', viewowner, 'definition', definition) as definition
  from pg_catalog.pg_views
 where schemaname in ('public', 'storage')
 order by object_key;

rollback;
