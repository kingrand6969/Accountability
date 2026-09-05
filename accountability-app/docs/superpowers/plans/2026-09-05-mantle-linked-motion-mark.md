# Mantle Linked Motion Mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Mantle symbol everywhere with the approved compact linked-motion mark while preserving the existing wordmark, charcoal/chartreuse palette, product behavior, and dashboard layout.

**Architecture:** Keep `src/ui/brandGeometry.ts` as the only geometry authority. The React Native renderer will use a horizontal lockup frame for on-screen use, while the existing asset generator will consume the same two paths and endpoint nodes through square safe-zone frames for launcher, adaptive, splash, favicon, and exported lockups. Contract tests will lock the geometry, aspect ratio, raster safety, and every established app surface before a staging-only APK is installed in place for device verification.

**Tech Stack:** Expo SDK 56, React Native 0.85, TypeScript 6, `react-native-svg`, Jest with `jest-expo`, Node.js, Sharp, Expo EAS preview builds, Android `aapt2`, Android `adb`.

---

## File map

- `src/ui/brandGeometry.ts` — canonical vector paths, endpoint nodes, colors, wordmark, and separate lockup/general/adaptive render frames.
- `src/ui/BrandMark.tsx` — reusable React Native SVG renderer with the approved horizontal on-screen proportion.
- `src/ui/BrandWordmark.tsx` — compact and standard header lockups; wordmark typography remains unchanged.
- `src/ui/brandGeometry.test.ts` — geometry identity, safe-zone, generator, and generated-raster contracts.
- `src/ui/BrandMark.test.tsx` — renderer contract for canonical geometry, aspect ratio, accessibility, and rounded paths.
- `src/ui/BrandWordmark.test.tsx` — lockup sizing, semantic theme color, typography, and app-surface coverage.
- `scripts/generate-brand-assets.mjs` — renders the canonical geometry into all eight established PNG assets.
- `assets/images/icon.png` — 1024 px launcher icon.
- `assets/images/android-icon-foreground.png` — 432 px Android adaptive foreground.
- `assets/images/android-icon-monochrome.png` — 432 px Android monochrome adaptive foreground.
- `assets/images/logo-mark.png` — 400 px transparent mark.
- `assets/images/splash-icon.png` — 512 px splash asset.
- `assets/images/logo.png` — 900 × 193 full lockup.
- `assets/images/wordmark.png` — 600 × 129 full lockup.
- `assets/images/favicon.png` — 64 px favicon.

The implementation deliberately does not modify Feed composition, dashboard spacing, navigation behavior, routes, sharing behavior, package IDs, or product copy.

### Task 1: Lock the approved geometry and horizontal React Native rendering

**Files:**
- Modify: `src/ui/brandGeometry.test.ts`
- Modify: `src/ui/BrandMark.test.tsx`
- Modify: `src/ui/BrandWordmark.test.tsx`
- Modify: `src/ui/brandGeometry.ts`
- Modify: `src/ui/BrandMark.tsx`
- Modify: `src/ui/BrandWordmark.tsx`

- [ ] **Step 1: Replace the old geometry expectations with the approved linked-motion contract**

In `src/ui/brandGeometry.test.ts`, import the two new lockup constants:

```ts
import {
  BRAND_ADAPTIVE_ICON_RENDER_VIEW_BOX,
  BRAND_GENERAL_MARK_RENDER_VIEW_BOX,
  BRAND_GEOMETRY,
  BRAND_LOCKUP_MARK_ASPECT_RATIO,
  BRAND_LOCKUP_MARK_RENDER_VIEW_BOX,
  BRAND_WORDMARK,
  parseBrandGeometry,
} from './brandGeometry';
```

Replace `validMantleGeometry` and the two identity assertions with this exact approved contract:

