begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select category, object_key, definition
  from (
(
select 'default_privilege' as category,
       n.nspname || '.' || pg_get_userbyid(d.defaclrole) || '.' || d.defaclobjtype::text as object_key,
       jsonb_build_object('acl', d.defaclacl) as definition
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
 where n.nspname in ('public', 'storage') or d.defaclnamespace = 0
 order by object_key
)
union all
(
select 'extension' as category,
       e.extname as object_key,
       jsonb_build_object('version', e.extversion, 'schema', n.nspname) as definition
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
 order by object_key
)
union all
(
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
 order by object_key
)
union all
(
select 'storage_bucket' as category,
       id::text as object_key,
       jsonb_build_object(
         'name', name,
         'public', public,
         'file_size_limit', file_size_limit,
         'allowed_mime_types', allowed_mime_types
       ) as definition
  from storage.buckets
 order by object_key
)
       ) as catalog_rows
 order by case category
           when 'default_privilege' then 16
           when 'extension' then 17
           when 'publication' then 18
           when 'storage_bucket' then 19
           else 20
          end,
          object_key;

rollback;
