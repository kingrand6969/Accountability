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
union all
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
union all
(
select 'routine_privilege' as category,
       n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ').' ||
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end ||
       '.' || x.privilege_type as object_key,
       jsonb_build_object('grantor', pg_get_userbyid(x.grantor), 'grantable', x.is_grantable) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) x
 where n.nspname in ('public', 'storage')
 order by object_key
)
union all
(
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
 order by object_key
)
union all
(
select 'policy' as category,
       schemaname || '.' || tablename || '.' || policyname as object_key,
       jsonb_build_object(
         'permissive', permissive,
         'roles', roles,
         'command', cmd,
         'using', qual,
         'check', with_check
       ) as definition
  from pg_catalog.pg_policies
 where schemaname in ('public', 'storage')
 order by object_key
)
union all
(
select 'view' as category,
       schemaname || '.' || viewname as object_key,
       jsonb_build_object('owner', viewowner, 'definition', definition) as definition
  from pg_catalog.pg_views
 where schemaname in ('public', 'storage')
 order by object_key
)
union all
(
select 'materialized_view' as category,
       schemaname || '.' || matviewname as object_key,
       jsonb_build_object(
         'owner', matviewowner,
         'populated', ispopulated,
         'definition', definition
       ) as definition
  from pg_catalog.pg_matviews
 where schemaname in ('public', 'storage')
 order by object_key
)
       ) as catalog_rows
 order by case category
           when 'relation' then 1
           when 'relation_privilege' then 2
           when 'column' then 3
           when 'column_privilege' then 4
           when 'constraint' then 5
           when 'routine_privilege' then 6
           when 'index' then 7
           when 'policy' then 8
           when 'view' then 9
           when 'materialized_view' then 10
           else 20
          end,
          object_key;

rollback;