```ts
const validMantleGeometry = {
  viewBox: '0 0 124 80',
  wordmark: 'Mantle',
  colors: {
    lime: '#B9FF3D',
    supportingLime: '#7FAF1C',
    charcoal: '#111411',
    cream: '#F4F5F1',
  },
  mark: {
    paths: [
      'M13 49C28 49 31 27 45 27C56 27 60 42 70 42',
      'M53 48C63 58 76 57 84 44C93 30 99 25 111 25',
    ],
    strokeWidth: 12,
    nodes: [
      { cx: 13, cy: 49, r: 6 },
      { cx: 111, cy: 25, r: 6 },
    ],
  },
};

it('defines the approved canvas, colors, wordmark, and lockup proportion', () => {
  expect(BRAND_GEOMETRY.viewBox).toBe('0 0 124 80');
  expect(BRAND_GEOMETRY.colors).toEqual({
    lime: '#B9FF3D',
    supportingLime: '#7FAF1C',
    charcoal: '#111411',
    cream: '#F4F5F1',
  });
  expect(BRAND_WORDMARK).toBe('Mantle');
  expect(BRAND_LOCKUP_MARK_ASPECT_RATIO).toBe(1.55);
  expect(BRAND_LOCKUP_MARK_RENDER_VIEW_BOX).toBe('0 0 124 80');
});

it('matches the approved compact linked-motion silhouette', () => {
  expect(BRAND_GEOMETRY.mark).toEqual(validMantleGeometry.mark);
  expect(BRAND_GEOMETRY.mark.paths).toHaveLength(2);
  expect(new Set(BRAND_GEOMETRY.mark.paths).size).toBe(2);
  expect(BRAND_GEOMETRY.mark.nodes).toHaveLength(2);
  expect(
    BRAND_GEOMETRY.mark.nodes.every(
      (node) => node.r === BRAND_GEOMETRY.mark.strokeWidth / 2,
    ),
  ).toBe(true);
  expect(BRAND_GEOMETRY.mark).not.toHaveProperty('primaryPath');
  expect(BRAND_GEOMETRY.mark).not.toHaveProperty('accentPath');
});
```

Update the framing expectations in the generator-authority test:

```ts
expect(BRAND_GENERAL_MARK_RENDER_VIEW_BOX).toBe('-18 -40 160 160');
expect(BRAND_ADAPTIVE_ICON_RENDER_VIEW_BOX).toBe('-63 -85 250 250');
for (const duplicatedLiteral of [
  '#B9FF3D',
  '#111411',
  '#7FAF1C',
  '#F4F5F1',
  'M13 49C28 49',
  'M53 48C63 58',
]) {
  expect(generator).not.toContain(duplicatedLiteral);
}
```

Also update the breathing-room assertion from `0 0 120 80` to:

```ts
expect(BRAND_GEOMETRY.viewBox).toBe('0 0 124 80');
```

- [ ] **Step 2: Add failing renderer and lockup-size contracts**

Add these assertions to the first test in `src/ui/BrandMark.test.tsx`:

```ts
expect(source).toContain('BRAND_LOCKUP_MARK_ASPECT_RATIO');
expect(source).toContain('BRAND_LOCKUP_MARK_RENDER_VIEW_BOX');
expect(source).toContain('height={size / BRAND_LOCKUP_MARK_ASPECT_RATIO}');
expect(source).toContain('preserveAspectRatio="xMidYMid meet"');
```

Add this test to `src/ui/BrandWordmark.test.tsx`:

```ts
test('uses the approved compact linked-motion proportions beside the wordmark', () => {
  const source = readFileSync(require.resolve('./BrandWordmark'), 'utf8');

  expect(source).toContain('const markSize = compact ? 32 : 38');
  expect(source).toContain('gap: 6');
  expect(source).toContain('fontSize: 21');
  expect(source).toContain('fontSize: 18');
});
```

- [ ] **Step 3: Run the focused tests and confirm they fail for the old symbol**

Run:

```powershell
npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts src/ui/BrandMark.test.tsx src/ui/BrandWordmark.test.tsx
```

