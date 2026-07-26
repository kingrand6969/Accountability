# Run Selfie Beauty and Media Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver repeatable image sharing, explicit temporary-media storage choices, six polished color looks, and on-device natural beauty processing without facial reshaping.

**Architecture:** Repair sharing first with a testable async gate, then isolate temporary media behind a cache manager. A `BeautyEngine` boundary separates UI/settings from native face detection and GPU rendering; VisionCamera/Skia provides the live preview when the compatibility gate passes, while the original capture and a post-capture renderer guarantee a safe fallback.

**Tech Stack:** Expo development builds and EAS, React Native 0.85, TypeScript, VisionCamera 5, VisionCamera Worklets/Skia, React Native Skia, on-device ML Kit face detection, Expo FileSystem, Expo MediaLibrary, Expo Sharing, Jest.

---

## File Map

- Create `src/activity/shareOperationGate.ts` — reusable single-flight share/post guard.
- Create `src/activity/shareOperationGate.test.ts` — repeated use, cancellation, and double-tap tests.
- Create `src/activity/runMediaCache.ts` — temporary media registration, cleanup, and 24-hour recovery.
- Create `src/activity/runMediaCache.test.ts` — cache lifecycle tests with injected filesystem.
- Create `src/activity/saveRunMedia.ts` — Memories, gallery, share, and Feed persistence actions.
- Create `src/activity/saveRunMedia.test.ts` — destination-confirmation and cleanup ordering.
- Create `src/activity/beauty/types.ts` — beauty/color settings, bounds, and presets.
- Create `src/activity/beauty/types.test.ts` — defaults, clamping, and no-geometry schema.
- Create `src/activity/beauty/BeautyEngine.ts` — engine interface and capability/fallback contract.
- Create `src/activity/beauty/beautyMath.ts` — face-region masks and bounded parameter mapping.
- Create `src/activity/beauty/beautyMath.test.ts` — deterministic region and strength behavior.
- Create `src/activity/beauty/BeautyCamera.native.tsx` — native live front-camera preview/capture.
- Create `src/activity/beauty/BeautyCamera.web.tsx` — gallery-only fallback.
- Create `src/activity/beauty/BeautyEditor.tsx` — overall and advanced natural controls.
- Create `src/activity/beauty/beautyShader.ts` — GPU color and conservative smoothing shader.
- Create `src/activity/beauty/renderBeautyImage.native.ts` — full-resolution local final render.
- Create `src/activity/beauty/renderBeautyImage.web.ts` — no-op web fallback.
- Create `src/activity/RunMediaActions.tsx` — Memories, phone, temporary share, Feed actions.
- Modify `src/activity/RunShareSheet.tsx` — gate, camera/editor, current-preview capture, and actions.
- Modify `src/activity/RunCard.tsx` — accept processed selfie URI without retaining source media.
- Modify `src/memories/api.ts` — return confirmation metadata after a run-media save.
- Modify `src/feed/uploadPostImage.ts` — preserve real auth/network errors.
- Modify `src/app/_layout.tsx` — run abandoned-cache cleanup once.
- Modify `app.json` / `app.config.js` — camera and photo-library native configuration.
- Create `babel.config.js` if required by the selected worklet package.
- Modify `package.json` / `package-lock.json` — native camera, rendering, and media libraries.

### Task 1: Fix the Confirmed Repeat-Share Regression

**Files:**
- Create: `src/activity/shareOperationGate.ts`
- Create: `src/activity/shareOperationGate.test.ts`
- Modify: `src/activity/RunShareSheet.tsx`

- [ ] **Step 1: Write the failing repeated-operation test**

