begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'trigger' as category,
       n.nspname || '.' || c.relname || '.' || t.tgname as object_key,
       jsonb_build_object(
         'definition', pg_get_triggerdef(t.oid, true),
         'enabled', t.tgenabled,
         'function', pn.nspname || '.' || p.proname
       ) as definition
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
 where n.nspname in ('public', 'storage') and not t.tgisinternal
 order by object_key;

rollback;