Expected: FAIL because the geometry still uses `0 0 120 80`, the horizontal lockup constants do not exist, and `BrandMark` is still square.

- [ ] **Step 4: Replace the canonical geometry and add purpose-specific render frames**

In `src/ui/brandGeometry.ts`, replace the `BRAND_GEOMETRY` payload and render constants with:

```ts
export const BRAND_GEOMETRY = parseBrandGeometry(JSON.parse(String.raw`{
  "viewBox": "0 0 124 80",
  "wordmark": "Mantle",
  "colors": {
    "lime": "#B9FF3D",
    "supportingLime": "#7FAF1C",
    "charcoal": "#111411",
    "cream": "#F4F5F1"
  },
  "mark": {
    "paths": [
      "M13 49C28 49 31 27 45 27C56 27 60 42 70 42",
      "M53 48C63 58 76 57 84 44C93 30 99 25 111 25"
    ],
    "strokeWidth": 12,
    "nodes": [
      { "cx": 13, "cy": 49, "r": 6 },
      { "cx": 111, "cy": 25, "r": 6 }
    ]
  }
}`));

/** The approved header lockup is 1.55 times wider than it is tall. */
export const BRAND_LOCKUP_MARK_ASPECT_RATIO = 1.55;
export const BRAND_LOCKUP_MARK_RENDER_VIEW_BOX = '0 0 124 80';

/** Square framing for general raster assets, centered on the canonical mark. */
export const BRAND_GENERAL_MARK_RENDER_VIEW_BOX = '-18 -40 160 160';

/** Android adaptive foreground framing inside the centered 66/108 safe zone. */
export const BRAND_ADAPTIVE_ICON_RENDER_VIEW_BOX = '-63 -85 250 250';

export const BRAND_WORDMARK = BRAND_GEOMETRY.wordmark;
```

The endpoint circles deliberately share the outer path endpoints and use exactly half the stroke width, so they finish the continuous paths instead of reading as detached decoration.

- [ ] **Step 5: Render the canonical mark with the approved horizontal footprint**

In `src/ui/BrandMark.tsx`, extend the import and replace the opening `<Svg>` props with:

```tsx
import {
  BRAND_GEOMETRY,
  BRAND_LOCKUP_MARK_ASPECT_RATIO,
  BRAND_LOCKUP_MARK_RENDER_VIEW_BOX,
  BRAND_WORDMARK,
} from './brandGeometry';

// Inside BrandMark's return:
<Svg
  width={size}
  height={size / BRAND_LOCKUP_MARK_ASPECT_RATIO}
  viewBox={BRAND_LOCKUP_MARK_RENDER_VIEW_BOX}
  preserveAspectRatio="xMidYMid meet"
  accessibilityRole="image"
  accessibilityLabel={accessibilityLabel}
>
```

Leave the existing `Path` and `Circle` loops, semantic color input, rounded joins, and accessibility label intact.

- [ ] **Step 6: Balance the mark beside the unchanged Sora wordmark**

In `src/ui/BrandWordmark.tsx`, use:

```tsx
const markSize = compact ? 32 : 38;
```

and update only the row gap:

```ts
row: {
  minHeight: 32,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},
```

Keep the current Sora brand font, 21/18 px text sizes, warm-white semantic ink, and sentence-case `Mantle` wordmark unchanged.

- [ ] **Step 7: Run the focused tests and commit the canonical on-screen mark**

Run:

```powershell
npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts src/ui/BrandMark.test.tsx src/ui/BrandWordmark.test.tsx
```

Expected: the renderer and wordmark tests PASS; the committed-raster assertions may still fail until Task 2 regenerates the PNGs.

Commit only the source and focused contract changes:

```powershell
git add src/ui/brandGeometry.ts src/ui/BrandMark.tsx src/ui/BrandWordmark.tsx src/ui/brandGeometry.test.ts src/ui/BrandMark.test.tsx src/ui/BrandWordmark.test.tsx
git commit -m "feat(brand): adopt linked motion mark"
```

