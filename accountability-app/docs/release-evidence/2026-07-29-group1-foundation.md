# Group 1 Foundation Evidence

Initial automated-verification capture: 2026-07-29 07:55:19 +08:00
(Australia/Perth)  
Last updated after successful staging build: 2026-07-29 09:22:56 +08:00
(Australia/Perth)  
Branch: `codex/offline-beauty-safety`  
Scope: Group 1 brand, tokens, primitives, navigation shell, fonts, route
contracts, and the authorised Android staging build. No production, submit,
OTA-update, database, or secret action was performed.

## Decision summary

- Automated foundation gate: **PASS**
- Staging identity gate: **PASS**
- Diff hygiene: **PASS** (`git diff --check`)
- Changed-path lint: **KNOWN PRE-EXISTING EXCEPTION** — one proven
  pre-existing error remains in a shared layout; this is not an overall lint
  PASS
- Android staging APK build: **PASS — FINISHED**
- Installed Android visual/accessibility gate: **BLOCKED_DEVICE — physical
  installation/ADB connection required**
- Production/submit/OTA action: **NOT RUN**

Group 1 itself uses JavaScript/TypeScript, bundled images, runtime-loaded
`@expo-google-fonts` packages, and the development-only `sharp` generator. It
does not add a native font plugin, permission, runtime-version change, or native
module. However, the approved app icon, adaptive icon, monochrome icon, and
splash assets compile into native application resources. The full approved
Group 1 outcome therefore requires a **new staging APK**.

The complete dirty worktree compared with Git `HEAD` also contains older,
out-of-scope `app.json` plugin/permission and iOS icon changes (`expo-audio`,
`expo-video`, microphone/media permission configuration, and the iOS icon
path). Those changes independently require a new APK/native build.

An OTA update could preview only compatible JavaScript and in-app asset changes
on an already compatible staging runtime. It cannot deliver or validate the
approved native icon/adaptive-icon/monochrome-icon/splash outcome and therefore
must not be used as the Group 1 completion path.

## Staging identity

Command:

```powershell
$env:APP_VARIANT='staging'
npx.cmd expo config --type public --json
Remove-Item Env:APP_VARIANT
```

Exit code: `0`

| Field | Observed value | Result |
|---|---|---|
| Name | `AccountAbility Staging` | PASS |
| Slug | `accountability-app` | PASS |
| Scheme | `accountabilityapp-staging` | PASS |
| Android package | `com.awldesk.accountability.staging` | PASS |
| iOS bundle ID | `com.awldesk.accountability.staging` | PASS |
| `extra.appVariant` | `preview` | PASS |
| EAS project ID | `f91c0791-4a6e-4080-88fd-5cc9a4e720bf` | PASS |
| Preview environment | `preview` | PASS |
| Preview channel | `preview` | PASS |

No secret or environment value is recorded.

## Fresh automated verification

### Focused Group 1 suites

Command:

```powershell
npm.cmd test -- src/navigation/routeAccessContract.test.ts src/ui/brandGeometry.test.ts src/ui/theme.test.ts src/ui/primitives.test.ts src/ui/GlassTabBar.test.ts src/navigation/rootLayoutContract.test.ts --runInBand
```

Exit code: `0`

- Suites: 6 passed / 6
- Tests: 52 passed / 52
- Snapshots: 1 passed / 1

### TypeScript

Command: `npx.cmd tsc --noEmit`  
Exit code: `0`  
Result: PASS

### Full Jest

Command: `npm.cmd test -- --runInBand`  
Exit code: `0`

- Suites: 57 passed / 57
- Tests: 701 passed / 701
- Snapshots: 1 passed / 1

### Update-budget tests

Command: `npm.cmd run test:update-budget`  
Exit code: `0`

- Tests: 3 passed / 3
- Fail/cancel/skip: 0

### Changed-path lint

Command: exact-file ESLint across the Group 1 layouts, public-share route,
route contract, brand contract/generator, semantic tokens, primitives,
navigation, and their tests.

Exit code: `1`

The only finding is
`src/app/(app)/_layout.tsx:88 react-hooks/set-state-in-effect`. The exact
`setOnboarded(null)` line is present in Git `HEAD`, proving that it predates the
Group 1 presentation-only diff. All new Group 1 files and changed Group 1 lines
produced no lint finding. No autofix or unrelated refactor was run.

### Git checks

- `git diff --check`: exit `0`, PASS
- Branch: `codex/offline-beauty-safety`
- Expanded dirty status count: 592 entries
- Existing unrelated changes were preserved.
- At this initial pre-build verification point, no commit, reset, clean, stash,
  build, update, or deployment had been performed. The later separately
  authorised staging build is documented in the next section.

## Staging build execution

The separately authorised staging APK completed successfully.

