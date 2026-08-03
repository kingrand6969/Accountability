# AccountAbility Group 3 Social Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the approved Feed, Discover, immersive Post Detail, and Encouragement references while preserving social data, privacy, media, pagination, creation, and compatibility routes.

**Architecture:** Keep existing Expo Router routes and service/API seams intact. Extract small social presentation components from the current large screens, preserve all request-generation and single-flight guards, and add explicit view-state models so visual refitting cannot silently alter data access. Backend or media-policy changes remain serialized platform work and require separate two-user staging proof.

**Tech Stack:** Expo SDK 56, Expo Router, React Native 0.85, React 19, TypeScript, Jest, Supabase, Cloudflare R2, EAS preview updates, Android ADB evidence.

---

## Locked inputs

- `docs/references/group3/group3-approved-social-four-panel.png`
- `docs/quality/accountability-reference-contract.md`
- `docs/quality/accountability-route-contract.md`
- `docs/quality/accountability-safety-and-ownership.md`
- `docs/superpowers/specs/2026-07-27-accountability-final-experience-design.md`

## Expo SDK 56 documentation reviewed before source changes

- `https://docs.expo.dev/versions/v56.0.0/sdk/router/`
  - Preserve typed file routes, query parameters, back behavior, and canonical
    `/post/[id]?encouragement=1` handoff.
- `https://docs.expo.dev/versions/v56.0.0/sdk/image/`
  - Use `expo-image` caching, `contentFit`, placeholders, `recyclingKey`, and
    explicit accessible labels for recycled feed media.
- `https://docs.expo.dev/versions/v56.0.0/sdk/video/`
  - Preserve the existing `expo-video` player lifecycle and never autoplay
    multiple recycled feed items.
- `https://docs.expo.dev/versions/v56.0.0/sdk/audio/`
  - Preserve microphone permission, recording lifecycle, app-background
    handling, duration caps, and preview-before-send.
- `https://docs.expo.dev/versions/v56.0.0/sdk/sharing/`
  - Keep platform availability checks and never place private voice or media
    references into an external-share payload.

No new native dependency, permission, config plugin, package, app identity, or
runtime-version change is planned. Any such need stops OTA eligibility and
requires a separately approved preview APK.

## Exclusive ownership

| Task | Files exclusively owned |
|---|---|
| 3.0 preservation | external snapshot and Group 3 evidence only |
| 3.1 contracts | new tests under `src/feed`, `src/discover`, `src/navigation`; no production source |
| 3.2 Feed | `src/app/(app)/index.tsx`, `src/feed/SocialBrandHeader.tsx`, `src/feed/SocialModeSelector.tsx`, `src/feed/MyDayRail.tsx`, `src/feed/FeedProofCard.tsx`, `src/feed/ProofHeadlineOverlay.tsx`, `src/feed/RunRouteMetricOverlay.tsx` |
| 3.3 Discover | `src/discover/DiscoverExperience.tsx`, `src/discover/discoverViewState.ts`, tests |
| 3.4 Post Detail | `src/app/post/[id].tsx`, `src/feed/ImmersivePost.tsx`, tests |
| 3.5 Encouragement | `src/feed/EncouragementBar.tsx`, `src/feed/EncouragementSheet.tsx`, `src/feed/VoiceEncouragementRecorder.tsx`, tests |
| 3.6 voice safety platform handoff | `src/feed/api.ts`, `src/feed/voiceSafety.ts`, `src/feed/voiceSafety.test.ts`, conditional additive `supabase/migrations/0093_voice_encouragement_operations.sql`, `supabase/tests/group3_voice_safety.sql` |
| 3.7A group/page routes | `src/navigation/socialGroupPageContract.test.ts`, `src/app/groups.tsx`, `src/app/group/[id].tsx`, `src/app/group-new.tsx`, `src/app/pages.tsx`, `src/app/page/[id].tsx`, `src/app/page-new.tsx` |
| 3.7B story/notification/search routes | `src/navigation/socialUtilityRouteContract.test.ts`, `src/app/story/[userId].tsx`, `src/app/(app)/notifications.tsx`, `src/app/search.tsx` |
| 3.8 platform proof | `supabase/tests/group3_social_rls.sql`, `src/feed/socialIdempotency.test.ts`, `docs/release-evidence/2026-07-30-group3-two-user-matrix.md` |
| 3.9 integration | evidence files only |

