begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'routine_privilege' as category,
       n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ').' ||
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end ||
       '.' || x.privilege_type as object_key,
       jsonb_build_object('grantor', pg_get_userbyid(x.grantor), 'grantable', x.is_grantable) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) x
 where n.nspname in ('public', 'storage')
 order by object_key;

rollback;
