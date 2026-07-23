-- 0058: record acceptance of the Terms of Service + Privacy Policy and the
-- 13+ age confirmation, captured at sign-up. Versioned so a future terms
-- change can re-prompt existing members.

alter table public.profiles
  add column if not exists terms_version    text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists age_confirmed_at  timestamptz;

-- Called by the client right after the account's first session exists. Stamps
-- the accepted version + time for the caller only.
create or replace function public.record_consent(p_version text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.profiles (id, terms_version, terms_accepted_at, age_confirmed_at)
  values (auth.uid(), p_version, now(), now())
  on conflict (id) do update
    set terms_version = excluded.terms_version,
        terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at),
        age_confirmed_at  = coalesce(public.profiles.age_confirmed_at, excluded.age_confirmed_at);
$$;

revoke all on function public.record_consent(text) from public;
grant execute on function public.record_consent(text) to authenticated;
