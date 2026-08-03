begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select category, object_key, definition
  from (
(
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
order by object_key
)
union all
(
select 'relation_privilege' as category,
       n.nspname || '.' || c.relname || '.' ||
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end ||
       '.' || x.privilege_type as object_key,
       jsonb_build_object(
         'grantor', pg_get_userbyid(x.grantor),
         'grantable', x.is_grantable,
         'relation_kind', c.relkind
       ) as definition
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 'S'::"char" else 'r'::"char" end, c.relowner))) x
 where n.nspname in ('public', 'storage')
   and c.relkind in ('r', 'p', 'v', 'm', 'S')
 order by object_key
)
union all
(
select 'column' as category,
       table_schema || '.' || table_name || '.' || column_name as object_key,
       jsonb_build_object(
         'ordinal', ordinal_position,
         'data_type', data_type,
         'udt_schema', udt_schema,
         'udt_name', udt_name,
         'nullable', is_nullable,
         'default', column_default,
         'identity', is_identity,
         'identity_generation', identity_generation,
         'generated', is_generated,
         'generation_expression', generation_expression,
         'collation_schema', collation_schema,
         'collation_name', collation_name
       ) as definition
  from information_schema.columns
 where table_schema in ('public', 'storage')
order by object_key
)
       ) as catalog_rows
 order by case category
           when 'relation' then 1
           when 'relation_privilege' then 2
           when 'column' then 3
           else 20
          end,
          object_key;

rollback;
