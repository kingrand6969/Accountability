# Mantle Brand Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public AccountAbility identity with Mantle and ship the approved connected-path mark across the app, generated assets, and owned sharing surfaces without changing package identity or user data.

**Architecture:** Keep `src/ui/brandGeometry.ts` as the single machine-readable identity contract. React Native components and the Node/Sharp asset generator will render the same curved path and two endpoint nodes, while a public-copy contract prevents the old proper name from returning. Expo display names and user-visible copy change to Mantle; package IDs, schemes, EAS resources, data stores, and update channels stay stable.

**Tech Stack:** Expo SDK 56, React Native 0.85, TypeScript, react-native-svg, Node.js, Sharp, Jest, Node test runner, EAS preview builds, Android adb.

---

## File map

### Brand source and renderers

- Modify `src/ui/brandGeometry.ts` — authoritative Mantle path, nodes, palette, and wordmark.
- Modify `src/ui/brandGeometry.test.ts` — schema, immutability, generator, dimensions, and raster contracts.
- Modify `src/ui/BrandMark.tsx` — native connected-path renderer.
- Create `src/ui/BrandMark.test.tsx` — structural renderer and accessibility contract.
- Modify `src/ui/BrandWordmark.tsx` — Mantle lockup.
- Modify `src/ui/BrandWordmark.test.tsx` — Mantle copy, semantic color, and header-use contract.
- Modify `src/ui/typography.ts` — expose the already-loaded Sora face as the brand wordmark role.
- Modify `scripts/generate-brand-assets.mjs` — render the same path/nodes and embed the bundled Sora font.

### Generated assets

- Regenerate `assets/images/icon.png`.
- Regenerate `assets/images/android-icon-foreground.png`.
- Regenerate `assets/images/android-icon-monochrome.png`.
- Regenerate `assets/images/logo-mark.png`.
- Regenerate `assets/images/splash-icon.png`.
- Regenerate `assets/images/logo.png`.
- Regenerate `assets/images/wordmark.png`.
- Regenerate `assets/images/favicon.png`.

### Rename contracts and configuration

- Create `scripts/brand-public-copy-contract.test.mjs` — fail on stale public proper-name strings.
- Modify `scripts/eas-profile-contract.test.mjs` — verify preview profile remains unchanged.
- Modify `app.json` — Mantle display name and permission copy; preserve slug, scheme, bundle IDs, packages, project ID, and asset paths.
- Modify `app.config.js` — staging display name `Mantle Staging`; preserve staging scheme and identifiers.
- Modify `AGENTS.md` — current staging display-name documentation only.

### Active mobile/public copy

- Modify the active files returned by:

```powershell
rg -l --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!.release-evidence/**' --glob '!docs/superpowers/plans/**' --glob '!docs/superpowers/specs/**' --glob '!assets/journey/workouts/README.md' 'AccountAbility|ACCOUNTABILITY|Accountability App' app.json app.config.js AGENTS.md src admin-site
```

- Do not modify historical plans/evidence, package IDs, bundle IDs, schemes, database identifiers, or the workout-asset attribution README.

---

### Task 1: Define the Mantle geometry contract

**Files:**
- Modify: `src/ui/brandGeometry.test.ts`
- Modify: `src/ui/brandGeometry.ts`

- [ ] **Step 1: Replace the Unbroken A expectations with a failing Mantle contract test**

Require semantic colors, the Mantle wordmark, one rounded path, and exactly two nodes:

