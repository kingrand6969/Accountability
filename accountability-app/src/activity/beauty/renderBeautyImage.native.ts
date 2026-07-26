import type {
  SkImage,
  SkPaint,
  SkShader,
  SkSurface,
} from '@shopify/react-native-skia';

import {
  MAX_BEAUTY_FACES,
  type DetectedFace,
  type ImageSize,
} from './BeautyEngine';
import {
  BEAUTY_SHADER_CHILDREN,
  buildBeautyShaderUniforms,
  BEAUTY_RUNTIME_EFFECT,
} from './beautyShader';
import {
  isFaceSnapshotFresh,
  mapFacesToImage,
  sanitizeFaceDetectorResults,
  type BeautyCameraFeatureCapabilities,
  type FaceSnapshot,
} from './cameraMode';
import { normalizeBeautySettings, type BeautySettings } from './types';

export const BEAUTY_RENDER_CHILDREN = BEAUTY_SHADER_CHILDREN;

/**
 * A 4 MP image occupies 16 MB as RGBA. The renderer can hold the decoded
 * source, two mask surfaces, two mask snapshots, the output surface, and its
 * snapshot concurrently: 7 * 16 MB = 112 MB. Allowing two 20 MB encoded
 * source copies plus a 10 MB output keeps the peak under a 176 MB envelope.
 */
export const BEAUTY_MEMORY_BUDGET = Object.freeze({
  maxPixels: 4_000_000,
  maxDimension: 2_560,
  maxSourceBytes: 20 * 1024 * 1024,
  maxOutputBytes: 10 * 1024 * 1024,
  rgbaBuffers: 7,
});

export const BEAUTY_RENDER_UNIFORMS = Object.freeze([
  'smoothAmount',
  'blemishAmount',
  'shineAmount',
  'underEyeAmount',
  'lightingAmount',
  'saturation',
  'contrast',
  'brightness',
  'redGain',
  'greenGain',
  'blueGain',
  'highlightCompression',
] as const);

export const NATIVE_BEAUTY_RENDER_CAPABILITIES: BeautyCameraFeatureCapabilities =
  Object.freeze({
    livePreview: false,
    finalRender: true,
    maxFaces: MAX_BEAUTY_FACES,
  });

export type BeautyFaceDetectorAdapter = (
  uri: string,
  signal?: AbortSignal,
) => Promise<unknown> | unknown;

export type RenderBeautyImageInput = Readonly<{
  sourceUri: string;
  settings: BeautySettings;
  faceSnapshot?: FaceSnapshot | null;
  detector?: BeautyFaceDetectorAdapter;
  signal?: AbortSignal;
  capturedAt?: number;
}>;

export type BeautyRenderResult = Readonly<{
  sourceUri: string;
  uri: string;
  cacheItemId: string;
  imageSize: ImageSize;
  faceCount: number;
  colorLookApplied: true;
  beautyMasksApplied: boolean;
  capabilities: BeautyCameraFeatureCapabilities;
}>;

export type BeautyRenderPlan = Readonly<{
  applyColorLook: true;
  skinMaskFaces: readonly DetectedFace[];
  underEyeMaskFaces: readonly DetectedFace[];
}>;

type RasterRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type BeautyMaskRasterPlan = Readonly<{
  skin: readonly RasterRect[];
  exclusions: readonly RasterRect[];
  underEyes: readonly RasterRect[];
}>;

export function buildBeautyRenderPlan(
  faces: readonly DetectedFace[],
): BeautyRenderPlan {
  const bounded = faces.slice(0, MAX_BEAUTY_FACES);
  return {
    applyColorLook: true,
    skinMaskFaces: bounded,
    underEyeMaskFaces: bounded.filter(
      (face) => face.leftEye != null || face.rightEye != null,
    ),
  };
}