```ts
import { createShareOperationGate } from './shareOperationGate';

test('allows a second share after the first finishes', async () => {
  const gate = createShareOperationGate();
  const share = jest.fn().mockResolvedValue(undefined);
  expect(await gate.run(share)).toEqual({ ran: true, value: undefined });
  expect(await gate.run(share)).toEqual({ ran: true, value: undefined });
  expect(share).toHaveBeenCalledTimes(2);
});

test('releases after cancellation or error', async () => {
  const gate = createShareOperationGate();
  await expect(gate.run(async () => Promise.reject(new Error('dismissed')))).rejects.toThrow();
  expect(await gate.run(async () => 'second')).toEqual({ ran: true, value: 'second' });
});

test('blocks only a concurrent double tap', async () => {
  const gate = createShareOperationGate();
  let release!: () => void;
  const active = gate.run(() => new Promise<void>((resolve) => (release = resolve)));
  expect(await gate.run(async () => undefined)).toEqual({ ran: false });
  release();
  await active;
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest src/activity/shareOperationGate.test.ts --runInBand`

Expected: FAIL because the gate does not exist.

- [ ] **Step 3: Implement the reusable gate**

```ts
export function createShareOperationGate() {
  let active = false;
  return {
    get busy() {
      return active;
    },
    async run<T>(operation: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
      if (active) return { ran: false };
      active = true;
      try {
        return { ran: true, value: await operation() };
      } finally {
        active = false;
      }
    },
  };
}
```

- [ ] **Step 4: Use one persistent gate in `RunShareSheet`**

```ts
const operationGate = useRef(createShareOperationGate()).current;

async function onShare() {
  const result = await operationGate.run(async () => {
    setSharing(true);
    try {
      return await shareCurrentRunImage();
    } finally {
      setSharing(false);
    }
  });
  if (!result.ran) return;
}
```

Use the same gate around posting so Share and Post cannot overlap. Remove direct
`inFlight.current` writes.

- [ ] **Step 5: Run tests and type-check**

Run: `npx jest src/activity/shareOperationGate.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/activity/shareOperationGate.ts src/activity/shareOperationGate.test.ts src/activity/RunShareSheet.tsx
git commit -m "fix: allow repeated run image sharing"
```

### Task 2: Build the Temporary Run-Media Cache

**Files:**
- Create: `src/activity/runMediaCache.ts`
- Create: `src/activity/runMediaCache.test.ts`
- Modify: `src/app/_layout.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install direct filesystem and gallery dependencies**

Run:

```bash
npx expo install expo-file-system expo-media-library
```

Expected: SDK-compatible packages are recorded in `package.json` and the lockfile.

- [ ] **Step 2: Write failing cache tests with an injected filesystem**

```ts
test('deletes a share-only file after release', async () => {
  const cache = createRunMediaCache(fakeFs);
  const item = await cache.register('/cache/run-share/a.jpg', 'share');
  await cache.release(item.id);
  expect(fakeFs.delete).toHaveBeenCalledWith('/cache/run-share/a.jpg');
});

test('keeps a file while an action still owns it', async () => {
  const cache = createRunMediaCache(fakeFs);
  const item = await cache.register('/cache/run-share/a.jpg', 'editor');
  await cache.retain(item.id, 'share');
  await cache.release(item.id, 'editor');
  expect(fakeFs.delete).not.toHaveBeenCalled();
  await cache.release(item.id, 'share');
  expect(fakeFs.delete).toHaveBeenCalledTimes(1);
});