Shared shell, root layout, theme, packages, config, identity, finance, journey,
run, auth, and production files are out of scope. Broad formatting and autofix
commands are forbidden.

## Preserved service and behavior seams

- `listFeed`, `FEED_PAGE_SIZE`, cursor pagination, Buddies/Discover scope,
  group/page exclusion, public-only discovery, generation guards, refresh,
  end-reached, and load-more behavior.
- Composer, story, search, notifications, group/page, profile, Memories,
  post-detail, public-share, report, hide, delete, edit, and audience routes.
- `setLiked` remains the existing database reaction even when the visible label
  says Encourage; no duplicate reaction model is introduced.
- `getPost`, comments, encouragers, voice encouragement, recording, playback,
  R2 references, image/video policy, and owner/account guards.
- `client_operation_id` and existing run-post idempotency behavior.
- Existing `encouragements_delete` sender-only policy from migration `0086`,
  plus canonical `buddy_blocks` and `buddy_reports` tables/policies from
  migration `0013`; Group 3 must reuse them and must not create parallel
  voice-specific report or block models.
- `/post/[id]?encouragement=1`, `/groups`, `/group/[id]`, `/group-new`,
  `/pages`, `/page/[id]`, `/page-new`, `/story/[userId]`, `/notifications`,
  `/search`, `/compose`, `/win-card`, and `/share/[id]`.

## Required state ownership matrix

Each row requires a failing automated contract test in the owning task, the
smallest implementation that makes it pass, and installed evidence in Task 3.9.

| Reference | State | Owning task | Automated proof |
|---|---|---:|---|
| SOC-FEED-01 | populated, empty, initial loading, pagination loading, retryable error | 3.2 | `src/feed/socialScreenContract.test.ts` |
| SOC-FEED-01 | offline cached/uncached, privacy-redacted, own/other, public/restricted | 3.2 and 3.8 | component contract plus `supabase/tests/group3_social_rls.sql` |
| SOC-FEED-01 | back/background/restart/reconnect and restored mode/scroll | 3.2 | `src/feed/socialScreenContract.test.ts` |
| SOC-DISC-01 | populated/empty/loading/error/offline/retry | 3.3 | `src/discover/discoverViewState.test.ts` |
| SOC-DISC-01 | Nearby unasked/granted/denied/blocked; public-only; own/other | 3.3 and 3.8 | view-state test plus RLS SQL |
| SOC-POST-01 | populated/loading/error/retry/missing/revoked | 3.4 | `src/feed/immersivePostContract.test.ts` |
| SOC-POST-01 | offline cached/uncached, media unavailable, privacy-redacted, own/other, public/restricted | 3.4 and 3.8 | component contract plus RLS SQL |
| SOC-POST-01 | comments empty/loading/error; back/background/restart/reconnect | 3.4 | `src/feed/immersivePostContract.test.ts` |
| SOC-ENCOURAGE-01 | empty/loading/error/retry/offline | 3.5 | `src/feed/encouragementContract.test.ts` |
| SOC-ENCOURAGE-01 | microphone unasked/granted/denied/blocked | 3.5 | `src/feed/encouragementContract.test.ts` |
| SOC-ENCOURAGE-01 | recording/preview/play/upload/retry/discard/background/10-second stop | 3.5 | `src/feed/encouragementContract.test.ts` |
| SOC-ENCOURAGE-01 | privacy-redacted, own/other voice, sender delete, recipient report/block | 3.5, 3.6, and 3.8 | component contract, voice safety test, and RLS SQL |
| all four | normal/130%/200%, reduced motion, TalkBack, small/primary/large Android | 3.9 | evidence manifest and independent audit |

## Task 3.0: Preserve the Group 2 handoff

**Files:**
- Create outside Git root: `AccountAbility-Safe-Snapshots/accountability-app-group3-prechange-<timestamp>/`
- Create: `docs/release-evidence/2026-07-30-group3-social.md`

