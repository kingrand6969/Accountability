begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select category, object_key, definition
  from (
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
           when 'view' then 9
           when 'materialized_view' then 10
           else 20
          end,
          object_key;

rollback;
