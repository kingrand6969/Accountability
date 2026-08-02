begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
set local idle_in_transaction_session_timeout = '10s';

select 'storage_bucket_config' as category,
       id::text as object_key,
       jsonb_build_object(
         'public', public,
         'file_size_limit', file_size_limit,
         'allowed_mime_types', allowed_mime_types
       ) as definition
  from storage.buckets
 order by object_key;

rollback;