```ts
describe('Mantle connected-path brand geometry contract', () => {
  it('defines the approved canvas, palette, and wordmark', () => {
    expect(BRAND_GEOMETRY.viewBox).toBe('0 0 96 96');
    expect(BRAND_GEOMETRY.colors).toEqual({
      lime: '#B9FF3D',
      supportingLime: '#7FAF1C',
      charcoal: '#111411',
      cream: '#F4F5F1',
    });
    expect(BRAND_WORDMARK).toBe('Mantle');
  });

  it('contains one shared path and two people nodes', () => {
    expect(BRAND_GEOMETRY.mark).toEqual({
      path: 'M20 67C33 41 47 37 58 50C69 63 76 58 87 37',
      strokeWidth: 14,
      nodes: [
        { cx: 11, cy: 77, r: 9 },
        { cx: 91, cy: 24, r: 9 },
      ],
    });
    expect(BRAND_GEOMETRY.mark).not.toHaveProperty('primaryPath');
    expect(BRAND_GEOMETRY.mark).not.toHaveProperty('accentPath');
  });
});
```

Extend malformed-input coverage to reject missing paths, non-positive stroke widths, node arrays that are not length two, and non-finite/negative node coordinates or radii.

- [ ] **Step 2: Run the focused test and confirm it fails against the A contract**

Run:

```powershell
npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts
```

Expected: FAIL because the wordmark is `Accountability`, semantic color keys do not exist, and the mark still exposes `primaryPath`/`accentPath`.

- [ ] **Step 3: Replace the geometry type and parser with the Mantle schema**

Use this contract shape:

```ts
type BrandNode = {
  cx: number;
  cy: number;
  r: number;
};

type BrandGeometry = {
  viewBox: string;
  wordmark: string;
  colors: {
    lime: string;
    supportingLime: string;
    charcoal: string;
    cream: string;
  };
  mark: {
    path: string;
    strokeWidth: number;
    nodes: [BrandNode, BrandNode];
  };
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBrandNode(value: unknown): value is BrandNode {
  return (
    isRecord(value) &&
    isFiniteNumber(value.cx) &&
    isFiniteNumber(value.cy) &&
    isFiniteNumber(value.r) &&
    value.cx >= 0 &&
    value.cy >= 0 &&
    value.r > 0
  );
}
```

The parser must additionally require:

```ts
isHexColor(value.colors.lime) &&
isHexColor(value.colors.supportingLime) &&
isHexColor(value.colors.charcoal) &&
isHexColor(value.colors.cream) &&
typeof value.mark.path === 'string' &&
value.mark.path.length > 0 &&
isFiniteNumber(value.mark.strokeWidth) &&
value.mark.strokeWidth > 0 &&
Array.isArray(value.mark.nodes) &&
value.mark.nodes.length === 2 &&
value.mark.nodes.every(isBrandNode)
```

- [ ] **Step 4: Store the approved Mantle payload**

Use the exact JSON payload asserted above:

```json
{
  "viewBox": "0 0 96 96",
  "wordmark": "Mantle",
  "colors": {
    "lime": "#B9FF3D",
    "supportingLime": "#7FAF1C",
    "charcoal": "#111411",
    "cream": "#F4F5F1"
  },
  "mark": {
    "path": "M20 67C33 41 47 37 58 50C69 63 76 58 87 37",
    "strokeWidth": 14,
    "nodes": [
      { "cx": 11, "cy": 77, "r": 9 },
      { "cx": 91, "cy": 24, "r": 9 }
    ]
  }
}
```

- [ ] **Step 5: Run the contract test and confirm it passes**

Run:

```powershell
npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts
```

Expected: PASS for palette, geometry, parser validation, deep immutability, and generator-source loading.

- [ ] **Step 6: Commit the authoritative geometry**

```powershell
git add src/ui/brandGeometry.ts src/ui/brandGeometry.test.ts
git commit -m "feat(brand): define Mantle connected-path geometry"
```

---

### Task 2: Render one authoritative mark and wordmark

**Files:**
- Create: `src/ui/BrandMark.test.tsx`
- Modify: `src/ui/BrandMark.tsx`
- Modify: `src/ui/BrandWordmark.test.tsx`
- Modify: `src/ui/BrandWordmark.tsx`
- Modify: `src/ui/typography.ts`
- Modify: `scripts/generate-brand-assets.mjs`

