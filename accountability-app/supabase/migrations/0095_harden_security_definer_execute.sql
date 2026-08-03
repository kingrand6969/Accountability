-- 0095: narrow the client execution boundary around SECURITY DEFINER routines.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. For a
-- SECURITY DEFINER routine that silently makes anon, authenticated and
-- service_role effective grantees, even when a migration only intended an
-- authenticated RPC. Preserve the pre-migration authenticated surface, remove
-- anonymous/PUBLIC access, retain server access, then restore the one deliberate
-- anonymous RPC used by public share links.

do $hardening$
declare
  fn record;
  authenticated_had_execute boolean;
begin
  for fn in
    select p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as identity_arguments
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
     order by p.oid
  loop
    -- Snapshot effective authenticated access before removing PUBLIC. This
    -- preserves the existing signed-in API without guessing from source usage.
    authenticated_had_execute :=
      has_function_privilege('authenticated', fn.oid, 'EXECUTE');

    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      fn.nspname, fn.proname, fn.identity_arguments
    );

    if authenticated_had_execute then
      execute format(
        'grant execute on function %I.%I(%s) to authenticated',
        fn.nspname, fn.proname, fn.identity_arguments
      );
    end if;

    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      fn.nspname, fn.proname, fn.identity_arguments
    );
  end loop;
end
$hardening$;

-- The rendered public-share reader is intentionally callable without a login.
revoke execute on function public.get_public_share(uuid) from public;
grant execute on function public.get_public_share(uuid) to anon, authenticated, service_role;

