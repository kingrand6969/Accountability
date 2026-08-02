begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select category, object_key, definition
  from (
(
select 'column_privilege' as category,
       n.nspname || '.' || c.relname || '.' || a.attname || '.' ||
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end ||
       '.' || x.privilege_type as object_key,
       jsonb_build_object('grantor', pg_get_userbyid(x.grantor), 'grantable', x.is_grantable) as definition
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 cross join lateral aclexplode(a.attacl) x
 where n.nspname in ('public', 'storage')
   and a.attnum > 0 and not a.attisdropped
 order by object_key
)
union all
(
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
order by object_key
)
       ) as catalog_rows
 order by case category
           when 'column_privilege' then 4
           when 'constraint' then 5
           else 20
          end,
          object_key;

rollback;