- [ ] Record branch, HEAD, normal porcelain status, and all-untracked porcelain status.
- [ ] Create a protected snapshot excluding `node_modules`, `.expo`, and `dist`, while preserving environment files only inside the access-controlled snapshot.
- [ ] Record the snapshot directory ACL and prove it grants access only to the current Windows user and system administrators.
- [ ] Write `status.txt`, a `git diff --binary` result to `working-tree.patch`, and a complete `manifest.sha256`.
- [ ] Re-hash every included file and compare the complete result to `manifest.sha256`; require zero missing, extra, or mismatched entries.
- [ ] Record the previous staging APK build ID `55bc82fc-e1fd-45a5-8a0b-618ff84e0160`, its permanent Expo build-details URL, and compatible preview update group `d908a5b3-134d-42d3-ae91-857e5bd4fc58`.
- [ ] Record rollback as source/update/APK selection only; never delete, rewind, or rewrite user rows or media.
- [ ] Generate the full executable route manifest from `src/app`, including route and query contracts, and attach it to the evidence report.
- [ ] Refine and record the four crop rectangles from the immutable `1191 x 532` social panel, starting from Feed `(8,0,251,532)`, Discover `(309,0,250,532)`, Post `(606,0,259,532)`, and Encouragement `(910,0,259,532)`; store the final integer rectangles, resampling method, and source checksum.
- [ ] Verify public Expo config with `APP_VARIANT=staging`; require name `AccountAbility Staging`, scheme `accountabilityapp-staging`, package/bundle ID `com.awldesk.accountability.staging`, owner `kingrand`, and project ID `f91c0791-4a6e-4080-88fd-5cc9a4e720bf`.

**Acceptance:** Recoverable prechange snapshot, complete manifest verification, and proven staging identity; no application source changed.

## Task 3.1: Characterize social contracts before visual changes

**Files:**
- Create: `src/feed/socialScreenContract.test.ts`
- Create: `src/discover/discoverViewState.test.ts`
- Modify: `src/navigation/routeAccessContract.test.ts`

- [ ] Add source/behavior tests that assert Feed retains cursor pagination, generation guards, Buddies/Discover switching, composer routes, story rail, post-detail navigation, and encouragement preview loading.
- [ ] Add route tests asserting `/post/[id]?encouragement=1` opens the sheet and preserves fallback to `/`.
- [ ] Add compatibility-route assertions for groups, pages, stories, notifications, search, compose, win-card, and public shares.
- [ ] Add view-state tests with this exact discriminated union:

```ts
export type DiscoverViewState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'empty'; message: string }
  | { status: 'offline'; message: string }
  | { status: 'permission-denied'; message: string }
  | { status: 'error'; message: string };
```

- [ ] Run the new tests first and require failures caused by missing contracts/view-state implementation.
- [ ] Do not change production source in this task.

Run:

```powershell
npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts src/discover/discoverViewState.test.ts src/navigation/routeAccessContract.test.ts
```

Expected before implementation: new assertions fail for missing state model or presentation contracts, while existing route assertions remain green.

## Task 3.2: Refit Feed without changing its data behavior

**Files:**
- Modify: `src/app/(app)/index.tsx`
- Create: `src/feed/SocialBrandHeader.tsx`
- Create: `src/feed/SocialModeSelector.tsx`
- Create: `src/feed/MyDayRail.tsx`
- Create: `src/feed/FeedProofCard.tsx`
- Create: `src/feed/ProofHeadlineOverlay.tsx`
- Create: `src/feed/RunRouteMetricOverlay.tsx`
- Modify: `src/feed/socialScreenContract.test.ts`

- [ ] Extract only presentational header, mode selector, My Day rail, proof typography/metrics, and post-card JSX; keep request state, paging, optimistic reactions, and navigation in the route owner.
- [ ] Implement the exact reference header: ribbon-A/wordmark, search, circular-plus create, and notification bell with unread dot.
- [ ] Implement a social-specific rounded selector with a solid cobalt selected pill; do not reuse Journey quiet tabs unchanged.
- [ ] Implement the compact composer with avatar, `Inspire us today!`, and equal `Post`, `Photo`, `Flex` actions.
- [ ] Implement deterministic My Day tile treatments for Move, Fuel, Mind, and Connect using only actual authorized model values; unavailable data renders an honest empty/unavailable state.
- [ ] Implement `FeedProofCard` as a light rounded container with a white author header, immersive image, Playfair headline, Caveat Verified annotation, route/metrics, white action strip, and avatar supporter summary. Do not add a waveform or chevron to the Feed summary.
- [ ] Preserve one FlatList, cursor pagination, refresh, load-more, generation guards, and one request per user action.
- [ ] Preserve separate scroll offsets for Buddies and Discover in refs keyed by mode and restore the selected mode offset after switching.
- [ ] Replace feed-load Alerts with an inline retry state while retaining previously loaded posts on refresh failure.
- [ ] Render explicit populated, empty, initial-loading, pagination-loading, retryable-error, offline cached/uncached, privacy-redacted, own/other, and public/restricted variants from tested inputs.
- [ ] Add failing tests for each Feed row in the required state matrix before implementing its presentation.
- [ ] Provide semantic labels, selected state for the segment, button roles, image descriptions, and minimum 44-point controls.
- [ ] Add direct contract assertions preventing a generic white content card, a Journey-tab selector, a missing four-tile My Day model, `Georgia`, or a sans/italic Verified substitute.
- [ ] Run the focused contract tests and existing public-share/video/idempotency tests.