export function buildMaskRasterPlan(
  faces: readonly DetectedFace[],
): BeautyMaskRasterPlan {
  const skin: RasterRect[] = [];
  const exclusions: RasterRect[] = [];
  const underEyes: RasterRect[] = [];
  for (const face of faces.slice(0, MAX_BEAUTY_FACES)) {
    skin.push(face.bounds);
    addExclusion(exclusions, face.leftEye, face.bounds.width * 0.13);
    addExclusion(exclusions, face.rightEye, face.bounds.width * 0.13);
    addExclusion(exclusions, face.leftEyebrow, face.bounds.width * 0.14);
    addExclusion(exclusions, face.rightEyebrow, face.bounds.width * 0.14);
    addExclusion(exclusions, face.mouth, face.bounds.width * 0.18);
    exclusions.push(...(face.facialHair ?? []));

    const eyeWidth = face.bounds.width * 0.22;
    const eyeHeight = face.bounds.height * 0.1;
    for (const eye of [face.leftEye, face.rightEye]) {
      if (!eye) continue;
      underEyes.push({
        x: eye.x - eyeWidth / 2,
        y: eye.y + eyeHeight * 0.15,
        width: eyeWidth,
        height: eyeHeight,
      });
    }
  }
  return { skin, exclusions, underEyes };
}

export function estimateBeautyWorkingBytes(pixelCount: number): number {
  if (!Number.isFinite(pixelCount) || pixelCount < 0) return 0;
  return Math.ceil(pixelCount) * 4 * BEAUTY_MEMORY_BUDGET.rgbaBuffers;
}

export function planBeautyResize(size: ImageSize): ImageSize | null {
  if (!validImageSize(size)) {
    throw new Error('The photo dimensions are invalid.');
  }
  const dimensionScale =
    BEAUTY_MEMORY_BUDGET.maxDimension / Math.max(size.width, size.height);
  const pixelScale = Math.sqrt(
    BEAUTY_MEMORY_BUDGET.maxPixels / (size.width * size.height),
  );
  const scale = Math.min(1, dimensionScale, pixelScale);
  if (scale >= 1) return null;
  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
  };
}

export function assertBeautySourceBytes(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error('The photo size could not be verified safely.');
  }
  if (bytes > BEAUTY_MEMORY_BUDGET.maxSourceBytes) {
    throw new Error('This photo is too large for safe beauty rendering.');
  }
}

export function assertBeautyOutputBytes(bytes: number): void {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error('The rendered photo size could not be verified safely.');
  }
  if (bytes > BEAUTY_MEMORY_BUDGET.maxOutputBytes) {
    throw new Error('The rendered photo is too large to save safely.');
  }
}

export function createBeautyResourceScope() {
  const resources: { dispose(): void }[] = [];
  return {
    track<T extends { dispose(): void } | null>(resource: T): T {
      if (resource) resources.push(resource);
      return resource;
    },
    dispose(): void {
      while (resources.length > 0) disposeQuietly(resources.pop());
    },
  };
}

export async function commitBeautyOutput(input: Readonly<{
  outputUri: string;
  encodedBytes: Uint8Array;
  signal?: AbortSignal;
  write(bytes: Uint8Array): void | Promise<void>;
  register(uri: string): Promise<{ id: string; uri: string }>;
  releaseRegistered(id: string): void | Promise<void>;
  deleteOutput(uri: string): void | Promise<void>;
}>): Promise<{ id: string; uri: string }> {
  assertBeautyOutputBytes(input.encodedBytes.byteLength);
  throwIfAborted(input.signal);
  let writeAttempted = false;
  let registered: { id: string; uri: string } | null = null;
  try {
    writeAttempted = true;
    await input.write(input.encodedBytes);
    throwIfAborted(input.signal);
    registered = await input.register(input.outputUri);
    throwIfAborted(input.signal);
    return registered;
  } catch (error) {
    if (registered) {
      try {
        await input.releaseRegistered(registered.id);
      } catch {
        // The managed cache keeps a failed release tracked for retry.
      }
    } else if (writeAttempted) {
      try {
        await input.deleteOutput(input.outputUri);
      } catch {
        // Managed cache cleanup can retry an operation-owned orphan later.
      }
    }
    throw error;
  }
}

function addExclusion(
  exclusions: RasterRect[],
  point: DetectedFace['leftEye'],
  radius: number,
): void {
  if (!point) return;
  exclusions.push({
    x: point.x - radius,
    y: point.y - radius * 0.6,
    width: radius * 2,
    height: radius * 1.2,
  });
}

function validImageSize(size: ImageSize): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

function requireVerifiedFileSize(size: number | null): number {
  if (size === null) {
    throw new Error('The photo size could not be verified safely.');
  }
  return size;
}

