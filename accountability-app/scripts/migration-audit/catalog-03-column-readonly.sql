begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
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

rollback;
