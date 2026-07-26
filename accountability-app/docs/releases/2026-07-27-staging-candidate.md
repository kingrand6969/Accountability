# AccountAbility Staging Candidate

Date: 2026-07-27  
App version: 1.0.0  
Platform: Android  
Build profile: preview  
Expo build: `b63c23e4-524f-42ad-a0e9-668fa4adb16f`  
Build result: Finished successfully  
APK size: 245,781,737 bytes (approximately 234 MiB)  
APK: <https://expo.dev/artifacts/eas/ADQyJTbIj-7_l-bKy1iqIR2Yn6uDPjd3Rlf7ZG8vPug.apk>  
Source branch: `codex/offline-beauty-safety`  
Recorded source commit: `0e622d1`

## Decision status

**Staging only — not approved for production.**

This APK is intended for founder-device testing. It was created while the local
working tree contained uncommitted application changes, so the build cannot yet
be tied to one immutable Git commit. A production candidate must be rebuilt from
a clean, reviewed commit after the staging checks below pass.

## Plain-English summary

This staging release improves the app's reliability and accessibility, expands
long-term challenges and achievements, adds safer public sharing, and prepares
offline activity handling and natural selfie enhancements for device testing.
The public sharing destination is now `joinaccountability.app`.

## What changed and why

- Prevented unread-message realtime subscriptions from colliding.
- Added clearer form feedback and more accessible controls.
- Added recoverable loading and error states to Compete.
- Added long-term prestige achievement tiers after Diamond.
- Added recurring official challenges designed for long-term participation.
- Added trusted, revocable public-share records and branded share-page support.
- Changed public links to the dedicated `joinaccountability.app` domain.
- Reduced Android cloud-build uploads to the mobile app only.
- Prepared offline activity queue, media lifecycle, and natural selfie-editing
  work for staging verification.

## Features and screens affected

- Sign in and sign up
- Feed, post detail, story rail, composer, and post actions
- Run cards and run-share formats
- Memories
- Messages unread state
- Compete challenges and achievements
- Public share links and public share website
- Android build and update configuration

## Security and privacy impact

- Public shares use server-issued, revocable records rather than exposing raw
  private app data.
- The public-share database function is designed to return only the approved
  public payload.
- User data remains in Supabase during code rollback.
- No database rollback is part of recovery.
- The new database migrations remain unapplied until authenticated migration
  access is available.
- Production release remains blocked until the candidate is immutable and the
  required migrations and share site are verified.

## Database and storage impact

Prepared, additive migrations:

- `0078_discover_and_verified_shares.sql`
- `0079_post_idempotency.sql`
- `0080_official_challenges.sql`
- `0081_public_share_links.sql`

These migrations have not been applied to the connected Supabase project from
this workstation because the Supabase CLI does not have an access token.
No destructive database operation is authorized or required.

Static migration review completed on 2026-07-27:

- No table truncation, table drop, column drop, storage deletion, RLS disable,
  or user-record deletion was found.
- Migration 0078 performs bounded classification updates on existing posts so
  historical group, page, event, and photo records retain their intended type.
- `DROP POLICY`, `DROP TRIGGER`, and `DROP CONSTRAINT` statements replace access
  rules or constraints in the same migration; they do not delete user rows.
- Migration 0080 relaxes `creator_id` nullability only for official challenges
  and immediately adds an ownership constraint.
- Migrations remain classified as additive/forward-only, but production
  application still requires authenticated execution and post-migration policy
  verification.

## Automated test evidence

- Full Jest suite: 39 suites and 595 tests passed on 2026-07-27.
- TypeScript compile check: passed with no errors on 2026-07-27.
- Public share website production build: passed.
- Android EAS preview build: finished successfully on 2026-07-27.
- APK availability check: HTTP 200 with an Android artifact response and a
  content length of 245,781,737 bytes.
- Standard Expo ESLint baseline: completed; 136 errors and 51 warnings remain
  across the existing codebase. These are recorded as a production-candidate
  cleanup gate rather than being auto-fixed.
- Dependency audit: no critical advisories. Production dependency tree reports
  3 high and 13 moderate transitive advisories. The automatic force fix proposes
  incompatible framework downgrades and was not applied.

These checks were run against the current staging workspace. They must be rerun
after the working tree is committed and before a production candidate is
created.

## Required visual evidence

Capture on the founder's Android device:

1. Sign-in and sign-up screens.
2. Buddies and Discover segmented control.
3. Feed composer showing “Inspire us today!”
4. My Day story rail.
5. Run result card and each supported share orientation.
6. Offline “Saved on phone” state and later automatic upload.
7. Natural selfie adjustment at default and reduced strength.
8. External share preview with branded media and without an exposed raw URL.
9. Compete official challenge and prestige achievement progress.
10. Revoked or expired public-share page.

## Staging acceptance checks

- Install and launch the APK on the founder's Android device.
- Sign in with an existing confirmed account.
- Create a text post and a photo post.
- Record an activity online and confirm it uploads once.
- Record an activity offline, confirm “Saved on phone,” restore connectivity,
  and confirm one automatic upload with no duplicate.
- Change a run-share background and share again.
- Verify portrait, square, and landscape share output.
- Confirm media is retained only when posted, saved to Memories, saved to the
  phone, or explicitly shared as designed.
- Open every primary navigation button and verify back navigation.
- Verify the public share preview and app/store fallback.

## Known risks and blockers

- The staging build is not tied to a clean immutable commit.
- Migrations 0078–0081 are prepared but not applied.
- The public share website is built but not published because the hosting
  connector rejected its source-upload credential.
- The custom domain cannot be attached until the share website is published.
- Physical-device evidence is not yet captured.
- The newly established lint baseline is not clean; production release requires
  triage of errors affecting changed or critical paths, followed by a documented
  baseline policy for legacy findings.
- Production dependency advisories require Expo-compatible remediation rather
  than npm's proposed breaking downgrade.
- Store listings are not yet available, so public fallbacks cannot be verified
  against final Google Play and Apple App Store URLs.

## Rollout plan

1. Founder Android device only.
2. Fix any staging defects and rerun all checks.
3. Commit the exact candidate and verify a clean working tree.
4. Apply additive migrations and verify policies/RPCs.
5. Publish and verify the public share website and custom domain.
6. Build a fresh candidate from the immutable commit.
7. Founder approval in the Release Control Center.
8. Controlled user rollout: founder devices, 5%, 25%, then 100%, with health
   checks between stages.

## Recovery instructions

- Stop further rollout immediately if authentication, uploads, offline sync,
  public-share privacy, or crash-free operation regresses.
- Restore the prior compatible app code or configuration.
- Keep current Supabase user data and uploaded media in place.
- Use forward fixes for database changes; do not rewind the production
  database.
- Revoke affected public-share records if a sharing defect exposes more data
  than intended.

## User-facing release notes draft

AccountAbility is becoming more reliable and easier to use. This update improves
sign-in feedback, feed and challenge recovery, long-term achievements, activity
sharing, accessibility, and offline run protection. Public shares now use a
branded AccountAbility destination with revocable access.