function assertNormalizedImage(size: ImageSize, bytes: number): void {
  assertBeautySourceBytes(bytes);
  if (
    !validImageSize(size) ||
    size.width > BEAUTY_MEMORY_BUDGET.maxDimension ||
    size.height > BEAUTY_MEMORY_BUDGET.maxDimension ||
    size.width * size.height > BEAUTY_MEMORY_BUDGET.maxPixels
  ) {
    throw new Error('The normalized photo exceeds the safe render budget.');
  }
}

export function createBeautyOutputUri(
  cacheUri: string,
  now = Date.now(),
  random: () => number = Math.random,
): string {
  const root = cacheUri.replace(/[\\/]+$/, '');
  const nonce = Math.floor(random() * Number.MAX_SAFE_INTEGER)
    .toString(36)
    .padStart(10, '0')
    .slice(-10);
  return `${root}/run-share/beauty-${now}-${nonce}.jpg`;
}

export async function renderBeautyImage(
  input: RenderBeautyImageInput,
): Promise<BeautyRenderResult> {
  const { Directory, File, Paths } =
    require('expo-file-system') as typeof import('expo-file-system');
  const { manipulateAsync, SaveFormat } =
    require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  const { Image } = require('react-native') as typeof import('react-native');
  const {
    BlendMode,
    BlurStyle,
    FilterMode,
    ImageFormat,
    MipmapMode,
    Skia,
    TileMode,
  } =
    require('@shopify/react-native-skia') as typeof import('@shopify/react-native-skia');
  const { runMediaCache } =
    require('../saveRunMedia') as typeof import('../saveRunMedia');

  throwIfAborted(input.signal);
  const sourceUri = requireLocalSourceUri(input.sourceUri);
  const sourceFile = new File(sourceUri);
  assertBeautySourceBytes(requireVerifiedFileSize(sourceFile.size));
  const sourceSize = await Image.getSize(sourceUri);
  const resize = planBeautyResize(sourceSize);
  throwIfAborted(input.signal);
  const normalized = await manipulateAsync(
    sourceUri,
    resize ? [{ resize }] : [],
    { compress: 1, format: SaveFormat.JPEG },
  );
  const normalizedFile = new File(normalized.uri);
  const resources = createBeautyResourceScope();

  let data: ReturnType<typeof Skia.Data.fromBytes> | null = null;
  let image: SkImage | null = null;
  let skinMaskSurface: SkSurface | null = null;
  let underEyeMaskSurface: SkSurface | null = null;
  let skinMaskImage: SkImage | null = null;
  let underEyeMaskImage: SkImage | null = null;
  let sourceShader: SkShader | null = null;
  let skinMaskShader: SkShader | null = null;
  let underEyeMaskShader: SkShader | null = null;
  let runtimeEffect: ReturnType<typeof Skia.RuntimeEffect.Make> = null;
  let runtimeShader: SkShader | null = null;
  let outputPaint: SkPaint | null = null;
  let outputSurface: SkSurface | null = null;
  let renderedImage: SkImage | null = null;

  try {
    const outputDirectory = new Directory(Paths.cache, 'run-share');
    outputDirectory.create({ idempotent: true, intermediates: true });
    const outputFile = new File(
      createBeautyOutputUri(Paths.cache.uri, Date.now(), Math.random),
    );
    assertNormalizedImage(
      { width: normalized.width, height: normalized.height },
      requireVerifiedFileSize(normalizedFile.size),
    );
    throwIfAborted(input.signal);
    const bytes = await normalizedFile.bytes();
    data = resources.track(Skia.Data.fromBytes(bytes));
    image = resources.track(Skia.Image.MakeImageFromEncoded(data));
    if (!image) throw new Error('The captured photo could not be decoded.');

    const imageSize = { width: image.width(), height: image.height() };
    const faces = await resolveFaces(input, normalized.uri, imageSize);
    throwIfAborted(input.signal);
    const rasterPlan = buildMaskRasterPlan(faces);

    skinMaskSurface = resources.track(Skia.Surface.MakeOffscreen(
      imageSize.width,
      imageSize.height,
    ));
    underEyeMaskSurface = resources.track(Skia.Surface.MakeOffscreen(
      imageSize.width,
      imageSize.height,
    ));
    outputSurface = resources.track(Skia.Surface.MakeOffscreen(
      imageSize.width,
      imageSize.height,
    ));
    if (!skinMaskSurface || !underEyeMaskSurface || !outputSurface) {
      throw new Error('This device could not allocate the beauty renderer.');
    }

    drawSkinMask(
      skinMaskSurface,
      rasterPlan,
      imageSize,
      Skia,
      BlurStyle.Normal,
      BlendMode.Clear,
    );
    drawUnderEyeMask(
      underEyeMaskSurface,
      rasterPlan,
      imageSize,
      Skia,
      BlurStyle.Normal,
    );
    skinMaskSurface.flush();
    underEyeMaskSurface.flush();
    skinMaskImage = resources.track(skinMaskSurface.makeImageSnapshot());
    underEyeMaskImage = resources.track(
      underEyeMaskSurface.makeImageSnapshot(),
    );

    sourceShader = resources.track(image.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None,
    ));
    skinMaskShader = resources.track(skinMaskImage.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None,
    ));
    underEyeMaskShader = resources.track(underEyeMaskImage.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None,
    ));

    runtimeEffect = resources.track(
      Skia.RuntimeEffect.Make(BEAUTY_RUNTIME_EFFECT),
    );
    if (!runtimeEffect) {
      throw new Error('The beauty effect is not supported on this device.');
    }
    assertRuntimeEffectContract(runtimeEffect);
    const settings = normalizeBeautySettings(input.settings);
    const uniforms = buildBeautyShaderUniforms(settings);
    runtimeShader = resources.track(runtimeEffect.makeShaderWithChildren(
      BEAUTY_RENDER_UNIFORMS.map((name) => uniforms[name]),
      [sourceShader, skinMaskShader, underEyeMaskShader],
    ));
    outputPaint = resources.track(Skia.Paint());
    outputPaint.setAntiAlias(true);
    outputPaint.setShader(runtimeShader);

    const canvas = outputSurface.getCanvas();
    canvas.clear(Skia.Color('transparent'));
    canvas.drawRect(
      Skia.XYWHRect(0, 0, imageSize.width, imageSize.height),
      outputPaint,
    );
    outputSurface.flush();
    renderedImage = resources.track(outputSurface.makeImageSnapshot());
    const jpeg = renderedImage.encodeToBytes(ImageFormat.JPEG, 94);
    const cacheItem = await commitBeautyOutput({
      outputUri: outputFile.uri,
      encodedBytes: jpeg,
      signal: input.signal,
      write: (bytesToWrite) => outputFile.write(bytesToWrite),
      register: (uri) => runMediaCache.register(uri, 'editor'),
      releaseRegistered: (id) => runMediaCache.release(id, 'editor'),
      deleteOutput: () => {
        if (outputFile.exists) outputFile.delete();
      },
    });
    return {
      sourceUri,
      uri: cacheItem.uri,
      cacheItemId: cacheItem.id,
      imageSize,
      faceCount: faces.length,
      colorLookApplied: true,
      beautyMasksApplied: faces.length > 0 && settings.enabled,
      capabilities: NATIVE_BEAUTY_RENDER_CAPABILITIES,
    };
  } finally {
    resources.dispose();

    if (normalizedFile.exists) {
      try {
        normalizedFile.delete();
      } catch {
        // Cache cleanup will remove an abandoned normalization copy later.
      }
    }
  }
}