- [ ] **Step 1: Add a failing structural test for the native mark**

The test must prove the component consumes the contract and renders one path plus two circles:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

describe('Mantle BrandMark', () => {
  test('renders the shared path and both nodes from the geometry contract', () => {
    const source = readFileSync(require.resolve('./BrandMark'), 'utf8');
    expect(source).toContain("import Svg, { Circle, Path }");
    expect(source).toContain('BRAND_GEOMETRY.mark.path');
    expect(source).toContain('BRAND_GEOMETRY.mark.strokeWidth');
    expect(source).toContain('BRAND_GEOMETRY.mark.nodes.map');
    expect(source).toContain('strokeLinecap="round"');
    expect(source).toContain('strokeLinejoin="round"');
    expect(source).not.toContain('primaryPath');
    expect(source).not.toContain('accentPath');
  });
});
```

- [ ] **Step 2: Change the wordmark tests to require Mantle and the brand font**

Add these assertions to `BrandWordmark.test.tsx`:

```ts
expect(source).toContain('Mantle');
expect(source).toContain('font.brand');
expect(source).toContain('accessibilityLabel="Mantle"');
expect(source).not.toContain('Account<Text');
expect(source).not.toContain('Ability</Text>');
```

- [ ] **Step 3: Run the renderer tests and confirm they fail**

```powershell
npm.cmd test -- --runInBand src/ui/BrandMark.test.tsx src/ui/BrandWordmark.test.tsx
```

Expected: FAIL because the component still draws the A and the wordmark still renders AccountAbility.

- [ ] **Step 4: Render the path and nodes in `BrandMark`**

Keep the public props stable and use one caller-overridable color:

```tsx
import Svg, { Circle, Path } from 'react-native-svg';

import { BRAND_GEOMETRY, BRAND_WORDMARK } from './brandGeometry';

type BrandMarkProps = {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

/** Mantle: two people moving through one shared rhythm. */
export function BrandMark({
  size = 28,
  color = BRAND_GEOMETRY.colors.lime,
  accessibilityLabel = `${BRAND_WORDMARK} logo`,
}: BrandMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={BRAND_GEOMETRY.viewBox}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Path
        d={BRAND_GEOMETRY.mark.path}
        fill="none"
        stroke={color}
        strokeWidth={BRAND_GEOMETRY.mark.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {BRAND_GEOMETRY.mark.nodes.map((node, index) => (
        <Circle
          key={index}
          cx={node.cx}
          cy={node.cy}
          r={node.r}
          fill={color}
        />
      ))}
    </Svg>
  );
}
```

- [ ] **Step 5: Add and use the Sora brand-font role**

In `src/ui/typography.ts`, add the already-loaded family:

```ts
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  brand: 'Sora_700Bold',
  display: 'Anton_400Regular',
  serif: 'PlayfairDisplay_700Bold',
  handwritten: 'Caveat_600SemiBold',
} as const;
```

Render `Mantle` as one text node in `BrandWordmark`:

```tsx
<View style={styles.row} accessibilityRole="image" accessibilityLabel="Mantle">
  <BrandMark
    size={markSize}
    color={theme.border.action}
    accessibilityLabel="Mantle logo"
  />
  <Text
    maxFontSizeMultiplier={1.25}
    numberOfLines={1}
    style={[
      styles.wordmark,
      compact && styles.wordmarkCompact,
      { color: theme.ink.primary },
    ]}
  >
    Mantle
  </Text>
