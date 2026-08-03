begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select category, object_key, definition
  from (
(
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
 order by object_key
)
union all
(
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
 order by object_key
)
union all
(
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
 order by object_key
)
       ) as catalog_rows
 order by case category
           when 'sequence' then 11
           when 'type' then 12
           when 'routine' then 13
           else 20
          end,
          object_key;

rollback;
