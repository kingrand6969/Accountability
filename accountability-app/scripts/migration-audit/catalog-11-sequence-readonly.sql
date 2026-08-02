begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
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

rollback;