### Task 2: Regenerate and lock every raster brand asset

**Files:**
- Modify: `scripts/generate-brand-assets.mjs`
- Modify: `src/ui/brandGeometry.test.ts`
- Modify: `assets/images/icon.png`
- Modify: `assets/images/android-icon-foreground.png`
- Modify: `assets/images/android-icon-monochrome.png`
- Modify: `assets/images/logo-mark.png`
- Modify: `assets/images/splash-icon.png`
- Modify: `assets/images/logo.png`
- Modify: `assets/images/wordmark.png`
- Modify: `assets/images/favicon.png`

- [ ] **Step 1: Add failing contracts for the new horizontal raster silhouette and lockup placement**

In `src/ui/brandGeometry.test.ts`, update the small-raster height expectation to match a deliberate horizontal mark while preserving useful pixel coverage:

```ts
expect(meaningful.bounds.width).toBeGreaterThan(size * 0.7);
expect(meaningful.bounds.height).toBeGreaterThan(size * 0.26);
```

In the Sharp wordmark test, add:

```ts
expect(generator).toContain(
  '<g transform="translate(18 20) scale(2.15)">',
);
```

- [ ] **Step 2: Run the asset contract and confirm the checked-in images are still the old mark**

Run:

```powershell
npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts
```

Expected: FAIL at the generator transform and/or checked-in raster contract because the PNG inventory has not yet been rebuilt from the new geometry.

- [ ] **Step 3: Reposition the canonical mark in the exported wordmark canvas**

In `scripts/generate-brand-assets.mjs`, replace the `wordmarkMark` group with:

