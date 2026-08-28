# Dark-only visual system release evidence

This directory is the staging-only evidence index for the permanent charcoal/black + neon visual system. Code and static verification are recorded here; physical-phone verification is pending and must be completed by the release owner.

## Static audit

Required command (run from the `accountability-app` project root):

```powershell
rg -n "mode === 'light'|mode == 'light'|themeColors\('light'\)|Light appearance|Dark appearance|#fff\b|#ffffff\b|#F4F5F1\b" src -g '*.tsx' -g '*.ts'
```

Case-variant and native-config follow-ups:

```powershell
rg -n "#FFF\b|#FFFFFF\b" src -g '*.tsx' -g '*.ts'
rg -n "#fff\b|#ffffff\b|#FFF\b|#FFFFFF\b|#F4F5F1\b|userInterfaceStyle|backgroundColor" app.json app.config.js
```

Classification after app-chrome fixes:

- App chrome fixed: dead light branches were removed from `src/entry/CreateHub.tsx`, `src/entry/AchievementSharePrompt.tsx`, `src/achievements/MissionsList.tsx`, and `src/achievements/ChallengesCarousel.tsx`; light fallback chrome was removed from `src/ui/floatingTabBar.ts`; `src/ui/Toast.tsx` now uses dark semantic surface/text tokens; status/neon action foregrounds were tokenized in `src/activity/RunTrackerOpenMap.tsx` and `src/app/achievements.tsx`. Buddy Medals now derives its canvas, cards, raised/muted surfaces, borders, ink, action, inverse, and success chrome from the public permanent-dark theme with its legacy light/navy palette removed. Rank Carousel now uses the same semantic dark chrome and a zero-opacity Glass plate, while leaving the `RankBadge` artwork unchanged. Home and Menu retain their brand gradients behind a reliable 72% charcoal plate so white copy/icons meet contrast at the brightest endpoints, and the Menu medal uses semantic inverse ink on amber. The unused persisted-theme key was removed from `src/ui/AppThemeProvider.tsx`.
- Natural art, map, or export colors retained unchanged: `src/achievements/Medal.tsx`, `src/achievements/medalArt.ts`, `src/achievements/MedalIcon.tsx`, `src/achievements/MissionIcon.tsx`, `src/achievements/RankBadge.tsx`, `src/activity/RouteTrace.tsx`, `src/app/invite-card.tsx`, `src/buddy/BuddyCardFace.tsx`, `src/buddy/palette.ts`, `src/compete/CompeteUI.tsx`, `src/entry/ProofCaptureCard.tsx`, `src/feed/Avatar.tsx`, `src/feed/ExternalShareCard.tsx`, `src/progress/ProgressShareCard.tsx`, `src/share/ShareStudio.styles.ts`, `src/ui/brandGeometry.ts`, `src/ui/osmHtml.ts`, and `src/ui/ProgressRing.tsx`. These literals define medal sparkle/highlight art, route/map markers, generated share cards, Buddy Card themes, avatar/leaderboard artwork, or exported brand geometry; they are not app canvas/card chrome.
- White copy/icons deliberately retained over dark imagery, gradients, or scrims: `src/activity/beauty/BeautyEditor.tsx`, `src/activity/RunShareOptionSelect.tsx`, `src/app/(app)/index.tsx`, `src/app/(app)/profile.tsx`, `src/app/memories.tsx`, `src/app/menu.tsx`, `src/app/story/[userId].tsx`, `src/buddy/BuddyCardProfilePhoto.tsx`, `src/feed/ImmersivePost.tsx`, `src/feed/PostImage.tsx`, `src/feed/ProofHeadlineOverlay.tsx`, `src/feed/RunRouteMetricOverlay.tsx`, `src/feed/VerifiedRunOverlay.tsx`, `src/home/HomeHeader.tsx`, `src/journey/JournalScreen.tsx`, `src/media/PhotoEditor.tsx`, and `src/memories/SaveToMemories.tsx`. The audited literals sit on photo/video viewers, dark media controls, scrims, or dark branded hero gradients.
- Test-only matches retained: every remaining match under `*.test.ts` or `*.test.tsx` is a normalization fixture (`light` input must resolve to dark), a negative source-contract assertion forbidding light branches/literals (including the retired Buddy Medals navy values), or an expectation protecting intentional art/export/overlay colors. `src/ui/brandGeometry.test.ts` protects the exported historical SVG geometry rather than app chrome.
- App configuration is exact dark-only chrome: top-level background, adaptive-icon background, and splash background are `#0B0D0B`; `userInterfaceStyle` is `dark`. No white or retired warm-light config match remains.

