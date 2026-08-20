# AccountAbility Staging Release Receipt

Date: 2026-08-21
Environment: Staging
Platform: Android
Source branch: `codex/fix-buddy-rank-header`
Candidate commit: `5992b10`
Update profile: `preview`
Runtime version: `1.0.0`

## Decision status

**Staging canary accepted. This receipt does not approve production, a store
release, or the challenge participant privacy finalizer.**

## Release inventory

- EAS update group: `8b5afbb1-35c4-4a0e-9f3b-40cb2ee471c8`
- EAS update ID: `01a01ff7-2b99-7f56-98b1-3ac649080be3`
- Update message: `Staging: hardened app flows 5992b10`
- `media-read`: ACTIVE version 10, updated at
  `2026-08-20T16:13:21.152Z`
- The local and staging migration ledgers matched through migration 0113.
- Migrations 0112 and 0113 were applied and verified before the client update.

## Verification

- Jest: 205 of 205 suites and 2,324 of 2,324 tests passed, including the one
  stored snapshot.
- TypeScript: passed with no errors.
- ESLint changed-code gate: passed.
- Dependency tree check: passed.
- Release budget: passed with a 24.13 MiB Android update warning.
- EAS publication completed successfully with exit code 0.
- The two-launch update receipt completed without a blank or failed launch.
- Expo Updates reported no newer update after activation.
- Existing and updated clients rendered private media against `media-read`
  version 10.

## Device canary

- Comment: PASS. The field focused on one tap; three lines and the Send control
  remained above Gboard. First Android Back hid the keyboard while keeping the
  Post open; second Back returned to an already-painted Feed. The comment was
  not submitted.
- Buddy Card: PASS. The owner card showed no Connect-to-self action, the larger
  uncropped profile photo, complete Rookie crest, location, challenge wins,
  rankings, medal, stats, recent post, and Edit action. Tapping the photo opened
  a full-screen contained image. First Back closed only the viewer; second Back
  returned to Feed.
- Appearance: PASS. Dark appearance was readable on Menu, Feed, Post/comment,
  and the Buddy Card shell, persisted through a full app relaunch, and was then
  restored to Light.
- Composer: PASS. A harmless unsent draft remained visible above Gboard. First
  Back hid Gboard; second Back flushed the draft and safely returned to Feed.
  Reopening and choosing Restore recovered the exact canary text. The temporary
  text was then removed and the original blank draft state was saved again. No
  post was published.
- Navigation: PASS. Three settled Feed to Post to visible-Back cycles returned
  to the same painted Feed row and controls without a blank screen.
- Private post-video and voice media: NOT DIRECTLY EXERCISED. A read-only
  staging inventory after the canary found zero video posts and zero voice
  encouragements, so there was no legitimate playback target. No test content
  was created. Migration and focused media contract coverage passed.

## Residual risk

`image-size` retains two upstream high-severity advisories with no patched
compatible release. Metro resolves compatible version 1.2.1 and disables the
HEIF, ICNS, J2C, JP2, JXL, and JXL-stream parsers. This is a mitigated residual
risk, not a claim of zero dependency advisories.

The EAS command reported a transient asset-map upload 504, then continued and
published successfully. Client activation was verified by the staging canary.

## Rollback

1. Stop further client rollout.
2. Restore or republish previous preview group
   `22f20f02-f805-4285-9b31-30cf692032c5`, update
   `01a01ef1-df6a-7f63-b0e1-f1c6ca92eb5c`.
3. Verify launch, authentication, Feed rendering, and private media.
4. Keep `media-read` version 10 unless evidence identifies it as causal; any
   server rollback follows client rollback validation.
5. Do not reverse migrations 0111 through 0113 or delete staging data.

## Explicit exclusions

The challenge participant privacy finalizer was not invoked because
authoritative proof of exactly zero active legacy clients is unavailable. This
receipt does not authorize production deployment or claim that Stage B privacy
lockdown is complete.