```js
const wordmarkMark = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="300" viewBox="0 0 1400 300">
  <g transform="translate(18 20) scale(2.15)">${markBody(geometry, colors.lime)}</g>
</svg>`;
```

Do not add independent SVG literals: `markBody` must remain the sole path/node renderer shared by mark, adaptive mark, launcher icon, splash, and wordmark.

- [ ] **Step 4: Generate all eight checked-in PNGs atomically from the shared contract**

Run:

```powershell
node scripts/generate-brand-assets.mjs --output-dir assets/images
```

Expected: the command completes without output and replaces exactly the eight established PNGs listed in the file map.

- [ ] **Step 5: Verify asset dimensions, content, safe edges, and Android safe-zone placement**

Run:

```powershell
npm.cmd run test:brand-assets
```

Expected: PASS for the asset-generation contract.

Run:

```powershell
npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts
```

Expected: PASS for all eight dimensions, opaque color checks, transparent/general edges, monochrome output, visible endpoints at 24/32/64 px, and adaptive circular safe zone.

- [ ] **Step 6: Visually inspect the transparent mark, full lockup, and launcher source**

Open these three generated files at original resolution:

```text
assets/images/logo-mark.png
assets/images/logo.png
assets/images/icon.png
```

Acceptance:

```text
- both rounded paths read as one linked forward motion;
- the two outer endpoint circles are integrated with their paths;
- the mark is visibly horizontal and confident beside Mantle;
- the sentence-case Sora wordmark is unchanged and not clipped;
- no glow, blue, or orange is baked into any asset;
- every canvas edge has deliberate breathing room.
```

- [ ] **Step 7: Commit the generator and regenerated raster inventory**

```powershell
git add scripts/generate-brand-assets.mjs src/ui/brandGeometry.test.ts assets/images/icon.png assets/images/android-icon-foreground.png assets/images/android-icon-monochrome.png assets/images/logo-mark.png assets/images/splash-icon.png assets/images/logo.png assets/images/wordmark.png assets/images/favicon.png
git commit -m "feat(brand): regenerate linked motion assets"
```

### Task 3: Prove global coverage without changing product surfaces

**Files:**
- Modify: `src/ui/BrandWordmark.test.tsx`
- Verify only: `src/app/(app)/_layout.tsx`
- Verify only: `src/ui/AuthShell.tsx`
- Verify only: `src/entry/ProofCaptureCard.tsx`
- Verify only: `src/feed/ExternalShareCard.tsx`
- Verify only: `src/progress/ProgressShareCard.tsx`
- Verify only: `src/ui/GlassTabBar.tsx`

- [ ] **Step 1: Add an app-surface contract that rejects independent logo artwork**

Add this test to `src/ui/BrandWordmark.test.tsx`:

```ts
test.each([
  ['feed header', require.resolve('../app/(app)/_layout')],
  ['auth shell', require.resolve('./AuthShell')],
  ['proof capture card', require.resolve('../entry/ProofCaptureCard')],
  ['external share card', require.resolve('../feed/ExternalShareCard')],
  ['progress share card', require.resolve('../progress/ProgressShareCard')],
  ['glass tab bar', require.resolve('./GlassTabBar')],
])('%s consumes the shared Mantle mark', (_surface, sourcePath) => {
  const source = readFileSync(sourcePath, 'utf8');

  expect(source).toMatch(/BrandMark|BrandWordmark/);
  expect(source).not.toMatch(/primaryPath|accentPath/);
  expect(source).not.toMatch(/M25 51C37 43|M51 54C62 65/);
});
```

- [ ] **Step 2: Run the coverage contract**

Run:

```powershell
npm.cmd test -- --runInBand src/ui/BrandWordmark.test.tsx
```

Expected: PASS because these surfaces already consume `BrandMark` or `BrandWordmark`; no screen-specific visual change is required.

- [ ] **Step 3: Confirm no app code contains the retired geometry or fixed old-logo imports**

Run:

```powershell
rg -n "M25 51C37 43|M51 54C62 65|wordmark\.png|logo-mark\.png" src
```

Expected: no retired path literal or fixed generated-logo import appears under `src`; runtime surfaces resolve through shared components.

- [ ] **Step 4: Commit the global-coverage contract**

```powershell
git add src/ui/BrandWordmark.test.tsx
git commit -m "test(brand): lock shared mark coverage"
```

### Task 4: Run repository-wide quality gates

**Files:**
- Verify only: all files changed in Tasks 1–3.

- [ ] **Step 1: Run the complete brand contract suite**

```powershell
npm.cmd run test:brand
```

Expected: both Node-based brand suites PASS.

- [ ] **Step 2: Run TypeScript without emitting build files**

```powershell
npx.cmd tsc --noEmit
```

Expected: exits with code 0 and reports no type errors.

- [ ] **Step 3: Run Expo lint**

```powershell
npm.cmd run lint
```

Expected: exits with code 0 and introduces no lint warning in the changed files.

- [ ] **Step 4: Run the full Jest suite serially**

```powershell
npm.cmd test -- --runInBand
```

Expected: all suites PASS with no snapshot or open-handle regression caused by the brand change.

- [ ] **Step 5: Review the final diff boundary**

Run:

```powershell
git diff HEAD~3 -- src/ui/brandGeometry.ts src/ui/BrandMark.tsx src/ui/BrandWordmark.tsx src/ui/brandGeometry.test.ts src/ui/BrandMark.test.tsx src/ui/BrandWordmark.test.tsx scripts/generate-brand-assets.mjs assets/images
```

Expected: only canonical geometry, mark framing/sizing, contract tests, generator placement, and the eight generated assets changed. Dashboard layout, routes, logic, and color tokens remain untouched.

### Task 5: Build and verify a staging-only Android APK on the connected phone

**Files:**
- Create locally: `.release-evidence/mantle-linked-motion/Mantle-Staging-Linked-Motion.apk`
- Create locally: `.release-evidence/mantle-linked-motion/mantle-app-header.png`
- Create locally: `.release-evidence/mantle-linked-motion/mantle-launcher.png`
- Never modify or publish the production profile or production package.

- [ ] **Step 1: Confirm the exact connected device and installed staging package without changing phone state**

Run:

```powershell
$adbPath = 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe'
& $adbPath devices -l
& $adbPath -s FY24068108E6 shell pm path com.awldesk.accountability.staging
```

Expected: `FY24068108E6` is listed as `device`, and `com.awldesk.accountability.staging` resolves to an installed package. If the phone is disconnected, stop before installation and retry when it reconnects; never uninstall or clear data.

- [ ] **Step 2: Create the local evidence directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path '.release-evidence\mantle-linked-motion'
```