Run:

```powershell
npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/publicShare.test.ts src/feed/videoPolicy.test.ts src/feed/runPostIdempotency.test.ts
```

Expected: all focused tests pass; no service/API function signature changes.

## Task 3.3: Refit Discover and make its states explicit

**Files:**
- Modify: `src/discover/DiscoverExperience.tsx`
- Create: `src/discover/discoverViewState.ts`
- Modify: `src/discover/discoverViewState.test.ts`

- [ ] Implement the exact `DiscoverViewState` union from Task 3.1 with a pure mapper from loading/error/network/permission/data inputs.
- [ ] Implement the approved anchors: shared header context, search/filter, For You/Nearby/Challenges/Groups filters, image-led person card, Connect action, recommended group, and challenge spotlight.
- [ ] Make the seeded disposable staging comparison fixture visually exact: Maya hero card; `Runner. Coffee lover.`; `Always up for a challenge`; Consistent/Supportive/Runner chips; Level 18/Rising Star/87% progress band; full-width Connect below the image; Sunrise Runners module; and 30-Day Consistency Challenge module.
- [ ] Use four compact Discover chips, not quiet editorial tabs or equal-size content cards.
- [ ] Keep public-only candidate/group/challenge behavior and existing buddy/group/challenge calls.
- [ ] Nearby must remain disabled with a clear explanation until location permission and a privacy-safe location query are both proven; do not fake distance or query private coordinates.
- [ ] Render distinct loading, empty, offline, permission-denied, and retryable-error states without losing the Feed mode or Feed scroll.
- [ ] Preserve search, profile, group, page, and challenge destinations and expose selected filter state to accessibility.

Run:

```powershell
npm.cmd test -- --runInBand src/discover/discoverViewState.test.ts src/feed/socialScreenContract.test.ts
```

Expected: all Discover state and navigation assertions pass.

## Task 3.4: Build the immersive Post Detail presentation

**Files:**
- Modify: `src/app/post/[id].tsx`
- Create: `src/feed/ImmersivePost.tsx`
- Create: `src/feed/immersivePostContract.test.ts`

- [ ] Write failing tests for loading, retryable error, missing/revoked fallback, own/other actions, run/non-run media, and query-open encouragement.
- [ ] Extract a presentation component that receives the already loaded post and callbacks; do not call Supabase inside it.
- [ ] Implement the approved first viewport as a full-screen runner photo with only back and overflow at the top; lower-middle Playfair headline; Caveat Verified/check; route trace; labeled metrics; author/caption below metrics; floating cream encouragement card with waveform/chevron; and a floating dark translucent rounded action bar.
- [ ] Keep comments available below or after the immersive first viewport without displacing its full-screen geometry.
- [ ] Keep `getPost`, comments, likes, media, Memories, share, menu, fallback, and query behavior unchanged.
- [ ] Guard load completions by exact route ID and mounted generation so A-to-B, ABA, blur, or unmount cannot display stale private content.
- [ ] Add explicit tested offline cached/uncached, privacy-redacted, own/other, public/restricted, media-unavailable, and comments empty/loading/error variants.
- [ ] Use a complete accessible media summary and explicit action labels; decorative overlay children must not pollute TalkBack.
- [ ] Add direct visual contract assertions for no top author header, no light action row below the image, no `Georgia`, no italic-sans Verified, and no visible bottom navigation in the immersive route.

Run:

```powershell
npm.cmd test -- --runInBand src/feed/immersivePostContract.test.ts src/feed/publicShare.test.ts src/feed/videoPolicy.test.ts
```

Expected: all Post Detail state, ownership, stale-result, and media assertions pass.

## Task 3.5: Refit Encouragement and preserve voice safety

**Files:**
- Modify: `src/feed/EncouragementBar.tsx`
- Modify: `src/feed/EncouragementSheet.tsx`
- Modify: `src/feed/VoiceEncouragementRecorder.tsx`
- Create: `src/feed/encouragementContract.test.ts`