| Field | Verified value |
|---|---|
| Build ID | `4dd4e12f-b880-4741-a7c5-5cd5ca05ec19` |
| Status | `FINISHED` |
| Platform | Android |
| Profile / distribution | `preview` / internal |
| Expo SDK | 56 |
| App version | `1.0.0` |
| Android build number | 1 |
| Artifact | present |
| Completed | `2026-07-29T01:16:34.060Z` |
| Expires | 2026-08-12 |

Stable install page:

<https://expo.dev/accounts/kingrand/projects/accountability-app/builds/4dd4e12f-b880-4741-a7c5-5cd5ca05ec19>

Final pre-build verification:

- Full Jest: 57 suites / 701 tests passed.
- TypeScript `--noEmit`: passed.
- Final build metadata: verified against the finished staging build.

Production was untouched. The build was not submitted to a store, and no EAS
OTA update was published.

### Failed attempts and corrective action

The failed attempts are retained as evidence rather than hidden:

1. The initial upload archive was too large. This was corrected by adding exact
   root `.easignore` exclusions for non-runtime material; application source
   required by the build was not broadly discarded.
2. Build `8526...` failed because the npm lock data was missing the required
   `emnapi` entries. The lock was repaired using npm `10.9.4` lock-only
   generation and checked with a dry run before rebuilding.
3. Build `d674...` failed because Expo Router bundled the Node-only
   `rootLayoutContract` test. The test was moved to `src/navigation`, and the
   runtime contract was exposed through a local eager export so the application
   bundle no longer included the Node-only test dependency.

## Release classification and device next action

Full Group 1 release classification: **STAGING APK REQUIRED**.

An OTA may be useful later for a separately scoped JS-only preview, but it
cannot deliver the full approved Group 1 native-resource outcome and is not an
acceptable completion or approval path.

The staging APK now exists. Exact next action:

1. the user installs the finished staging APK from the stable install page on a
   physical Android device;
2. connect that device with ADB available;
3. execute the complete installed-device matrix below; and
4. return the captured evidence for independent re-audit and product-owner
   approval.

This is the only remaining `BLOCKED_DEVICE` gate.

## Installed-device and visual evidence gate

The staging artifact is ready, but no physical Android installation or ADB
connection has been supplied to this environment. No device was enumerated and
no screenshots were captured. This gate remains `BLOCKED_DEVICE`; screenshots,
overlays, difference images, cold-link checks, Dynamic Type, safe areas,
reduced motion, and TalkBack cannot be claimed.

Required installed Android matrix:

- [ ] actual-device screenshots for every primary visual anchor
- [ ] reference/actual side-by-side comparisons
- [ ] 50% overlays and difference images
- [ ] approved two-person ribbon mark at notification/header/96 px/icon sizes
- [ ] native launcher icon, adaptive icon, monochrome icon, and splash
- [ ] horizontal `AccountAbility` wordmark and compact brand header
- [ ] warm cream card and restrained border/elevation
- [ ] Playfair editorial, Inter interface, Caveat annotation, tabular metric
- [ ] segmented control selected/unselected states
- [ ] rounded bottom-sheet surface
- [ ] quiet five-item bar: Feed, Finance, Journey, Run, Messages
- [ ] Journey mark without a filled/elevated holder
- [ ] signed-out protected cold link → authentication → resume target
- [ ] signed-in protected cold link opens target
- [ ] expired-session cold link and missing/revoked target fallback
- [ ] public-share cold link and browser-return behavior
- [ ] TalkBack announces bottom-sheet title, controls, selected/disabled state,
      and preserves predictable focus on open/close
- [ ] TalkBack announces tab labels/selected state and Messages unread state
- [ ] TalkBack announces the Journey destination/mark meaning without duplicate
      or decorative noise
- [ ] 130% font scale: no clipping, overlap, or inaccessible control
- [ ] 200% font scale: wrapping/reflow remains operable and understandable
- [ ] small Android safe-area profile: no system-bar or fixed-tab obstruction
- [ ] large Android safe-area profile: hierarchy and reachability preserved
- [ ] reduced-motion setting: no essential meaning depends on motion
- [ ] unread Messages dot, immersive Run hiding, and hidden-route reachability
- [ ] 44-point targets, contrast, keyboard/back behavior, and focus restoration

Approved target-output anchor:

`C:\Users\KinGrand\.codex\generated_images\019fa8d8-4e01-7fb0-86b0-dca741695df2\call_7a6i52w9jic4lv2S8lHh8tgm.png`

The evidence directory contains the capture manifest and deliberately contains
no fabricated actual-device image.

## Remaining gates

1. Install the finished staging APK on a physical Android device using the
   stable install page.
2. Connect the device with ADB available.
3. Run the complete visual, cold-link, authentication/resume, browser-return,
   TalkBack, font-scale, safe-area, and reduced-motion matrix.
4. Capture actual/reference/side-by-side/50%-overlay/difference evidence.
5. Complete independent visual/accessibility re-audit.
6. Obtain product-owner approval for the Group 1 evidence package.

There is no remaining build blocker. Production, store submission, and OTA
publication remain out of scope and untouched.
