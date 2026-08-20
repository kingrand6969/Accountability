# AccountAbility Staging Release Receipt

Date: 2026-08-21
Environment: Staging
Platform: Android
Source branch: `codex/fix-buddy-rank-header`
Candidate commit: `8d63258`
Update profile: `preview`
Runtime version: `1.0.0`

## Decision status

**Staging canary accepted. This receipt does not approve production, a store
release, or the challenge participant privacy finalizer.**

## Release inventory

- EAS update group: `ce7d6e2f-4d15-4ca3-9a1c-06136fc92a1b`
- EAS update ID: `01a0206b-af6f-717e-af31-d15bcbd7eb22`
- Update message: `Staging: quiet unrelated drafts 8d63258`
- Superseded composer-canary update group:
  `d0bc57f6-d82a-4dd3-9462-a1295071e63c`, update
  `01a02065-8ed5-7198-a704-c73b7bc3a1f6`.
- `media-read`: ACTIVE version 10, updated at
  `2026-08-20T16:13:21.152Z`
- The local and staging migration ledgers matched through migration 0113.
- Migrations 0112 and 0113 were applied and verified before the client update.

## Verification

- Jest: 206 of 206 suites and 2,329 of 2,329 tests passed, including the one
  stored snapshot.
- TypeScript: passed with no errors.
- ESLint: passed with no errors; two existing test-only warnings remain.
- Dependency tree check: passed.
- Release budget: passed with a 24.13 MiB Android update warning.
- EAS publication completed successfully with exit code 0.
- The two-launch update receipt completed without a blank or failed launch.
- Expo Updates reported no newer update after activation.
- Existing and updated clients rendered private media against `media-read`
  version 10.
- A fresh Android route sweep opened 31 static authenticated destinations. All
  painted app content; Trophy Case, Compete, and Menu were verified by
  screenshots because their continuous animation prevents UIAutomator from
  reaching an idle state.
- A physical Android responsive-text sweep at 130% covered Feed, Activity,
  Run, Messages, Compete, and Menu. Primary copy and actions remained readable
  and reachable; long competition and menu labels wrapped instead of clipping.
  The device font scale was restored from 1.30 to its original 1.0 afterward.

## Goal coverage

| Goal | Evidence | Result |
| --- | --- | --- |
| Links and navigation | 53 Expo routes and 175 navigation call sites audited; 31 static authenticated destinations painted on Android; deep-link and safe-Back contracts passed. | PASS |
| Post flow | Feed opens the editor directly; text/comment keyboard, draft restore, empty-draft cleanup, untouched Close, retry-safe submit, and owner isolation are covered by tests and Android canaries. | PASS |
| Flex flow | Manual Flex opens one contextual Share proof surface; achievement/run/challenge context and idempotent publishing contracts passed without a redundant chooser page. | PASS |
| Athlete visual system | Feed, Journey, Run, competition, Trophy Case, Buddy Card shell, social, fitness, and support surfaces share the Light/Dark semantic theme and 48dp interaction contracts. | PASS |
| Loading and truthful states | Feed snapshot reuse/skeletons and account-scoped Messages, Notifications, Profile, Post, and onboarding loading/error states passed focused and full-suite tests. | PASS |
| Release integrity | Full Jest, TypeScript, lint, diff, Android export, OTA activation, cold launch, rollback receipt, and artifact-hygiene gates passed. | PASS |

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
- Composer follow-up: PASS. Legacy empty drafts no longer trigger Restore,
  incompatible drafts stay stored without a non-actionable red warning, the
  current member is labelled `You` when profile metadata is unavailable, and
  visible Close exits an untouched post without a confirmation. No post was
  published during this canary.
- Responsive text: PASS for the supported Android portrait presentation. Feed,
  Activity, Run, Messages, Compete, and Menu were exercised at 130% system text;
  controls stayed reachable and primary information did not clip. The app is
  intentionally portrait-locked, so landscape is not a supported presentation.
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

One first-time Journey Path transition produced a blank frame and was retained
as evidence. It did not recur on a direct relaunch, three controlled
Momentum-to-Path transitions, or the later 31-route sweep. No unsupported code
change was made without a reproducible cause.

## Rollback

1. Stop further client rollout.
2. Restore or republish the last broadly accepted preview group
   `8b5afbb1-35c4-4a0e-9f3b-40cb2ee471c8`, update
   `01a01ff7-2b99-7f56-98b1-3ac649080be3`.
3. Verify launch, authentication, Feed rendering, and private media.
4. Keep `media-read` version 10 unless evidence identifies it as causal; any
   server rollback follows client rollback validation.
5. Do not reverse migrations 0111 through 0113 or delete staging data.

## Explicit exclusions

The challenge participant privacy finalizer was not invoked because
authoritative proof of exactly zero active legacy clients is unavailable. This
receipt does not authorize production deployment or claim that Stage B privacy
lockdown is complete.
