begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
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

rollback;