- [ ] Write failing tests for query-open/close, supporter count, written rows, voice rows, Reply, Thank Everyone, permission denial, recording cap, preview, retry, discard, background interruption, and account/post changes.
- [ ] Implement the approved rounded cream sheet beginning near 46% viewport height over the exact dimmed Post state, with no normal-state handle or close chrome; Playfair title; `17 buddies showed up for you`; compact avatar/message rows; inline voice waveform/duration; right-aligned Reply; and one pinned full-width Thank everyone action.
- [ ] Use the visible reference messages only in seeded disposable staging comparison fixtures: Jordan `Way to get after it!`, Maya `Love the early start!`, a `0:06` voice row, Sam `You’re on fire 🔥`, and Priya `Inspiring as always.`
- [ ] Keep microphone permission explicit; denial must explain how to continue with text.
- [ ] Preserve the 10-second cap, preview-before-send, background stop/pause, and retry/discard behavior.
- [ ] Guard every async recorder/upload completion with mounted, owner, post ID, and operation generation.
- [ ] “Thank Everyone” must use the existing safe comment/encouragement seam exactly once; if atomic fan-out is not available, label it as a single public thank-you rather than implying private individual messages.
- [ ] Do not expose voice refs or playable private media in external/public share payloads.
- [ ] Keep voice creation available through an explicit secondary state without adding a second large footer action to the normal reference sheet.
- [ ] Add direct visual assertions for no visible handle/close button, no sans title, no separate supporter-only list, and no extra `Voice · 10 sec` footer in the normal reference state.
- [ ] Expose sender-only Delete, recipient Report abuse, and recipient Block sender callbacks with explicit confirmation, loading, success, retryable error, and forbidden states.
- [ ] Add red/green tests proving another user cannot see Delete, the sender cannot report/block themself, and every action stays bound to the exact owner, post, voice row, and operation generation.

Run:

```powershell
npm.cmd test -- --runInBand src/feed/encouragementContract.test.ts src/feed/publicShare.test.ts src/media/privateMedia.test.ts src/media/uploadPolicy.test.ts
```

Expected: all encouragement lifecycle, permission, privacy, and stale-operation assertions pass.

## Task 3.6: Implement serialized voice safety seams

**Files:**
- Modify: `src/feed/api.ts`
- Create: `src/feed/voiceSafety.ts`
- Create: `src/feed/voiceSafety.test.ts`
- Create only after a demonstrated missing invariant: `supabase/migrations/0093_voice_encouragement_operations.sql`
- Create: `supabase/tests/group3_voice_safety.sql`

- [ ] First characterize the existing migration `0086` sender-only delete policy and migration `0013` canonical `buddy_blocks`/`buddy_reports` ownership policies with red/green policy tests.
- [ ] Write failing tests for sender-only deletion, recipient report-abuse through `buddy_reports`, recipient block-sender through `buddy_blocks`, self-action rejection, duplicate operation rejection, account switch, and stale completion.
- [ ] Add exact API callbacks `deleteMyVoiceEncouragement`, `reportVoiceEncouragement`, and `blockVoiceEncouragementSender`; every call requires the current authenticated user and one opaque voice ID.
- [ ] Reuse the existing delete policy and canonical block/report tables. Do not create a parallel voice-specific report table, block table, or duplicate policy.
- [ ] Create migration `0093_voice_encouragement_operations.sql` only if the red tests prove a missing unique operation-ID or narrowly scoped additive RPC invariant; the migration may add only that proven delta and no replacement model.
- [ ] Run the SQL policy harness against disposable staging users and require forbidden operations to fail without revealing row contents.
- [ ] Before any linked command, require `(Get-Content supabase/.temp/project-ref).Trim()` to equal `ksvcjvwawamwyquzsizk`; any mismatch hard-stops. Never print the database password, access token, anon key, service key, or connection string.
- [ ] If and only if `0093` exists after red proof and independent security review, run `supabase db push --linked --dry-run`, inspect that only `0093` targets staging, then run `supabase db push --linked`. Production remains untouched.

Run:

```powershell
npm.cmd test -- --runInBand src/feed/voiceSafety.test.ts src/feed/encouragementContract.test.ts
if ((Get-Content supabase/.temp/project-ref).Trim() -ne 'ksvcjvwawamwyquzsizk') { throw 'Not linked to accountability staging' }
supabase test db --linked supabase/tests/group3_voice_safety.sql
# Conditional only when the reviewed 0093 migration exists:
supabase db push --linked --dry-run
supabase db push --linked
```

