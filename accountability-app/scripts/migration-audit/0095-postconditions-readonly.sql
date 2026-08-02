-- Read-only postconditions for migration 0095.
with security_definer_functions as (
  select p.oid,
         p.proname,
         pg_get_function_identity_arguments(p.oid) as identity_arguments,
         p.proacl,
         p.proowner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
), unexpected_anon as (
  select *
    from security_definer_functions
   where has_function_privilege('anon', oid, 'EXECUTE')
     and not (proname = 'get_public_share' and identity_arguments = 'p_share uuid')
), unexpected_public as (
  select sdf.*
    from security_definer_functions sdf
   where exists (
     select 1
       from aclexplode(coalesce(sdf.proacl, acldefault('f', sdf.proowner))) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
   )
)
select
  not exists (select 1 from unexpected_anon) as no_unexpected_anon_security_definer_execute,
  not exists (select 1 from unexpected_public) as no_public_security_definer_execute,
  has_function_privilege('anon', 'public.get_public_share(uuid)', 'EXECUTE') as anon_public_share_preserved,
  has_function_privilege('authenticated', 'public.get_public_share(uuid)', 'EXECUTE') as authenticated_public_share_preserved,
  has_function_privilege('service_role', 'public.get_public_share(uuid)', 'EXECUTE') as service_public_share_preserved;
