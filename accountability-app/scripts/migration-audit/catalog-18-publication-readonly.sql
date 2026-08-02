begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
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

rollback;
