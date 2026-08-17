-- Install-only finalizer for challenge participant privacy.
--
-- Applying this migration (including a fresh database reset) deliberately leaves
-- the Stage A compatibility policies and grants unchanged. A trusted operator may
-- invoke the function below only after the local adoption checker accepts current,
-- reviewed evidence that no active legacy clients remain.

begin;

alter table public.challenge_participant_lockdown_readiness
  add column if not exists decision text,
  add column if not exists active_legacy_clients integer,
  add column if not exists observed_at timestamptz,
  add column if not exists minimum_version text,
  add column if not exists reviewer text,
  add column if not exists completed_at timestamptz;

-- service_role must use the validated finalizer rather than editing readiness
-- state directly. postgres remains the trusted database-owner/operator path.
revoke all on table public.challenge_participant_lockdown_readiness from service_role;

create or replace function public.finalize_challenge_participant_privacy_lockdown(
  p_gate text,
  p_decision text,
  p_active_legacy_clients integer,
  p_observed_at timestamptz,
  p_minimum_version text,
  p_reviewer text,
  p_evidence text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
begin
  -- Validate every adoption field before taking a lock or changing policy state.
  if p_gate is null or p_gate <> 'challenge_participant_privacy_v1' then
    raise exception 'Invalid challenge participant privacy gate.' using errcode = '22023';
  end if;

  if p_decision is null or p_decision <> 'APPROVED' then
    raise exception 'A reviewed APPROVED decision is required.' using errcode = '22023';
  end if;

  if p_active_legacy_clients is null or p_active_legacy_clients <> 0 then
    raise exception 'Active legacy client count must be exactly zero.' using errcode = '22023';
  end if;

  if p_observed_at is null
    or p_observed_at < now() - interval '24 hours'
    or p_observed_at > now() + interval '5 minutes'
  then
    raise exception 'Adoption evidence must be current.' using errcode = '22023';
  end if;

  if p_minimum_version is null or length(trim(p_minimum_version)) < 1 then
    raise exception 'The adopted minimum version is required.' using errcode = '22023';
  end if;

  if p_reviewer is null or length(trim(p_reviewer)) < 3 then
    raise exception 'A named reviewer is required.' using errcode = '22023';
  end if;

  if p_evidence is null or length(trim(p_evidence)) < 16 then
    raise exception 'A durable evidence reference is required.' using errcode = '22023';
  end if;

  -- Serialize concurrent finalizer calls, then lock the singleton readiness row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('challenge_participant_privacy_v1', 0)
  );

  select completed_at
  into v_completed_at
  from public.challenge_participant_lockdown_readiness
  where gate_key = 'challenge_participant_privacy_v1'
  for update;

  if not found then
    raise exception 'Challenge participant privacy readiness state is missing.'
      using errcode = '55000';
  end if;

  -- Replay-safe: a second valid invocation observes the recorded completion and
  -- leaves policies, grants, and evidence untouched.
  if v_completed_at is not null then
    return false;
  end if;

  -- These statements are constants. No caller value is interpolated into DDL.
  execute 'drop policy if exists "Participants are public" on public.challenge_participants';
  execute 'drop policy if exists "Participants read own rows" on public.challenge_participants';
  execute 'create policy "Participants read own rows" on public.challenge_participants for select using (auth.uid() = user_id)';
  execute 'drop policy if exists "Join a challenge" on public.challenge_participants';
  execute 'drop policy if exists "Join an active challenge" on public.challenge_participants';
  execute 'revoke insert on table public.challenge_participants from public, anon, authenticated';
  execute 'revoke insert on table public.challenges from public, anon, authenticated';

  update public.challenge_participant_lockdown_readiness
  set enabled = true,
      evidence = trim(p_evidence),
      enabled_at = now(),
      decision = p_decision,
      active_legacy_clients = p_active_legacy_clients,
      observed_at = p_observed_at,
      minimum_version = trim(p_minimum_version),
      reviewer = trim(p_reviewer),
      completed_at = now()
  where gate_key = 'challenge_participant_privacy_v1';

  return true;
end;
$$;

revoke execute on function public.finalize_challenge_participant_privacy_lockdown(
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.finalize_challenge_participant_privacy_lockdown(
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) to service_role, postgres;

comment on function public.finalize_challenge_participant_privacy_lockdown(
  text,
  text,
  integer,
  timestamptz,
  text,
  text,
  text
) is 'Atomically finalizes challenge participant privacy after fresh, reviewed zero-legacy-client evidence; returns false after prior completion.';

notify pgrst, 'reload schema';

commit;