test('cleans abandoned exports older than 24 hours', async () => {
  fakeFs.list.mockResolvedValue([{ uri: '/cache/run-share/old.jpg', modifiedAt: now - DAY - 1 }]);
  await cleanupAbandonedRunMedia(now, fakeFs);
  expect(fakeFs.delete).toHaveBeenCalledWith('/cache/run-share/old.jpg');
});
```

- [ ] **Step 3: Implement ownership-based cache cleanup**

Export:

```ts
export type MediaOwner = 'editor' | 'share' | 'memories' | 'gallery' | 'feed';
export function createRunMediaCache(fs: RunMediaFileSystem = expoFileSystemAdapter) {
  // register, retain, release, and discardEditorSession
}
export async function cleanupAbandonedRunMedia(
  now = Date.now(),
  fs: RunMediaFileSystem = expoFileSystemAdapter,
): Promise<void>;
```

Store run-share files only beneath an app cache subdirectory named `run-share`.
Reject deletion requests for paths outside that directory. Delete only when the
owner set becomes empty. Startup cleanup deletes files whose modification time
is older than 24 hours.

- [ ] **Step 4: Start cleanup once**

In the root layout:

```ts
useEffect(() => {
  cleanupAbandonedRunMedia().catch(() => {});
}, []);
```

- [ ] **Step 5: Run tests and type-check**

Run: `npx jest src/activity/runMediaCache.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/activity/runMediaCache.ts src/activity/runMediaCache.test.ts src/app/_layout.tsx
git commit -m "feat: manage temporary run media"
```

### Task 3: Implement Explicit Media Destinations

**Files:**
- Create: `src/activity/saveRunMedia.ts`
- Create: `src/activity/saveRunMedia.test.ts`
- Create: `src/activity/RunMediaActions.tsx`
- Modify: `src/memories/api.ts`
- Modify: `src/feed/uploadPostImage.ts`
- Modify: `src/activity/RunShareSheet.tsx`

- [ ] **Step 1: Write cleanup-order tests**

```ts
test('does not release Memories media until persistence confirms', async () => {
  let confirm!: () => void;
  saveMemory.mockReturnValue(new Promise((resolve) => (confirm = () => resolve({ id: 'm1' }))));
  const pending = persistRunMedia('memories', item, deps);
  expect(release).not.toHaveBeenCalled();
  confirm();
  await pending;
  expect(release).toHaveBeenCalledWith(item.id, 'memories');
});

