-- Contract stage for challenge participant privacy.
--
-- This migration intentionally aborts unless an operator has reviewed current
-- adoption evidence, proved that no legacy clients still require direct
-- participant reads/inserts, and explicitly enabled the server-only gate created
-- by 0099. The check MUST remain before every destructive policy/grant change.

begin;

do $$
declare
  v_ready boolean;
begin
  select (
    gate_key = 'challenge_participant_privacy_v1'
    and enabled = true
    and enabled_at is not null
    and enabled_at >= now() - interval '24 hours'
    and enabled_at <= now() + interval '5 minutes'
    and evidence is not null
    and length(trim(evidence)) >= 16
  )
  into v_ready
  from public.challenge_participant_lockdown_readiness r
  where r.gate_key = 'challenge_participant_privacy_v1';

  if not coalesce(v_ready, false) then
    raise exception 'LOCKDOWN BLOCKED: challenge_participant_privacy_v1 requires reviewed zero-legacy-client evidence.'
      using errcode = '55000';
  end if;
end;
$$;

-- Once the gate is open, raw history becomes self-only. Other challenge
-- surfaces must use narrowly scoped server-authorized RPCs for aggregate counts
-- and gated completed-history results.
drop policy if exists "Participants are public" on public.challenge_participants;
drop policy if exists "Participants read own rows" on public.challenge_participants;
create policy "Participants read own rows" on public.challenge_participants
  for select using (auth.uid() = user_id);

-- New clients use create_challenge/join_challenge, which own their timestamps and
-- validate access at the database boundary. Removing legacy direct insert access
-- is safe only after the adoption gate above has been approved.
drop policy if exists "Join a challenge" on public.challenge_participants;
drop policy if exists "Join an active challenge" on public.challenge_participants;
revoke insert on table public.challenge_participants from public, anon, authenticated;
revoke insert on table public.challenges from public, anon, authenticated;

commit;