Expected: the directory exists and no app source is changed.

- [ ] **Step 3: Build only the EAS `preview` Android APK and capture its artifact URL**

Run:

```powershell
$env:EAS_NO_VCS = '1'
$build = npx.cmd eas-cli build --platform android --profile preview --non-interactive --wait --json | ConvertFrom-Json
Remove-Item Env:EAS_NO_VCS
$artifactUrl = @($build)[0].artifacts.buildUrl
$artifactUrl
```

Expected: the build is `FINISHED`, uses the `preview` profile with `APP_VARIANT=staging`, and returns an APK URL. Abort if EAS reports the production profile/channel or does not return an APK artifact.

- [ ] **Step 4: Download the preview artifact and verify its package before installation**

Run in the same PowerShell session so `$artifactUrl` is retained:

```powershell
$apkPath = (Resolve-Path '.release-evidence\mantle-linked-motion').Path + '\Mantle-Staging-Linked-Motion.apk'
Invoke-WebRequest -Uri $artifactUrl -OutFile $apkPath
$aapt2Path = '.release-evidence\dark-only-visual-system\aapt2\bin\aapt2.exe'
& $aapt2Path dump packagename $apkPath
```

Expected: `com.awldesk.accountability.staging`. Do not install if any other package name is reported.

- [ ] **Step 5: Install in place and launch without clearing existing app data**

Run:

```powershell
$adbPath = 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe'
& $adbPath -s FY24068108E6 install -r $apkPath
& $adbPath -s FY24068108E6 shell monkey -p com.awldesk.accountability.staging -c android.intent.category.LAUNCHER 1
```

Expected: installation reports `Success`; Mantle Staging opens; the existing signed-in state and user data remain present.

- [ ] **Step 6: Capture the actual app header from the phone**

Run after the Feed is visible:

```powershell
& $adbPath -s FY24068108E6 shell screencap -p /sdcard/mantle-app-header.png
& $adbPath -s FY24068108E6 pull /sdcard/mantle-app-header.png '.release-evidence\mantle-linked-motion\mantle-app-header.png'
```

Expected: the actual Feed header shows the approved linked-motion mark, a 6 dp optical gap, and the unchanged warm-white `Mantle` wordmark with no clipping or dashboard-layout shift.

- [ ] **Step 7: Capture the installed launcher presentation**

Run:

```powershell
& $adbPath -s FY24068108E6 shell input keyevent KEYCODE_HOME
& $adbPath -s FY24068108E6 shell input swipe 558 2200 558 450 350
& $adbPath -s FY24068108E6 shell screencap -p /sdcard/mantle-launcher.png
& $adbPath -s FY24068108E6 pull /sdcard/mantle-launcher.png '.release-evidence\mantle-linked-motion\mantle-launcher.png'
```

Expected: the Mantle Staging launcher icon uses the same linked-motion geometry, remains legible inside the device mask, and contains no old symbol.

- [ ] **Step 8: Apply the final acceptance gate**

Acceptance:

```text
- the approved mark appears identically in the actual app header and generated launcher source;
- the installed launcher icon uses the same geometry and remains unclipped;
- the Mantle wordmark, charcoal/chartreuse palette, and app name are unchanged;
- the mark remains readable at compact phone scale;
- the app launches without a red screen or runtime warning;
- existing staging data is preserved;
- no production build, update, install, or publication occurs.
```

If any item fails, correct only the geometry, renderer sizing, generator placement, or raster framing responsible; repeat Tasks 2, 4, and 5 before reporting completion.

