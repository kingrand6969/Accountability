begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';

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
order by object_key;

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
 order by object_key;

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
order by object_key;

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
 order by object_key;

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

select 'routine_privilege' as category,
       n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ').' ||
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end ||
       '.' || x.privilege_type as object_key,
       jsonb_build_object('grantor', pg_get_userbyid(x.grantor), 'grantable', x.is_grantable) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) x
 where n.nspname in ('public', 'storage')
 order by object_key;

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
 order by object_key;

select 'view' as category,
       schemaname || '.' || viewname as object_key,
       jsonb_build_object('owner', viewowner, 'definition', definition) as definition
  from pg_catalog.pg_views
 where schemaname in ('public', 'storage')
 order by object_key;

select 'materialized_view' as category,
       schemaname || '.' || matviewname as object_key,
       jsonb_build_object(
         'owner', matviewowner,
         'populated', ispopulated,
         'definition', definition
       ) as definition
  from pg_catalog.pg_matviews
 where schemaname in ('public', 'storage')
 order by object_key;

select 'sequence' as category,
       schemaname || '.' || sequencename as object_key,
       jsonb_build_object(
         'owner', sequenceowner,
         'type', data_type,
         'start', start_value::text,
         'minimum', min_value::text,
         'maximum', max_value::text,
         'increment', increment_by::text,
         'cycle', cycle,
         'cache', cache_size::text
       ) as definition
  from pg_catalog.pg_sequences
 where schemaname in ('public', 'storage')
 order by object_key;

select 'type' as category,
       n.nspname || '.' || t.typname as object_key,
       jsonb_build_object(
         'kind', t.typtype,
         'category', t.typcategory,
         'owner', pg_get_userbyid(t.typowner),
         'base_type', case when t.typbasetype = 0 then null else format_type(t.typbasetype, t.typtypmod) end,
         'not_null', t.typnotnull,
         'default', t.typdefault,
         'enum_labels', (
           select jsonb_agg(e.enumlabel order by e.enumsortorder)
             from pg_catalog.pg_enum e
            where e.enumtypid = t.oid
         )
       ) as definition
  from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
 where n.nspname in ('public', 'storage')
   and t.typtype in ('e', 'd', 'c')
 order by object_key;

select 'routine' as category,
       n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object_key,
       jsonb_build_object(
         'kind', p.prokind,
         'owner', pg_get_userbyid(p.proowner),
         'language', l.lanname,
         'result', pg_get_function_result(p.oid),
         'security_definer', p.prosecdef,
         'volatility', p.provolatile,
         'parallel', p.proparallel,
         'config', p.proconfig,
         'acl', p.proacl,
         'definition', pg_get_functiondef(p.oid)
       ) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
 where n.nspname in ('public', 'storage')
 order by object_key;

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

select 'table_grant' as category,
       table_schema || '.' || table_name || '.' || grantee || '.' || privilege_type as object_key,
       jsonb_build_object('grantor', grantor, 'grantable', is_grantable) as definition
  from information_schema.role_table_grants
 where table_schema in ('public', 'storage')
 order by object_key;

select 'default_privilege' as category,
       n.nspname || '.' || pg_get_userbyid(d.defaclrole) || '.' || d.defaclobjtype::text as object_key,
       jsonb_build_object('acl', d.defaclacl) as definition
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
 where n.nspname in ('public', 'storage') or d.defaclnamespace = 0
 order by object_key;

select 'extension' as category,
       e.extname as object_key,
       jsonb_build_object('version', e.extversion, 'schema', n.nspname) as definition
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
 order by object_key;

select 'publication' as category,
       p.pubname as object_key,
       jsonb_build_object(
         'owner', pg_get_userbyid(p.pubowner),
         'insert', p.pubinsert,
         'update', p.pubupdate,
         'delete', p.pubdelete,
         'truncate', p.pubtruncate,
         'all_tables', p.puballtables,
         'tables', (
           select jsonb_agg(schemaname || '.' || tablename order by schemaname, tablename)
             from pg_catalog.pg_publication_tables pt
            where pt.pubname = p.pubname
         )
       ) as definition
  from pg_catalog.pg_publication p
 order by object_key;

select 'storage_bucket' as category,
       id::text as object_key,
       jsonb_build_object(
         'name', name,
         'public', public,
         'file_size_limit', file_size_limit,
         'allowed_mime_types', allowed_mime_types
       ) as definition
  from storage.buckets
 order by object_key;

rollback;
