begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local idle_in_transaction_session_timeout = '15s';
select 'relation_privilege' as category,
       n.nspname || '.' || c.relname || '.' ||
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end ||
       '.' || x.privilege_type as object_key,
       jsonb_build_object(
         'grantor', pg_get_userbyid(x.grantor),
         'grantable', x.is_grantable,
         'relation_kind', c.relkind
       ) as definition
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 'S'::"char" else 'r'::"char" end, c.relowner))) x
 where n.nspname in ('public', 'storage')
   and c.relkind in ('r', 'p', 'v', 'm', 'S')
 order by object_key;

rollback;
