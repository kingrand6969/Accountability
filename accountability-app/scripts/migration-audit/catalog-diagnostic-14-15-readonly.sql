begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select category, object_key, definition
  from (
(
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
 order by object_key
)
union all
(
select 'table_grant' as category,
       table_schema || '.' || table_name || '.' || grantee || '.' || privilege_type as object_key,
       jsonb_build_object('grantor', grantor, 'grantable', is_grantable) as definition
  from information_schema.role_table_grants
 where table_schema in ('public', 'storage')
 order by object_key
)
       ) as catalog_rows
 order by case category
           when 'trigger' then 14
           when 'table_grant' then 15
           else 20
          end,
          object_key;

rollback;
