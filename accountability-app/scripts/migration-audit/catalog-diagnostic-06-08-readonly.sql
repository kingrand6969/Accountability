begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select category, object_key, definition
  from (
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
       ) as catalog_rows
 order by case category
           when 'routine_privilege' then 6
           when 'index' then 7
           when 'policy' then 8
           else 20
          end,
          object_key;

rollback;
