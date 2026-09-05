-- Re-accepting a newer Terms + Privacy version must record when that version
-- was accepted. Age confirmation remains the original one-time declaration.
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
        terms_accepted_at = excluded.terms_accepted_at,
        age_confirmed_at = coalesce(public.profiles.age_confirmed_at, excluded.age_confirmed_at);
$$;

revoke all on function public.record_consent(text) from public;
grant execute on function public.record_consent(text) to authenticated;