No natural media, map, medal art, Buddy Card art, or generated share/export design was recolored by this task.

## Verification record

| Check | Command | Result |
| --- | --- | --- |
| Focused RED | `npm test -- --runInBand src/ui/darkOnlyVisualSystem.test.ts src/ui/appWideColorSystemContract.test.ts` | Recorded: failed for missing warning-soft role and unused legacy storage key |
| Final hardening RED | Buddy/Rank/Home/app-wide focused contracts | Recorded: Buddy legacy palette, Rank appearance branches, Home button roles, and retired navy literals failed before source changes; the rendered Home harness then failed specifically on the absent button role |
| Focused audit + Buddy/Trophy/Home/Menu GREEN | `npm test -- --runInBand src/ui/darkOnlyVisualSystem.test.ts src/ui/appWideColorSystemContract.test.ts src/entry/residualUtilityAppearanceContract.test.ts src/achievements/trophyCaseAppearanceContract.test.ts src/ui/Toast.stateContract.test.ts src/ui/GlassTabBar.test.ts src/buddy/BuddyMedalsGalleryContract.test.ts src/navigation/menuAppearanceContract.test.ts src/home/HomeHeader.accessibility.test.tsx` | Passed: 9 suites, 66 tests |
| Home/Menu contrast and accessibility GREEN | `npm test -- --runInBand src/navigation/menuAppearanceContract.test.ts src/navigation/financeRouteRemovalContract.test.ts src/home/HomeHeader.accessibility.test.tsx` | Passed: 3 suites, 23 tests; bright-endpoint and week-row text ≥4.5:1, meaningful icons ≥3:1, and all three labeled Home actions render as buttons |
| Full Jest suite | `npm test -- --runInBand` | Passed: 276 suites, 3,218 tests, 1 snapshot |
| Lint | `npm run lint -- --quiet` | Passed |
| TypeScript | `npx tsc --noEmit` | Passed |
| Whitespace | `git diff --check` | Passed (line-ending conversion warnings only; no whitespace errors) |
| Staging Android phone | staging APK on `com.awldesk.accountability.staging` | Pending release-owner verification; not claimed here |

## Representative staging phone checklist

- [ ] Cold launch: charcoal root and splash have no white flash; adaptive icon background is charcoal.
- [ ] Device set to Light appearance: app still launches and remains dark.
- [ ] Auth/onboarding, Home, Menu, Help, and Legal use charcoal canvas, dark cards, approved text hierarchy, and neon actions; Home’s three labeled actions announce as buttons.
- [ ] Home week-row native blur remains visually legible on the physical phone; its automated non-blur fallback text contrast is at least 4.5:1.
- [ ] Create hub and achievement-share prompt contain no cream/light card islands.
- [ ] Trophy Case missions/challenges and Rank Carousel use dark semantic cards; status, disabled, and neon action foregrounds remain readable while rank art remains unchanged.
- [ ] Buddy Medals loading, error, unavailable, medal, and completed-challenge states use charcoal semantic chrome while medal art remains unchanged.
- [ ] Run tracker/map controls, danger action, toast, and floating tab chrome remain readable and dark.
- [ ] Feed, story, Memories, photo editor, route maps, medal art, Buddy Card art, and generated share cards retain natural media/art colors.
- [ ] Primary/secondary text, neon inverse text, meaningful action/danger borders, success/danger/warning pairs, and disabled states match the automated contrast contract.

## Staging and evidence guardrails

- Use only Android `preview` internal distribution with `APP_VARIANT=staging` and `EAS_NO_VCS=1` from this project directory.
- The installed package must be `com.awldesk.accountability.staging` and the label must be `AccountAbility Staging`. Confirm package identity before install or capture.
- Never build, update, install, or publish the production profile/channel for this evidence task.
- Do not stage APKs, screenshots, UI XML dumps, or device-specific directories. Only this README belongs in Git.
- Keep credentials out of screenshots/XML and redact notifications, email addresses, tokens, coordinates, and private media before sharing evidence.

Evidence names should be ordered and paired when UI XML is useful:

```text
01-cold-launch-dark.png
02-system-light-app-dark.png
03-home-menu-dark.png
04-create-hub-dark.png
05-achievement-share-dark.png
06-trophy-case-dark.png
07-run-tracker-toast-dark.png
08-media-art-preserved.png
NN-<screen>-dark.xml
staging-preview-<eas-build-id>.apk  # local evidence only; never stage
```