</View>
```

Set `styles.wordmark.fontFamily` to `font.brand` and retain the current size/compact behavior.

- [ ] **Step 6: Update the Node renderer to consume path/nodes and embed Sora**

Replace `markBody` with:

```js
function markBody({ mark }, fill) {
  const path = `<path d="${mark.path}" fill="none" stroke="${fill}" stroke-width="${mark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const nodes = mark.nodes
    .map(({ cx, cy, r }) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`)
    .join('');
  return `${path}${nodes}`;
}
```

Read and embed the bundled font before creating the wordmark:

```js
const brandFont = await readFile(
  new URL('../node_modules/@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf', import.meta.url),
);
const brandFontData = brandFont.toString('base64');
```

Use the embedded family in the wordmark SVG:

```js
const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="300" viewBox="0 0 1400 300">
  <style>@font-face{font-family:MantleBrand;src:url(data:font/ttf;base64,${brandFontData})}</style>
  <g transform="translate(18 15) scale(2.72)">${markBody(geometry, colors.lime)}</g>
  <text x="306" y="193" font-family="MantleBrand" font-size="126" font-weight="700" letter-spacing="-4" fill="${colors.charcoal}">${brandWordmark}</text>
</svg>`;
```

Use `colors.lime`, `colors.charcoal`, and `colors.cream` throughout `mark`, `appIcon`, splash, and monochrome calls. Keep all eight filenames and dimensions unchanged.

- [ ] **Step 7: Run the renderer and generator-source tests**

```powershell
npm.cmd test -- --runInBand src/ui/BrandMark.test.tsx src/ui/BrandWordmark.test.tsx src/ui/brandGeometry.test.ts
```

Expected: PASS with one path, two nodes, Mantle wordmark, and no A geometry references.

- [ ] **Step 8: Commit renderer changes**

```powershell
git add src/ui/BrandMark.tsx src/ui/BrandMark.test.tsx src/ui/BrandWordmark.tsx src/ui/BrandWordmark.test.tsx src/ui/typography.ts scripts/generate-brand-assets.mjs
git commit -m "feat(brand): render the Mantle identity"
```

---

### Task 3: Regenerate and inspect the complete asset inventory

**Files:**
- Modify: `src/ui/brandGeometry.test.ts`
- Regenerate: the eight files under `assets/images/` listed in the file map

- [ ] **Step 1: Add failing raster-content assertions**

Extend the isolated generator test to use Sharp metadata/stats and confirm:

```ts
const colorMark = await sharp(path.join(outputDirectory, 'logo-mark.png')).raw().toBuffer();
const monochromeMark = await sharp(path.join(outputDirectory, 'android-icon-monochrome.png')).raw().toBuffer();
expect(colorMark.includes(Buffer.from([185, 255, 61]))).toBe(true);
expect(monochromeMark.includes(Buffer.from([0, 0, 0]))).toBe(true);
```

Also assert that generated `logo.png` and `wordmark.png` are non-empty beyond transparent/background pixels. Import Sharp in the test using the existing project dependency.

- [ ] **Step 2: Run the focused test before regenerating committed assets**

```powershell
npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts
```

Expected: FAIL if the generator still emits A geometry or old palette keys.

- [ ] **Step 3: Regenerate only the established assets**

```powershell
node scripts/generate-brand-assets.mjs
```

Expected: the eight existing files are atomically replaced; no ninth asset or temporary file remains.

- [ ] **Step 4: Inspect every raster at original resolution**

Open and inspect:

```text
assets/images/icon.png
assets/images/android-icon-foreground.png
assets/images/android-icon-monochrome.png
assets/images/logo-mark.png
assets/images/splash-icon.png
assets/images/logo.png
assets/images/wordmark.png
assets/images/favicon.png
```

Acceptance: both endpoint nodes remain visible, the path is centered with safe padding, the wordmark is not clipped, monochrome requires no color contrast, and no baked glow appears.

- [ ] **Step 5: Run focused tests and static checks**

