# Challenge participant privacy rollout

This is an expand-and-contract rollout for installed mobile clients. The legacy
client at commit `8218691` directly reads `challenge_participants` to render
counts and membership, and directly inserts challenge/participant rows. This
repository has no launch-time forced-minimum-version service, so an ordinary
Expo update cannot prove that every installed client has adopted the new RPCs.

## Stage A: compatible and time-hardened

Migration `0106_buddy_completed_challenges.sql` keeps legacy create, join, count,
and current-user membership behavior working. Direct create/join policies now
validate the database active window and tolerate only small phone-clock drift.
New clients use the atomic server-owned RPCs.

Privacy is not yet remediated in Stage A: authenticated legacy clients retain
the historical participant-row read policy until adoption is proven. Do not
describe Stage A as the participant privacy fix.

## Required adoption evidence

Before enabling the contract stage, the release owner must establish from an
authoritative active-client telemetry source that:

1. The RPC-capable minimum version is fully rolled out.
2. `activeLegacyClients` is exactly `0` during the evidence window.
3. The observation is less than 24 hours old.
4. A named reviewer explicitly sets the decision to `APPROVED`.

Copy `scripts/challenge-lockdown-adoption.template.json` to a reviewed release
artifact, fill it from that telemetry, and run:

```sh
npm run release:challenge-lockdown -- path/to/reviewed-adoption-report.json
```

The checker never changes the database. Its default template is deliberately
unusable (`PENDING` with no client count), so a missing or guessed report fails.

## Stage B: explicit privacy lockdown

Migration `0108_challenge_participant_privacy_lockdown.sql` only installs the
trusted finalizer. Normal migration application and fresh database reset succeed
without changing Stage A participant policies or grants. Merely applying every
migration never performs the privacy lockdown.

After the checker succeeds and the report is independently reviewed, a database
operator using `postgres` (or a backend holding the `service_role`, never a mobile
client) invokes the finalizer with the exact reviewed report fields:

```sql
select public.finalize_challenge_participant_privacy_lockdown(
  p_gate => 'challenge_participant_privacy_v1',
  p_decision => 'APPROVED',
  p_active_legacy_clients => 0,
  p_observed_at => timestamptz '<UTC timestamp from the reviewed report>',
  p_minimum_version => '<fully adopted RPC-capable version>',
  p_reviewer => '<named reviewer>',
  p_evidence => '<reviewed report identifier and immutable evidence reference>'
);
```

The function rejects stale, future, unnamed, unapproved, or non-zero-legacy
evidence before acquiring its lock, so an invalid call changes nothing. A valid
call acquires transaction and row locks, atomically makes participant reads
self-only, revokes direct challenge/participant inserts, and records the reviewed
evidence and completion time in `challenge_participant_lockdown_readiness`.
The first successful call returns `true`; later valid replays return `false`
without changing the original completion record.
Aggregate counts and authorized completed history remain available through the
narrow RPCs.

The unavoidable operational step is proving zero active legacy clients. If that
cannot be proved, keep Stage A and its explicitly documented privacy limitation;
do not invoke the finalizer.