async function resolveFaces(
  input: RenderBeautyImageInput,
  normalizedUri: string,
  imageSize: ImageSize,
): Promise<DetectedFace[]> {
  if (
    input.faceSnapshot &&
    isFaceSnapshotFresh(
      input.faceSnapshot,
      input.capturedAt ?? Date.now(),
    )
  ) {
    return mapFacesToImage(input.faceSnapshot, imageSize);
  }

  const detected = input.detector
    ? await input.detector(normalizedUri, input.signal)
    : await detectFacesFromUri(normalizedUri);
  return sanitizeFaceDetectorResults(detected);
}

async function detectFacesFromUri(uri: string): Promise<unknown> {
  const { createImageFaceDetector } =
    require('react-native-vision-camera-face-detector') as typeof import('react-native-vision-camera-face-detector');
  const detector = createImageFaceDetector({
    performanceMode: 'accurate',
    runLandmarks: true,
    runContours: false,
    runClassifications: false,
    trackingEnabled: false,
  });
  try {
    return detector.detectFaces(uri);
  } finally {
    detector.dispose();
  }
}

function drawSkinMask(
  surface: SkSurface,
  plan: BeautyMaskRasterPlan,
  imageSize: ImageSize,
  Skia: typeof import('@shopify/react-native-skia')['Skia'],
  blurStyle: import('@shopify/react-native-skia').BlurStyle,
  clearBlendMode: import('@shopify/react-native-skia').BlendMode,
): void {
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  const minimumDimension = Math.min(imageSize.width, imageSize.height);
  const fill = Skia.Paint();
  const clear = Skia.Paint();
  let fillBlur: ReturnType<typeof Skia.MaskFilter.MakeBlur> | null = null;
  let clearBlur: ReturnType<typeof Skia.MaskFilter.MakeBlur> | null = null;
  try {
    fill.setAntiAlias(true);
    fill.setColor(Skia.Color('white'));
    clear.setAntiAlias(true);
    clear.setBlendMode(clearBlendMode);
    fillBlur = Skia.MaskFilter.MakeBlur(
      blurStyle,
      Math.max(2, minimumDimension * 0.006),
      false,
    );
    clearBlur = Skia.MaskFilter.MakeBlur(
      blurStyle,
      Math.max(1, minimumDimension * 0.003),
      false,
    );
    fill.setMaskFilter(fillBlur);
    clear.setMaskFilter(clearBlur);

    for (const bounds of plan.skin) {
      canvas.drawOval(
        Skia.XYWHRect(bounds.x, bounds.y, bounds.width, bounds.height),
        fill,
      );
    }
    for (const exclusion of plan.exclusions) {
      canvas.drawOval(
        Skia.XYWHRect(
          exclusion.x,
          exclusion.y,
          exclusion.width,
          exclusion.height,
        ),
        clear,
      );
    }
  } finally {
    disposeQuietly(clear);
    disposeQuietly(fill);
    disposeQuietly(clearBlur);
    disposeQuietly(fillBlur);
  }
}