Expected: TypeScript tests and staging policy tests pass; no secret, token, voice
reference, or private media content appears in evidence.

## Task 3.7A: Preserve group and page routes

**Files:**
- Modify: `src/navigation/routeAccessContract.test.ts`
- Create: `src/navigation/socialGroupPageContract.test.ts`
- Modify: `src/app/groups.tsx`
- Modify: `src/app/group/[id].tsx`
- Modify: `src/app/group-new.tsx`
- Modify: `src/app/pages.tsx`
- Modify: `src/app/page/[id].tsx`
- Modify: `src/app/page-new.tsx`

- [ ] Test cold link, signed-in link, back fallback, missing/revoked target, account switch, and process-restored route intent for `/groups`, `/group/[id]`, `/group-new`, `/pages`, `/page/[id]`, and `/page-new`.
- [ ] Verify group gatekeys, member-only feeds, public page visibility, owner-only create/edit controls, and current `/pages` compatibility remain enforced.
- [ ] Make only the smallest correction required by a failing test; do not restyle supporting routes.
- [ ] Verify `/compose`, `/win-card`, and `/share/[id]` remain compatible with Group 2 contracts.

Run:

```powershell
npm.cmd test -- --runInBand src/navigation/routeAccessContract.test.ts src/navigation/socialGroupPageContract.test.ts src/entry/createFlow.test.ts src/entry/proofExport.test.ts
```

Expected: all group/page and Group 2 compatibility routes pass without lost
query parameters or unauthorized target disclosure.

## Task 3.7B: Preserve story, notification, and search routes

**Files:**
- Create: `src/navigation/socialUtilityRouteContract.test.ts`
- Modify: `src/app/story/[userId].tsx`
- Modify: `src/app/(app)/notifications.tsx`
- Modify: `src/app/search.tsx`

- [ ] Write failing tests for cold/signed-in links, back fallback, missing/revoked/private targets, account switch, and process-restored route intent.
- [ ] Prove story deletion remains owner-only, notification missing/private targets use a non-disclosing fallback, and search-history limits and public-only results remain enforced.
- [ ] Make only the smallest correction required by a failing test; do not restyle these supporting routes.
- [ ] Compare the generated route manifest to Task 3.0 and require zero missing Group 3 routes or query contracts.

Run:

```powershell
npm.cmd test -- --runInBand src/navigation/socialUtilityRouteContract.test.ts src/notifications/trigger.test.ts
```

Expected: all utility routes pass without target-existence or private metadata
disclosure.

## Task 3.8: Two-user privacy, RLS, media, and idempotency gate

**Files:**
- Create: `supabase/tests/group3_social_rls.sql`
- Create: `src/feed/socialIdempotency.test.ts`
- Create: `docs/release-evidence/2026-07-30-group3-two-user-matrix.md`

- [ ] Use two disposable staging users, never production users.
- [ ] Before the SQL harness, require the linked project ref to equal `ksvcjvwawamwyquzsizk`; any mismatch hard-stops and no key or connection string is logged.
- [ ] Write the SQL harness first and demonstrate red failures for every missing policy; write the TypeScript idempotency tests first and demonstrate red failures for every missing operation guard.
- [ ] Prove public posts are discoverable and buddy/private/group posts are visible only to authorized users.
- [ ] Prove direct `getPost`, comments, encouragers, voice rows, group/page metadata, stories, notifications, and private media cannot disclose restricted content.
- [ ] Prove own delete/edit and other-user report/hide behavior; prove other-user delete/edit is denied.
- [ ] Prove double tap, retry, reconnect, and process restart do not duplicate likes, comments, joins, follows, voice encouragements, or created posts.
- [ ] Record before/after row counts and opaque IDs only; do not record tokens, signed URLs, coordinates, secrets, or private message/media contents.
- [ ] Any additional backend correction stops this task and requires a new serialized plan amendment naming the exact migration and source files before edits.

Run:

```powershell
npm.cmd test -- --runInBand src/feed/socialIdempotency.test.ts src/feed/runPostIdempotency.test.ts
if ((Get-Content supabase/.temp/project-ref).Trim() -ne 'ksvcjvwawamwyquzsizk') { throw 'Not linked to accountability staging' }
supabase test db --linked supabase/tests/group3_social_rls.sql
```