test('share-only never calls cloud, gallery, memories, or feed', async () => {
  await persistRunMedia('share', item, deps);
  expect(saveMemory).not.toHaveBeenCalled();
  expect(saveGallery).not.toHaveBeenCalled();
  expect(uploadFeed).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Implement destination-specific persistence**

Export:

```ts
export type RunMediaDestination = 'memories' | 'phone' | 'share' | 'feed';

export async function persistRunMedia(
  destination: RunMediaDestination,
  item: CachedRunMedia,
  deps = defaultRunMediaDependencies,
): Promise<{ destination: RunMediaDestination; persisted: boolean }>;
```

Rules:

- `memories`: call `saveImageToMemories(item.uri)`, then release.
- `phone`: request MediaLibrary permission, call `saveToLibraryAsync`, then release.
- `share`: call `Sharing.shareAsync`, then release the share owner; never upload.
- `feed`: upload and create the post, then release only after both confirm.
- Preserve and display real auth/network errors; never convert them to
  `Not signed in`.

- [ ] **Step 3: Return Memories confirmation**

Change `saveImageToMemories` to return `{ path: string; bytes: number }` after
both the storage upload and `memories` row insert succeed. Existing callers may
ignore the returned value.

- [ ] **Step 4: Build the four-action UI**

`RunMediaActions` displays:

- **Save to Memories**
- **Save to phone**
- **Share**
- **Post to Feed**

Disable Feed while the associated activity is queued. Use 44-pixel targets,
progress labels, success confirmation, and destination-specific errors. Closing
without a persistent destination calls `discardEditorSession`.

- [ ] **Step 5: Run focused tests and type-check**

Run: `npx jest src/activity/saveRunMedia.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/activity/saveRunMedia.ts src/activity/saveRunMedia.test.ts src/activity/RunMediaActions.tsx src/memories/api.ts src/feed/uploadPostImage.ts src/activity/RunShareSheet.tsx
git commit -m "feat: add explicit run media destinations"
```

### Task 4: Define Bounded Beauty and Color Settings

**Files:**
- Create: `src/activity/beauty/types.ts`
- Create: `src/activity/beauty/types.test.ts`

- [ ] **Step 1: Write failing defaults and bounds tests**

```ts
import { DEFAULT_BEAUTY, normalizeBeautySettings } from './types';

test('defaults to subtle natural beauty', () => {
  expect(DEFAULT_BEAUTY).toMatchObject({
    enabled: true,
    overall: 20,
    smooth: 20,
    blemish: 20,
    shine: 15,
    underEye: 10,
    lighting: 10,
    colorLook: 'clean',
  });
});

test('clamps every natural control and contains no geometry controls', () => {
  const normalized = normalizeBeautySettings({ ...DEFAULT_BEAUTY, smooth: 999 });
  expect(normalized.smooth).toBe(60);
  expect(normalized).not.toHaveProperty('faceSlim');
  expect(normalized).not.toHaveProperty('eyeSize');
});
```

- [ ] **Step 2: Implement the explicit settings schema**

```ts
export type ColorLook = 'natural' | 'clean' | 'golden' | 'energy' | 'night' | 'mono';

export type BeautySettings = {
  enabled: boolean;
  overall: number;
  smooth: number;
  blemish: number;
  shine: number;
  underEye: number;
  lighting: number;
  colorLook: ColorLook;
  colorStrength: number;
};

export const DEFAULT_BEAUTY: BeautySettings = {
  enabled: true,
  overall: 20,
  smooth: 20,
  blemish: 20,
  shine: 15,
  underEye: 10,
  lighting: 10,
  colorLook: 'clean',
  colorStrength: 35,
};
```

Clamp overall/color to `0..100`, smoothing/blemish to `0..60`, shine to
`0..50`, and under-eye/lighting to `0..40`. Do not add facial geometry fields.

- [ ] **Step 3: Run tests**

Run: `npx jest src/activity/beauty/types.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/activity/beauty/types.ts src/activity/beauty/types.test.ts
git commit -m "feat: define natural beauty settings"
```

### Task 5: Pass the Native Camera Compatibility Gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `babel.config.js`
- Modify: `app.json`
- Create: `src/activity/beauty/BeautyCameraSmoke.native.tsx`

- [ ] **Step 1: Install the native stack**

Run:

```bash
npm install react-native-vision-camera react-native-vision-camera-worklets react-native-vision-camera-skia react-native-vision-camera-face-detector
npx expo install @shopify/react-native-skia
```

Expected: the lockfile pins the installed versions. Do not use
`react-native-worklets-core`; this project already uses the current
`react-native-worklets` line required by VisionCamera 5.

- [ ] **Step 2: Add worklet Babel configuration**

Create:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
```

- [ ] **Step 3: Configure native permissions/plugins**

Add VisionCamera and MediaLibrary configuration to `app.json`, retaining the
existing location, notification, image-picker, and datetime plugins:

```json
[
  "react-native-vision-camera",
  {
    "cameraPermissionText": "AccountAbility uses your camera for run selfies.",
    "enableMicrophonePermission": false
  }
],
[
  "expo-media-library",
  {
    "photosPermission": "AccountAbility can save a run photo when you choose Save to phone.",
    "savePhotosPermission": "AccountAbility can save a run photo when you choose Save to phone.",
    "isAccessMediaLocationEnabled": false
  }
]
```

- [ ] **Step 4: Add a minimal native smoke screen**

`BeautyCameraSmoke.native.tsx` must request permission, select the front device,
render the camera, process/dispose frames, detect faces, and display only an
on-screen face count. It must not write or upload landmarks.

- [ ] **Step 5: Type-check and create a development APK**

Run:

```bash
npx tsc --noEmit
npx eas-cli@latest build --platform android --profile development
```

Expected: successful APK build and a front-camera preview on the physical
Android test phone with no black screen for five minutes.

If this gate fails because the face-detector plugin is incompatible with
VisionCamera 5, remove that plugin, keep the camera/Skia stack, and implement the
same `BeautyEngine` interface using a small Expo native module backed by Android
ML Kit Face Detection and iOS Vision. Do not continue with an unstable or
archived camera version.

- [ ] **Step 6: Commit the passing dependency set**

```bash
git add package.json package-lock.json babel.config.js app.json src/activity/beauty/BeautyCameraSmoke.native.tsx
git commit -m "build: add on-device beauty camera stack"
```

### Task 6: Implement Face Regions and Conservative Strength Mapping

**Files:**
- Create: `src/activity/beauty/BeautyEngine.ts`
- Create: `src/activity/beauty/beautyMath.ts`
- Create: `src/activity/beauty/beautyMath.test.ts`

- [ ] **Step 1: Write deterministic region tests**

```ts
test('keeps eye and mouth regions out of the smoothing mask', () => {
  const mask = buildFaceMask(faceFixture, { width: 1080, height: 1350 });
  expect(mask.contains(faceFixture.leftEye)).toBe(false);
  expect(mask.contains(faceFixture.rightEye)).toBe(false);
  expect(mask.contains(faceFixture.mouth)).toBe(false);
  expect(mask.contains(faceFixture.leftCheek)).toBe(true);
});

test('maps 20 percent to a conservative shader amount', () => {
  expect(shaderUniforms(DEFAULT_BEAUTY).smoothAmount).toBeCloseTo(0.12);
});
```

- [ ] **Step 2: Define the engine boundary**

```ts
export type BeautyCapabilities = {
  livePreview: boolean;
  finalRender: boolean;
  maxFaces: number;
};

export type DetectedFace = {
  bounds: { x: number; y: number; width: number; height: number };
  leftEye: { x: number; y: number } | null;
  rightEye: { x: number; y: number } | null;
  mouth: { x: number; y: number } | null;
};

export interface BeautyEngine {
  capabilities(): Promise<BeautyCapabilities>;
  detectFaces(frameOrUri: unknown): Promise<DetectedFace[]>;
  renderFinal(sourceUri: string, settings: BeautySettings): Promise<string>;
}
```

- [ ] **Step 3: Implement bounded face masks**

Create a feathered oval inside each face bounds; subtract padded eye, eyebrow,
nostril, mouth, and facial-hair regions when landmarks are available. Apply the
same settings to every detected face and never emit identity, geometry, or
embedding data.

- [ ] **Step 4: Run tests**

Run: `npx jest src/activity/beauty/beautyMath.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/activity/beauty/BeautyEngine.ts src/activity/beauty/beautyMath.ts src/activity/beauty/beautyMath.test.ts
git commit -m "feat: define natural face processing regions"
```

### Task 7: Implement Six GPU Color Looks and Natural Beauty Shader

**Files:**
- Create: `src/activity/beauty/beautyShader.ts`
- Create: `src/activity/beauty/beautyShader.test.ts`

- [ ] **Step 1: Write preset-uniform tests**

```ts
test.each([
  ['natural', [1, 1, 1]],
  ['clean', [0.92, 1.08, 1.07]],
  ['golden', [1.2, 1.04, 1.03]],
  ['energy', [1.35, 1.1, 1.03]],
  ['night', [1.18, 1.22, 0.88]],
  ['mono', [0, 1.2, 1.04]],
] as const)('%s maps to stable color uniforms', (look, expected) => {
  expect(colorUniforms(look, 100)).toEqual(expected);
});
```

- [ ] **Step 2: Implement shader inputs**

Export:

```ts
export function colorUniforms(
  look: ColorLook,
  strength: number,
): readonly [saturation: number, contrast: number, brightness: number];

export const BEAUTY_RUNTIME_EFFECT = `
uniform shader image;
uniform shader skinMask;
uniform float smoothAmount;
uniform float shineAmount;
uniform float underEyeAmount;
uniform float lightingAmount;
uniform float saturation;
uniform float contrast;
uniform float brightness;

half4 sampleNeighborhood(shader source, float2 xy) {
  half4 sum = source.eval(xy) * 4.0;
  sum += source.eval(xy + float2(-1.5, 0.0));
  sum += source.eval(xy + float2(1.5, 0.0));
  sum += source.eval(xy + float2(0.0, -1.5));
  sum += source.eval(xy + float2(0.0, 1.5));
  return sum / 8.0;
}

half4 applyColor(
  half4 color,
  float saturationValue,
  float contrastValue,
  float brightnessValue,
  float lightingValue
) {
  half luma = dot(color.rgb, half3(0.2126, 0.7152, 0.0722));
  half3 rgb = mix(half3(luma), color.rgb, saturationValue);
  rgb = (rgb - half3(0.5)) * contrastValue + half3(0.5);
  rgb *= brightnessValue + lightingValue;
  return half4(clamp(rgb, half3(0.0), half3(1.0)), color.a);
}

half4 main(float2 xy) {
  half4 original = image.eval(xy);
  half mask = skinMask.eval(xy).a;
  half4 softened = sampleNeighborhood(image, xy);
  half4 natural = mix(original, softened, mask * smoothAmount);
  return applyColor(natural, saturation, contrast, brightness, lightingAmount);
}`;
```

Implement `sampleNeighborhood` as a fixed small weighted kernel and
`applyColor` as bounded linear color transforms. Blemish softening reuses the
masked local blend; shine reduction compresses only high luminance inside the
skin mask. The shader must not warp coordinates.

- [ ] **Step 3: Run tests**

Run: `npx jest src/activity/beauty/beautyShader.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/activity/beauty/beautyShader.ts src/activity/beauty/beautyShader.test.ts
git commit -m "feat: add natural beauty and color shaders"
```

### Task 8: Build the Hybrid Camera and Post-Capture Renderer

**Files:**
- Create: `src/activity/beauty/BeautyCamera.native.tsx`
- Create: `src/activity/beauty/BeautyCamera.web.tsx`
- Create: `src/activity/beauty/renderBeautyImage.native.ts`
- Create: `src/activity/beauty/renderBeautyImage.web.ts`
- Delete: `src/activity/beauty/BeautyCameraSmoke.native.tsx`

- [ ] **Step 1: Replace the smoke screen with the front-camera component**

The native component accepts:

```ts
type BeautyCameraProps = {
  settings: BeautySettings;
  onCapture(sourceUri: string): void;
  onCapabilityChange(capabilities: BeautyCapabilities): void;
  onError(error: Error): void;
};
```

It must:

- use the front camera;
- mirror only the preview, not incorrectly double-mirror the saved file;
- render YUV frames through Skia;
- run face detection at a throttled rate rather than every frame;
- reuse the last mask between detections;
- dispose every frame in `finally`;
- fall back to the unprocessed native preview when processing is unavailable;
- capture the untouched original to app cache.

- [ ] **Step 2: Implement full-resolution final rendering**

`renderBeautyImage.native.ts` loads the captured source into an offscreen Skia
surface, detects faces once at full resolution, applies the same masks/shader,
writes a JPEG in the run-media cache, and returns its URI. It must preserve the
source orientation and never overwrite the original.

The web implementation returns the source URI and reports
`{ livePreview: false, finalRender: false, maxFaces: 0 }`.

- [ ] **Step 3: Add a fallback test**

```ts
test('capture remains available when live beauty is unsupported', () => {
  expect(resolveCameraMode({ livePreview: false, finalRender: true })).toBe(
    'plain-live-beauty-after',
  );
  expect(resolveCameraMode({ livePreview: false, finalRender: false })).toBe(
    'plain-camera',
  );
});
```

- [ ] **Step 4: Run tests and type-check**

Run:

```bash
npx jest src/activity/beauty --runInBand
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/activity/beauty/BeautyCamera.native.tsx src/activity/beauty/BeautyCamera.web.tsx src/activity/beauty/renderBeautyImage.native.ts src/activity/beauty/renderBeautyImage.web.ts
git rm src/activity/beauty/BeautyCameraSmoke.native.tsx
git commit -m "feat: add hybrid beauty selfie camera"
```

### Task 9: Add the Natural Beauty Editor

**Files:**
- Create: `src/activity/beauty/BeautyEditor.tsx`
- Modify: `src/activity/RunShareSheet.tsx`
- Modify: `src/activity/RunCard.tsx`

- [ ] **Step 1: Implement the approved controls**

`BeautyEditor` must provide:

- overall Beauty slider, default 20%;
- Original accessible toggle plus press-and-hold comparison;
- optional advanced Smooth, Blemishes, Shine, Under-eyes, and Lighting controls;
- Natural, Clean, Golden Hour, Energy, Night Run, and Focus B&W looks;
- independent color strength;
- Retake and Done;
- text stating **No face reshaping · Original untouched**.

Every control must be at least 44 by 44 logical pixels and announce its
percentage.

- [ ] **Step 2: Integrate capture and rendering**

Replace the selfie branch of `addPhoto('selfie')` with the embedded
`BeautyCamera`. Keep `addPhoto('place')` and Map only behavior. After capture,
open `BeautyEditor`, render the flattened current result, and pass only the
processed URI to `RunCard`.

Changing a setting invalidates the current export so the next share captures
the new preview.

- [ ] **Step 3: Verify repeat sharing uses current state**

Run the sequence in a component/device test:

1. share Clean;
2. return;
3. choose Golden Hour;
4. share again;
5. assert two native share openings and different exported file hashes.

- [ ] **Step 4: Run type-check and all unit tests**

Run: `npx tsc --noEmit && npx jest --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/activity/beauty/BeautyEditor.tsx src/activity/RunShareSheet.tsx src/activity/RunCard.tsx
git commit -m "feat: add natural run selfie editor"
```

### Task 10: Device, Privacy, and Release Verification

**Files:**
- Create: `docs/release-evidence/run-selfie-beauty-media.md`

- [ ] **Step 1: Run automated verification**

Run:

```bash
npx tsc --noEmit
npx jest --runInBand
npx expo-doctor
```

Expected: all commands pass.

- [ ] **Step 2: Build the Android preview APK**

Run: `npx eas-cli@latest build --platform android --profile preview`

Expected: successful APK using the new native runtime. Record the build URL.

- [ ] **Step 3: Execute functional device checks**

Verify:

1. Beauty defaults to 20% and zero matches Original.
2. No control changes facial geometry.
3. Multiple faces receive the same conservative settings.
4. No-face images still use color looks.
5. Preview/capture mirroring and orientation match.
6. First share, cancel, second share, background change, and third share work.
7. Share-only creates no Memories, gallery, Feed, or cloud record.
8. Save to Memories, phone, and Feed each persist only after confirmation.
9. Cancel cleans media; startup removes an artificially aged cache file.
10. Offline activity queue remains intact through every media action.

- [ ] **Step 4: Execute privacy and performance checks**

- Capture device network traffic and verify no camera frame, face crop,
  landmark, or biometric data leaves the phone.
- Measure preview FPS and memory for five minutes on the minimum Android test
  device; require at least 24 FPS or verify automatic plain-preview fallback.
- Test bright sun, indoor light, low light, sweat, facial hair, glasses, hats,
  varied skin tones, and varied ages.
- Confirm skin texture remains visible at default strength.

- [ ] **Step 5: Write release-control evidence**

Document the build URL, dependencies and licenses, tests, before/after images,
privacy capture, performance results, storage cleanup, known fallback, rollout,
and rollback in `docs/release-evidence/run-selfie-beauty-media.md`.

- [ ] **Step 6: Commit evidence**

```bash
git add docs/release-evidence/run-selfie-beauty-media.md
git commit -m "docs: record run selfie beauty evidence"
```
