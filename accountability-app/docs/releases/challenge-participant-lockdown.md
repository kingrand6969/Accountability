# Challenge participant privacy rollout

This is an expand-and-contract rollout for installed mobile clients. The legacy
client at commit `8218691` directly reads `challenge_participants` to render
counts and membership, and directly inserts challenge/participant rows. This
repository has no launch-time forced-minimum-version service, so an ordinary
Expo update cannot prove that every installed client has adopted the new RPCs.

## Stage A: compatible and time-hardened

Migration `0099_buddy_completed_challenges.sql` keeps legacy create, join, count,
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

After the checker succeeds and the report is independently reviewed, a database
operator records the same evidence in the server-only gate:

```sql
update public.challenge_participant_lockdown_readiness
set enabled = true,
    evidence = '<reviewed report identifier and immutable evidence reference>',
    enabled_at = now()
where gate_key = 'challenge_participant_privacy_v1';
```

Then rerun the normal migration application. Migration
`0101_challenge_participant_privacy_lockdown.sql` checks the gate before changing
anything. With the default closed gate it raises `LOCKDOWN BLOCKED`, preventing
automated migration apply from accidentally removing legacy access. Once open,
the database gate expires after 24 hours; rerun the adoption review rather than
reusing stale approval. It makes participant reads self-only and removes direct challenge/participant
insert access; aggregate counts and authorized completed history remain available
only through the narrow RPCs.

The unavoidable operational step is proving zero active legacy clients. If that
cannot be proved, keep Stage A and its explicitly documented privacy limitation;
do not enable the gate.
