begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

select 'storage_bucket_object_count' as category,
       bucket_id as object_key,
       jsonb_build_object('count', count(*)::text) as definition
  from storage.objects
 group by bucket_id
 order by object_key;

rollback;
