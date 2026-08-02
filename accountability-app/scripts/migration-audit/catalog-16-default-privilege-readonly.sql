begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'default_privilege' as category,
       n.nspname || '.' || pg_get_userbyid(d.defaclrole) || '.' || d.defaclobjtype::text as object_key,
       jsonb_build_object('acl', d.defaclacl) as definition
  from pg_catalog.pg_default_acl d
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
 where n.nspname in ('public', 'storage') or d.defaclnamespace = 0
 order by object_key;

rollback;
