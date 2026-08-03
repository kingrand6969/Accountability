begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'table_grant' as category,
       table_schema || '.' || table_name || '.' || grantee || '.' || privilege_type as object_key,
       jsonb_build_object('grantor', grantor, 'grantable', is_grantable) as definition
  from information_schema.role_table_grants
 where table_schema in ('public', 'storage')
 order by object_key;

rollback;
