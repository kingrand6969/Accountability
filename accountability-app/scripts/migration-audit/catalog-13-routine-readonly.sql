begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'routine' as category,
       n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object_key,
       jsonb_build_object(
         'kind', p.prokind,
         'owner', pg_get_userbyid(p.proowner),
         'language', l.lanname,
         'result', pg_get_function_result(p.oid),
         'security_definer', p.prosecdef,
         'volatility', p.provolatile,
         'parallel', p.proparallel,
         'config', p.proconfig,
         'acl', p.proacl,
         'definition', pg_get_functiondef(p.oid)
       ) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
 where n.nspname in ('public', 'storage')
 order by object_key;

rollback;