```powershell
npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts src/ui/BrandMark.test.tsx src/ui/BrandWordmark.test.tsx
npx.cmd tsc --noEmit
npm.cmd run lint
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit generated assets**

```powershell
git add src/ui/brandGeometry.test.ts assets/images/icon.png assets/images/android-icon-foreground.png assets/images/android-icon-monochrome.png assets/images/logo-mark.png assets/images/splash-icon.png assets/images/logo.png assets/images/wordmark.png assets/images/favicon.png
git commit -m "feat(brand): generate Mantle app assets"
```

---

### Task 4: Rename the active mobile experience and lock the configuration

**Files:**
- Create: `scripts/brand-public-copy-contract.test.mjs`
- Modify: `app.json`
- Modify: `app.config.js`
- Modify: `AGENTS.md`
- Modify: active `src/**` files containing old proper-name strings
- Modify: active tests containing old proper-name expectations

- [ ] **Step 1: Add a failing stale-public-brand contract**

Create `scripts/brand-public-copy-contract.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const roots = ['src'];
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html']);
const stalePattern = /AccountAbility|ACCOUNTABILITY|Accountability App/g;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(target)));
    else if (extensions.has(path.extname(entry.name))) files.push(target);
  }
  return files;
}

test('active mobile surfaces contain no stale AccountAbility proper name', async () => {
  const files = (
    await Promise.all(roots.map((entry) => collect(path.join(root, entry))))
  ).flat();
  files.push(path.join(root, 'app.json'), path.join(root, 'app.config.js'));

  const failures = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const matches = [...source.matchAll(stalePattern)].map((match) => match[0]);
    if (matches.length > 0) failures.push(`${path.relative(root, file)}: ${matches.join(', ')}`);
  }
  assert.deepEqual(failures, []);
});
```

- [ ] **Step 2: Run the copy contract and confirm it fails with an explicit file list**

```powershell
node --test scripts/brand-public-copy-contract.test.mjs
```

Expected: FAIL listing active mobile, test, and configuration files that still contain the old proper name.

- [ ] **Step 3: Rename Expo display copy while preserving technical identity**

Apply these exact public changes:

```json
{
  "expo": {
    "name": "Mantle",
    "slug": "accountability-app",
    "scheme": "accountabilityapp"
  }
}
```

In `app.config.js`:

```js
name: isStaging ? 'Mantle Staging' : config.name,
scheme: isStaging ? 'accountabilityapp-staging' : config.scheme,
```

Keep the existing package IDs, bundle identifiers, project ID, update URL, channels, and profiles byte-for-byte unchanged. Change permission prompt proper names to Mantle, for example:

```json
"NSCameraUsageDescription": "Mantle uses the front camera for a private on-device beauty preview."
```

Use the same `Mantle uses...` / `Mantle needs...` wording for audio, image picker, media library, and location prompts without changing their described behavior.

- [ ] **Step 4: Rename mobile proper-name copy using explicit mappings**

Use these mappings only where the old words are proper names:

```text
AccountAbility Staging -> Mantle Staging
AccountAbility Pro -> Mantle Pro
AccountAbility member -> Mantle member
Accountability App -> Mantle
AccountAbility -> Mantle
ACCOUNTABILITY -> MANTLE
```

Do not replace lowercase `accountability` when it describes the behavioral concept. Update accessibility labels to `Mantle logo` or `Mantle` as specified. Update current test names/fixtures to expect Mantle. Leave historical docs/evidence and `assets/journey/workouts/README.md` untouched.

- [ ] **Step 5: Update the staging identity documentation**

Change only the display-name line in `AGENTS.md`:

```text
- Staging app identity: `Mantle Staging`
  (`com.awldesk.accountability.staging`)
```

- [ ] **Step 6: Run the stale-copy contract and affected Jest tests**

```powershell
node --test scripts/brand-public-copy-contract.test.mjs
npm.cmd test -- --runInBand src/ui/BrandWordmark.test.tsx src/ui/appWideColorSystemContract.test.ts src/entry/flexContext.test.ts src/entry/proofExport.test.ts src/entry/proofPrivacy.test.ts src/feed/FeedBuddyRail.test.tsx src/feed/publicShare.test.ts src/profiles/ProfileOverviewLifecycle.test.tsx src/progress/workoutPhotoLibrary.test.ts
```

Expected: PASS with no active old proper-name strings.

- [ ] **Step 7: Verify the resolved Expo staging configuration**

Expo SDK 56 documents `expo.name` as the installed home-screen name and the adaptive icon/splash paths as build-time configuration. Run:

```powershell
$env:APP_VARIANT = 'staging'
npx.cmd expo config --type public --json
Remove-Item Env:APP_VARIANT
```

Expected JSON values:

```json
{
  "name": "Mantle Staging",
  "slug": "accountability-app",
  "scheme": "accountabilityapp-staging",
  "android": { "package": "com.awldesk.accountability.staging" },
  "extra": {
    "appVariant": "preview",
    "eas": { "projectId": "f91c0791-4a6e-4080-88fd-5cc9a4e720bf" }
  }
}
```

Reference: `https://docs.expo.dev/versions/v56.0.0/config/app/`.

- [ ] **Step 8: Commit the mobile/config rename**

```powershell
git add app.json app.config.js AGENTS.md scripts/brand-public-copy-contract.test.mjs src
git commit -m "feat(brand): rename the mobile experience to Mantle"
```

---

### Task 5: Rename owned web, admin, invite, and share surfaces

**Files:**
- Modify: `admin-site/app/layout.tsx`
- Modify: `admin-site/app/s/[id]/page.tsx`
- Modify: `admin-site/public/dashboard.html`
- Modify: any remaining active files reported by the copy contract

- [ ] **Step 1: Extend the public-copy contract to owned web surfaces and confirm it fails**

Change the roots declaration in `scripts/brand-public-copy-contract.test.mjs` to:

```js
const roots = ['src', 'admin-site/app', 'admin-site/public'];
```

```powershell
node --test scripts/brand-public-copy-contract.test.mjs
```

Expected: FAIL only for admin/public files not included in Task 4's mobile commit.

- [ ] **Step 2: Apply the same public-name rules to owned web surfaces**

Use exact visible replacements:

```text
AccountAbility Admin -> Mantle Admin
Secure administration console for AccountAbility. -> Secure administration console for Mantle.
AccountAbility update -> Mantle update
· AccountAbility -> · Mantle
An AccountAbility member -> A Mantle member
Open in AccountAbility -> Open in Mantle
```

Do not change URLs, Supabase identifiers, route paths, or stored share payloads.

- [ ] **Step 3: Run the copy contract and admin checks**

```powershell
node --test scripts/brand-public-copy-contract.test.mjs
npm.cmd test -- --runInBand src/feed/publicShare.test.ts src/feed/FeedBuddyRail.test.tsx
```

Run the admin site's defined checks from `admin-site`:

```powershell
npm.cmd test
npm.cmd run lint
```

Expected: all available commands exit 0 and owned pages display Mantle.

- [ ] **Step 4: Commit owned-surface copy**

```powershell
git add admin-site scripts/brand-public-copy-contract.test.mjs
git commit -m "feat(brand): rename Mantle sharing surfaces"
```

---

### Task 6: Run full regression and visual verification

**Files:**
- Modify only if verification reveals a source defect in the preceding task files.

- [ ] **Step 1: Run the complete automated suite**

```powershell
node --test scripts/brand-public-copy-contract.test.mjs scripts/eas-profile-contract.test.mjs
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd test -- --runInBand
```

Expected: all commands exit 0; the full Jest baseline remains 276 suites / 3,222 tests or higher if new tests increase the count.

- [ ] **Step 2: Produce an Android export without publishing**

```powershell
npx.cmd expo export --platform android --output-dir dist-mantle-brand
```

Expected: export succeeds. After inspection, remove only `dist-mantle-brand` using a verified literal workspace path; do not touch any other `dist` or repository directory.

- [ ] **Step 3: Inspect brand assets at required sizes**

Create a local comparison sheet showing the mark at 24, 32, 64, 180, 432, and 1024 px on charcoal plus the monochrome variant on cream. Confirm:

```text
- both nodes are distinct;
- the path does not touch or clip the asset boundary;
- the curve remains continuous;
- the wordmark is not clipped;
- no glow is baked into small assets;
- the icon remains identifiable without supporting lime.
```

- [ ] **Step 4: Commit verification-driven fixes only if needed**

```powershell
git add src/ui/brandGeometry.ts src/ui/BrandMark.tsx scripts/generate-brand-assets.mjs assets/images/icon.png assets/images/android-icon-foreground.png assets/images/android-icon-monochrome.png assets/images/logo-mark.png assets/images/splash-icon.png assets/images/logo.png assets/images/wordmark.png assets/images/favicon.png
git commit -m "fix(brand): preserve Mantle logo clarity"
```

Skip this commit if verification required no changes.

---

### Task 7: Build, install, and verify staging on the connected phone

**Files:**
- Create under `.release-evidence/mantle-brand/`: staging APK and device screenshots/XML only.
- Never modify or publish production configuration.

- [ ] **Step 1: Confirm the device and staging package state without changing either**

```powershell
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' devices
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' -s FY24068108E6 shell pm path com.awldesk.accountability.staging
```

Expected: device `FY24068108E6` is listed as `device`; the staging package resolves. If disconnected, stop installation and retry later without uninstalling anything.

- [ ] **Step 2: Start an Android preview APK build only**

```powershell
$env:EAS_NO_VCS = '1'
npx.cmd eas-cli build --platform android --profile preview --non-interactive
Remove-Item Env:EAS_NO_VCS
```

Expected: EAS reports profile `preview`, environment/channel `preview`, and an Android APK build. Abort if any output names production profile/channel or a non-staging package.

- [ ] **Step 3: Download and verify the completed APK before installation**

Save the artifact as:

```text
.release-evidence/mantle-brand/Mantle-Staging.apk
```

Verify with the available Android packaging tool:

```powershell
& '.release-evidence\dark-only-visual-system\aapt2\aapt2.exe' dump packagename '.release-evidence\mantle-brand\Mantle-Staging.apk'
```

Expected: `com.awldesk.accountability.staging`. Do not install if the package differs.

- [ ] **Step 4: Install in place and launch without clearing data**

```powershell
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' -s FY24068108E6 install -r '.release-evidence\mantle-brand\Mantle-Staging.apk'
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' -s FY24068108E6 shell monkey -p com.awldesk.accountability.staging -c android.intent.category.LAUNCHER 1
```

Expected: `Success`; the existing signed-in staging state remains. Never uninstall, clear data, or install production.

- [ ] **Step 5: Capture and review device evidence**

Capture launcher, splash, authentication/launch state, Feed header, menu, invite/share, and navigation:

```powershell
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' -s FY24068108E6 exec-out screencap -p > '.release-evidence\mantle-brand\mantle-feed.png'
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' -s FY24068108E6 shell uiautomator dump /sdcard/mantle.xml
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' -s FY24068108E6 pull /sdcard/mantle.xml '.release-evidence\mantle-brand\mantle-feed.xml'
```

Acceptance:

```text
- installed label reads Mantle Staging;
- launcher/splash show the connected path and two nodes;
- Feed header reads Mantle without clipping;
- no active screen announces or displays AccountAbility as the proper name;
- navigation icon remains legible at phone scale;
- existing user data and sign-in state are preserved;
- app launches without errors.
```

- [ ] **Step 6: Record the final implementation commit**

If device verification required no code fix, no extra commit is needed. Otherwise commit only the verified correction and re-run Tasks 6–7 before declaring completion.

---

## Final release guard

- Do not publish an Expo update to `production`.
- Do not run an EAS `production` build.
- Do not change `com.awldesk.accountability` or `com.awldesk.accountability.staging`.
- Do not uninstall or clear the staging app.
- Do not delete historical AccountAbility documentation or evidence; it records prior state.