**Acceptance:** Every required two-user row in the matrix is `PASS`; any unproven privacy boundary blocks Group 3.

## Task 3.9: Integrated verification and installed-device audit

**Files:**
- Modify: `docs/release-evidence/2026-07-30-group3-social.md`
- Create: `docs/release-evidence/2026-07-30-group3-social/device-NX769J/`
- Create: `docs/release-evidence/2026-07-30-group3-social/device-small-android/`
- Create: `docs/release-evidence/2026-07-30-group3-social/device-large-android/`

- [ ] Run focused tests, full Jest, TypeScript, changed-path ESLint, update-budget tests, and Android release budget.
- [ ] Record model, Android version, physical pixels, logical viewport, density, font scale, display scale, navigation mode, app build ID, runtime, and update ID for the primary, small, and large Android profiles.
- [ ] Verify staging identity again before an EAS action; set `APP_VARIANT=staging`, use preview environment/channel, and set `EAS_NO_VCS=1`.
- [ ] Run `npx.cmd eas-cli channel:view preview` and prove it targets a runtime-compatible preview branch/build before publishing; any runtime or build mismatch stops for a preview APK.
- [ ] Prove the candidate diff changes no dependency, native module, permission, config plugin, runtime, identity, package, bundle ID, or native asset/config field.
- [ ] Publish a preview OTA only if the diff is JavaScript/bundled-asset-only and runtime-compatible; otherwise stop for a separately approved preview APK.
- [ ] Install/activate on the agreed NX769J device and test the complete Feed-to-Discover-to-Post-to-Encouragement-to-Post journey.
- [ ] Capture populated, empty, loading/error/retry, offline, permission-denied, own/other, private/redacted, background/relaunch, and reconnect states.
- [ ] Capture normal, 130%, and 200% text plus reduced motion and TalkBack focus traversal on the primary profile; use small and large profiles for responsive/clipping/touch validation; restore every device setting.
- [ ] Crop each approved reference viewport and generate actual, side-by-side, 50% overlay, and absolute-difference images with recorded crop rectangles and anchor measurements.
- [ ] Normalize only status-bar clock/icons and documented dynamic content; never stretch one axis independently.
- [ ] Require every named anchor within 4 logical pixels, every major width/height within 5%, and font baselines within 6 logical pixels only for documented Android font variance.
- [ ] Measure Feed header/selector/composer/My Day/hero/title/metrics/action strip; Discover header/selector/search/chips/person card/Connect/group/challenge; Post headline/Verified/route/metrics/author/encouragement/action bar; and Sheet top/title/first row/voice row/Reply column/primary action.
- [ ] Do not geometry-match bottom navigation for these four source panels because it is source-truncated; preserve the separately approved Group 1 shell behavior.
- [ ] Require an independent visual auditor and independent privacy/security auditor to return strict `PASS`.
- [ ] Block completion until the product owner approves the installed staging evidence.
- [ ] Reference names, messages, routes, metrics, and counts are disposable staging comparison fixtures only. Production and normal user sessions must render actual authorized data or an honest empty/unavailable/redacted state; fixture values are never fallbacks.

Run:

```powershell
$env:APP_VARIANT = 'staging'
$env:EAS_NO_VCS = '1'
npm.cmd test -- --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint "src/app/(app)/index.tsx" "src/app/post/[id].tsx" src/feed src/discover src/navigation
npm.cmd run test:update-budget
npx.cmd expo config --type public
npm.cmd run release:budget
npx.cmd eas-cli channel:view preview
npx.cmd eas-cli update --channel preview --environment preview --message "Group 3 social candidate" --non-interactive
```

Expected: zero test/type/scoped-lint failures; update below the unchanged limit; installed Android audit and two-user matrix both `PASS`.

## Plan self-review

- Spec coverage: all four Group 3 references, required states, supporting routes, two-user privacy, media, idempotency, accessibility, installed comparison, rollback, and staging identity are assigned.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or unowned acceptance exists.
- Type consistency: `DiscoverViewState` is defined once and reused unchanged; existing `FeedMode`, `FeedPost`, `PostAudience`, and proof/share contracts remain authoritative.
- Task size: every source task owns a bounded screen/component set; backend work is conditional, serialized, and cannot silently expand the UI tasks.
- OTA safety: no native/config/package change is planned; any discovered need explicitly stops the OTA path.