function drawUnderEyeMask(
  surface: SkSurface,
  plan: BeautyMaskRasterPlan,
  imageSize: ImageSize,
  Skia: typeof import('@shopify/react-native-skia')['Skia'],
  blurStyle: import('@shopify/react-native-skia').BlurStyle,
): void {
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  const paint = Skia.Paint();
  let blur: ReturnType<typeof Skia.MaskFilter.MakeBlur> | null = null;
  try {
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color('white'));
    blur = Skia.MaskFilter.MakeBlur(
      blurStyle,
      Math.max(1, Math.min(imageSize.width, imageSize.height) * 0.004),
      false,
    );
    paint.setMaskFilter(blur);
    for (const underEye of plan.underEyes) {
      canvas.drawOval(
        Skia.XYWHRect(
          underEye.x,
          underEye.y,
          underEye.width,
          underEye.height,
        ),
        paint,
      );
    }
  } finally {
    disposeQuietly(paint);
    disposeQuietly(blur);
  }
}

function assertRuntimeEffectContract(
  effect: NonNullable<ReturnType<
    typeof import('@shopify/react-native-skia')['Skia']['RuntimeEffect']['Make']
  >>,
): void {
  const names = Array.from(
    { length: effect.getUniformCount() },
    (_, index) => effect.getUniformName(index),
  );
  // RN Skia exposes numeric uniforms through this reflection API; child
  // shader order is defined by BEAUTY_RENDER_CHILDREN and bound separately.
  const expected = [...BEAUTY_RENDER_UNIFORMS];
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw new Error('The installed beauty shader contract is incompatible.');
  }
}

function requireLocalSourceUri(value: string): string {
  const uri = typeof value === 'string' ? value.trim() : '';
  if (!uri || !/^(?:file|content):\/\//i.test(uri)) {
    throw new Error('Choose a photo stored on this device.');
  }
  return uri;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Beauty rendering was cancelled.');
  error.name = 'AbortError';
  throw error;
}

function disposeQuietly(
  value: { dispose(): void } | null | undefined,
): void {
  if (!value) return;
  try {
    value.dispose();
  } catch {
    // Best-effort native resource cleanup.
  }
}

export default renderBeautyImage;
