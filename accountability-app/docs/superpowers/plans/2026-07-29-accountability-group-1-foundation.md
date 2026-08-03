# AccountAbility Group 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved AccountAbility brand, visual tokens, shared primitives, and quiet five-destination navigation without changing feature APIs or user data.

**Architecture:** Add compatible semantic tokens and pure presentational primitives, then migrate only the app shell and representative gallery. Preserve provider order, route names, hidden routes, onboarding guards, unread behavior, and service boundaries.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, Expo Router, TypeScript, Jest, `react-native-svg`, `expo-font`, `expo-image`, and `react-native-safe-area-context`.

---

## Required reading

- [Expo SDK 56 reference](https://docs.expo.dev/versions/v56.0.0/)
- [Expo Font SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/font/)
- [Expo Image SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/image/)
- [Expo Splash Screen SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/splash-screen/)
- [react-native-svg SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/svg/)
- Expo Router Stack/Tabs pages linked from the SDK 56 reference

SDK 56 targets React Native 0.85 and React 19.2.3, matching this project.
Runtime-bundled `@expo-google-fonts/playfair-display` is the approved editorial
serif family and `@expo-google-fonts/caveat` is the approved handwritten family.
Inter remains the interface family and Anton is limited to approved hero
metrics. Their first installed-device gallery remains a product-owner approval
gate. Embedding fonts through the config plugin would be a native configuration
change requiring a new APK and is not part of Group 1.

## Ownership

### Design-system implementer

Owns only:

- `src/ui/theme.ts`
- new `src/ui/typography.ts`
- new `src/ui/surfaces.tsx`
- new `src/ui/navigation.tsx`
- new colocated tests for those files

### Brand implementer

Owns only:

- `src/ui/BrandMark.tsx`
- `src/ui/brandGeometry.ts`
- `src/ui/brandGeometry.test.ts`
- `scripts/generate-brand-assets.mjs`
- approved files under `assets/images/`
- new brand tests/evidence

### Shell implementer

Owns only:

- `src/app/_layout.tsx`
- `src/app/(app)/_layout.tsx`
- `src/app/share/[id].tsx`
- `src/navigation/routeAccessContract.ts`
- `src/navigation/routeAccessContract.test.ts`
- `src/ui/GlassTabBar.tsx`
- `src/ui/floatingTabBar.ts`

### Integration owner

Owns:

- Group 1 evidence and comparison gallery
- cross-owner imports
- final verification
- `package.json` and `package-lock.json` dependency-only changes

Feature screens, APIs, Supabase, R2, finance services, run tracking, and
migrations are frozen in Group 1.

## Task 1.0: Prove protected and public cold-deep-link behavior

This task must pass before Tasks 1.4 or 1.5 may modify either layout.

**Files:**
- Create: `src/navigation/routeAccessContract.ts`
- Create: `src/navigation/routeAccessContract.test.ts`
- Modify: `src/app/_layout.tsx`
- Modify: `src/app/share/[id].tsx`

- [ ] **Step 1: Write failing session-state contract tests**

Test this exact matrix:

```ts
expect(resolveColdLink('/body', 'signed-out')).toBe('authenticate-and-resume');
expect(resolveColdLink('/journey-path', 'signed-out')).toBe('authenticate-and-resume');
expect(resolveColdLink('/business', 'signed-out')).toBe('authenticate-and-resume');
expect(resolveColdLink('/share/opaque-id', 'signed-out')).toBe('open-public-web');
expect(resolveColdLink('/body', 'signed-in')).toBe('open-protected');
expect(resolveColdLink('/journey-path', 'signed-in')).toBe('open-protected');
expect(resolveColdLink('/business', 'signed-in')).toBe('open-protected');
expect(resolveColdLink('/share/opaque-id', 'signed-in')).toBe('resolve-authenticated-share');
```

Restricted, revoked, missing, and private shares must remain blocked or require
authentication according to the route contract.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm.cmd test -- src/navigation/routeAccessContract.test.ts --runInBand`  
Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Add explicit route registration**

Register `/body`, `/journey-path`, and `/business` inside the signed-in
protected Stack. Register `/share/[id]` outside both auth groups. Signed-out
shares must never call the authenticated resolver; they open the exact canonical
sanitized HTTPS card from `publicShareUrl(id)`. Signed-in shares may use the
authenticated resolver and open the native post only when normal RLS allows it;
otherwise they fall back to the sanitized HTTPS card. Preserve all existing
routes and provider order. Do not widen database grants or add an anonymous
mobile data API.

- [ ] **Step 4: Run cold-launch integration checks**

For each path, test signed-out launch, successful authentication/resume,
signed-in launch, expired session, back fallback, and missing target. Record
the device automation or manual evidence and final screen.

- [ ] **Step 5: Gate**

Focused tests, TypeScript, changed-file lint, and installed-device cold-link
checks must pass before any other shell modification starts.

## Task 1.1: Lock the approved brand geometry

**Files:**
- Modify: `src/ui/BrandMark.tsx`
- Modify: `scripts/generate-brand-assets.mjs`
- Create: `src/ui/brandGeometry.ts`
- Create: `src/ui/brandGeometry.test.ts`
- Regenerate only: `assets/images/icon.png`
- Regenerate only: `assets/images/android-icon-foreground.png`
- Regenerate only: `assets/images/android-icon-monochrome.png`
- Regenerate only: `assets/images/logo-mark.png`
- Regenerate only: `assets/images/splash-icon.png`
- Regenerate only: `assets/images/logo.png`
- Regenerate only: `assets/images/wordmark.png`
- Regenerate only: `assets/images/favicon.png`

- [ ] **Step 1: Extract one shared geometry definition**

Create exported constants for the `96×88` mark view box, two head circles, and
the two ribbon-person paths. Both React Native SVG and the asset generator must
consume the same constants rather than duplicating path strings.

- [ ] **Step 2: Write the failing geometry tests**

Tests must assert:

```ts
expect(BRAND_VIEW_BOX).toBe('0 0 96 88');
expect(BRAND_HEADS).toHaveLength(2);
expect(BRAND_RIBBONS).toHaveLength(2);
expect(BRAND_COLORS.cobalt).toBe('#155EEF');
expect(BRAND_WORDMARK).toBe('AccountAbility');
```

They must also snapshot the exact path/circle values so accidental geometry
drift fails review.

- [ ] **Step 3: Run the focused test and confirm it fails before extraction**

Run: `npm.cmd test -- src/ui/brandGeometry.test.ts --runInBand`  
Expected before implementation: FAIL because `brandGeometry.ts` does not exist.

- [ ] **Step 4: Implement the shared geometry and accessible mark**

`BrandMark` must accept size/color/label, preserve its open centre and
asymmetrical overlap, and expose an image role with the approved label.

- [ ] **Step 5: Regenerate assets and verify dimensions**

Run: `node scripts/generate-brand-assets.mjs`  
Verify each expected file exists, has the required dimensions, and no unrelated
asset changed.

- [ ] **Step 6: Run focused tests and inspect generated assets**

Expected: focused tests PASS; visual comparison uses the approved reference at
notification, header, 96 px, and app-icon sizes.

## Task 1.2: Introduce compatible semantic tokens

**Files:**
- Modify: `src/ui/theme.ts`
- Create: `src/ui/theme.test.ts`
- Create: `src/ui/typography.ts`

- [ ] **Step 1: Write failing token-contract tests**

Tests must require:

```ts
expect(colors.primary).toBe('#155EEF');
expect(colors.navy).toBe('#081A3A');
expect(colors.cream).toBe('#F7F4EC');
expect(spacing.touch).toBeGreaterThanOrEqual(44);
expect(type.editorialTitle.fontFamily).toBe(font.serif);
expect(type.metric.fontVariant).toContain('tabular-nums');
```

- [ ] **Step 2: Run the tests and confirm missing semantic roles fail**

Run: `npm.cmd test -- src/ui/theme.test.ts --runInBand`

- [ ] **Step 3: Add tokens without breaking current imports**

Retain all existing token names as compatibility aliases. Add semantic surface,
ink, border, status, category, spacing, radius, elevation, icon, motion, and
typography roles. Do not globally replace existing colors in feature screens.

- [ ] **Step 4: Define typography helpers**

Provide typed helpers using Playfair Display for editorial headings, Inter for
interface heading/body/label, Caveat for handwritten annotation, and tabular
Inter for metrics. If either runtime font does not render consistently on the
target Android device, stop and return the font gallery to the product owner;
do not substitute another family silently.

- [ ] **Step 5: Verify**

Run focused tests, TypeScript, and changed-file lint. Expected: no new lint
failure in changed files.

## Task 1.3: Build shared visual primitives

**Files:**
- Create: `src/ui/surfaces.tsx`
- Create: `src/ui/navigation.tsx`
- Create: `src/ui/primitives.test.ts`

- [ ] **Step 1: Write failing contract tests**

Cover default accessibility roles/labels, 44-point minimum hit area, selected
state, disabled state, and semantic token usage for:

- `EditorialHeading`
- `PrimaryButton`
- `OutlinedButton`
- `IconButton`
- `CreamCard`
- `HeroImageCard`
- `SegmentedControl`
- `QuietTopTabs`
- `RoundedBottomSheetSurface`

- [ ] **Step 2: Confirm tests fail for absent exports**

Run: `npm.cmd test -- src/ui/primitives.test.ts --runInBand`

- [ ] **Step 3: Implement minimal pure primitives**

Primitives accept content and state only. They must not import feature APIs,
Supabase, Router, finance, feed, run, or authentication services.

- [ ] **Step 4: Verify interaction and accessibility**

Check pressed/selected/disabled states, 44-point hit targets, reduced-motion
behavior where animated, Dynamic Type wrapping, and safe-area-neutral layout.

- [ ] **Step 5: Run focused tests, TypeScript, and changed-path lint**

Expected: focused tests and TypeScript PASS; no new changed-file lint errors.

## Task 1.4: Refit the five-destination tab bar

**Files:**
- Modify: `src/ui/GlassTabBar.tsx`
- Modify only if necessary: `src/ui/floatingTabBar.ts`
- Modify: `src/app/(app)/_layout.tsx`
- Create: `src/ui/GlassTabBar.test.ts`

- [ ] **Step 1: Write failing tab-contract tests**

Assert visible order and labels:

```ts
expect(visibleTabs).toEqual(['Feed', 'Finance', 'Journey', 'Run', 'Messages']);
```

Also assert hidden Today/Profile/Notifications routes are absent from visible
items, selected state uses quiet ink plus an indicator, and Journey uses the
approved mark without a filled/elevated holder.

- [ ] **Step 2: Preserve behavior in a route checklist**

Record existing unread Messages dot, haptics, tab press event prevention,
immersive Run hiding, hidden route reachability, onboarding redirect, and
presence heartbeat.

- [ ] **Step 3: Implement presentation-only changes**

Do not change route names, provider behavior, API calls, onboarding logic, or
hidden route registration.

- [ ] **Step 4: Verify**

Run focused tests, TypeScript, changed-path lint, and manual navigation on
small/large Android layouts. Confirm content is not covered by the fixed bar.

## Task 1.5: Preserve the root provider and font-loading contract

The integration owner performs the dependency/lockfile step. The shell
implementer owns the root-layout test and runtime font loading. They do not edit
the same file concurrently.

**Files:**
- Modify only if required by approved runtime fonts: `src/app/_layout.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/navigation/rootLayoutContract.test.ts` (kept outside the Expo Router
  route tree so Node-only contract-test imports are never bundled)

- [ ] **Step 1: Write a provider-order contract test**

The test must require:

```text
AuthProvider
  ActivitySyncProvider
    ProProvider
      RootNavigator
      ModerationGate
      ToastHost
      ConfirmHost
      PostMenuHost
```

- [ ] **Step 2: Test font fallback/loading behavior**

Require that the shell waits while required runtime fonts load and never hides
the application permanently after a load error. Do not add a config plugin in
this task.

- [ ] **Step 3: Install exact runtime font packages**

Run:

```powershell
npx.cmd expo install @expo-google-fonts/playfair-display @expo-google-fonts/caveat
```

Review the lockfile diff. No native plugin, permission, Expo SDK upgrade, or
unrelated dependency change is allowed.

- [ ] **Step 4: Make only the minimal font-role change**

Provider order, notification/location task imports, referral handling, cleanup,
auth protection, public legal routes, and back fallback must remain unchanged.

- [ ] **Step 5: Verify signed-out and signed-in route behavior**

Exercise sign-in, onboarding redirect, Feed, hidden routes, cold back fallback,
and legal routes.

## Task 1.6: Create installed-device foundation evidence

**Files:**
- Create: `docs/release-evidence/2026-07-29-group1-foundation.md`
- Create under evidence directory: component-gallery screenshots and comparison images

- [ ] **Step 1: Run fresh automated verification**

Run TypeScript, focused tests, full Jest, update-budget tests, and changed-path
lint. Record exact commands and exit codes.

- [ ] **Step 2: Assert staging identity**

Set `APP_VARIANT=staging`; verify app name, scheme, Android/iOS identity, preview
environment/channel, and EAS project ID before any EAS action.

- [ ] **Step 3: Determine update versus APK**

If Group 1 changed only JavaScript and bundled assets compatible with the
installed runtime, prepare a preview-channel update proposal. If native font
embedding, plugin configuration, permissions, or runtime changed, require a new
preview APK. Do not publish or build until the lead authorises the exact action.

- [ ] **Step 4: Capture primary visual anchors**

Capture and compare the approved mark, horizontal wordmark, brand header, cream
card, editorial/sans/metric type roles, segmented control, bottom sheet surface,
and five-item tab bar at the agreed device profile.

- [ ] **Step 5: Independent audits**

Dispatch, in order:

1. spec-compliance reviewer;
2. code-quality/security reviewer;
3. installed-device visual/accessibility auditor.

Every blocker/high finding returns to its implementer and is re-audited.

## Group 1 stop condition

Group 1 is not complete until:

- brand geometry and all generated assets are independently approved;
- semantic tokens and primitives pass focused tests;
- the tab bar preserves all route behavior;
- provider order and auth/onboarding behavior remain intact;
- no new changed-file lint failure exists;
- installed Android evidence passes the reference comparison procedure; and
- the product owner approves the Group 1 evidence package.
