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
import { buildBeautyShaderUniforms, BEAUTY_RUNTIME_EFFECT } from './beautyShader';
import {
  isFaceSnapshotFresh,
  mapFacesToImage,
  sanitizeFaceDetectorResults,
  type BeautyCameraFeatureCapabilities,
  type FaceSnapshot,
} from './cameraMode';
import { normalizeBeautySettings, type BeautySettings } from './types';

export const BEAUTY_RENDER_CHILDREN = Object.freeze([
  'image',
  'skinMask',
  'underEyeMask',
] as const);

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
  const normalized = await manipulateAsync(sourceUri, [], {
    compress: 1,
    format: SaveFormat.JPEG,
  });
  const normalizedFile = new File(normalized.uri);
  const outputDirectory = new Directory(Paths.cache, 'run-share');
  outputDirectory.create({ idempotent: true, intermediates: true });
  const outputFile = new File(
    createBeautyOutputUri(Paths.cache.uri, Date.now(), Math.random),
  );
  let outputCreated = false;
  let registered = false;

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
    throwIfAborted(input.signal);
    const bytes = await normalizedFile.bytes();
    data = Skia.Data.fromBytes(bytes);
    image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) throw new Error('The captured photo could not be decoded.');

    const imageSize = { width: image.width(), height: image.height() };
    const faces = await resolveFaces(input, normalized.uri, imageSize);
    throwIfAborted(input.signal);
    const plan = buildBeautyRenderPlan(faces);

    skinMaskSurface = Skia.Surface.MakeOffscreen(
      imageSize.width,
      imageSize.height,
    );
    underEyeMaskSurface = Skia.Surface.MakeOffscreen(
      imageSize.width,
      imageSize.height,
    );
    outputSurface = Skia.Surface.MakeOffscreen(
      imageSize.width,
      imageSize.height,
    );
    if (!skinMaskSurface || !underEyeMaskSurface || !outputSurface) {
      throw new Error('This device could not allocate the beauty renderer.');
    }

    drawSkinMask(
      skinMaskSurface,
      plan.skinMaskFaces,
      imageSize,
      Skia,
      BlurStyle.Normal,
      BlendMode.Clear,
    );
    drawUnderEyeMask(
      underEyeMaskSurface,
      plan.underEyeMaskFaces,
      imageSize,
      Skia,
      BlurStyle.Normal,
    );
    skinMaskSurface.flush();
    underEyeMaskSurface.flush();
    skinMaskImage = skinMaskSurface.makeImageSnapshot();
    underEyeMaskImage = underEyeMaskSurface.makeImageSnapshot();

    sourceShader = image.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None,
    );
    skinMaskShader = skinMaskImage.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None,
    );
    underEyeMaskShader = underEyeMaskImage.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None,
    );

    runtimeEffect = Skia.RuntimeEffect.Make(BEAUTY_RUNTIME_EFFECT);
    if (!runtimeEffect) {
      throw new Error('The beauty effect is not supported on this device.');
    }
    assertRuntimeEffectContract(runtimeEffect);
    const settings = normalizeBeautySettings(input.settings);
    const uniforms = buildBeautyShaderUniforms(settings);
    runtimeShader = runtimeEffect.makeShaderWithChildren(
      BEAUTY_RENDER_UNIFORMS.map((name) => uniforms[name]),
      [sourceShader, skinMaskShader, underEyeMaskShader],
    );
    outputPaint = Skia.Paint();
    outputPaint.setAntiAlias(true);
    outputPaint.setShader(runtimeShader);

    const canvas = outputSurface.getCanvas();
    canvas.clear(Skia.Color('transparent'));
    canvas.drawRect(
      Skia.XYWHRect(0, 0, imageSize.width, imageSize.height),
      outputPaint,
    );
    outputSurface.flush();
    renderedImage = outputSurface.makeImageSnapshot();
    const jpeg = renderedImage.encodeToBytes(ImageFormat.JPEG, 94);
    throwIfAborted(input.signal);
    outputFile.write(jpeg);
    outputCreated = true;

    const cacheItem = await runMediaCache.register(outputFile.uri, 'editor');
    registered = true;
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
    disposeQuietly(renderedImage);
    disposeQuietly(outputPaint);
    disposeQuietly(runtimeShader);
    disposeQuietly(runtimeEffect);
    disposeQuietly(underEyeMaskShader);
    disposeQuietly(skinMaskShader);
    disposeQuietly(sourceShader);
    disposeQuietly(underEyeMaskImage);
    disposeQuietly(skinMaskImage);
    disposeQuietly(outputSurface);
    disposeQuietly(underEyeMaskSurface);
    disposeQuietly(skinMaskSurface);
    disposeQuietly(image);
    disposeQuietly(data);

    if (normalizedFile.exists) {
      try {
        normalizedFile.delete();
      } catch {
        // Cache cleanup will remove an abandoned normalization copy later.
      }
    }
    if (outputCreated && !registered && outputFile.exists) {
      try {
        outputFile.delete();
      } catch {
        // Cache cleanup will remove an abandoned failed output later.
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
  faces: readonly DetectedFace[],
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

    for (const face of faces) {
      const { bounds } = face;
      canvas.drawOval(
        Skia.XYWHRect(bounds.x, bounds.y, bounds.width, bounds.height),
        fill,
      );
      clearLandmark(canvas, Skia, clear, face.leftEye, bounds.width * 0.13);
      clearLandmark(canvas, Skia, clear, face.rightEye, bounds.width * 0.13);
      clearLandmark(canvas, Skia, clear, face.leftEyebrow, bounds.width * 0.14);
      clearLandmark(canvas, Skia, clear, face.rightEyebrow, bounds.width * 0.14);
      clearLandmark(canvas, Skia, clear, face.mouth, bounds.width * 0.18);
      for (const region of face.facialHair ?? []) {
        canvas.drawOval(
          Skia.XYWHRect(region.x, region.y, region.width, region.height),
          clear,
        );
      }
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
  faces: readonly DetectedFace[],
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
    for (const face of faces) {
      const eyeWidth = face.bounds.width * 0.22;
      const eyeHeight = face.bounds.height * 0.1;
      for (const eye of [face.leftEye, face.rightEye]) {
        if (!eye) continue;
        canvas.drawOval(
          Skia.XYWHRect(
            eye.x - eyeWidth / 2,
            eye.y + eyeHeight * 0.15,
            eyeWidth,
            eyeHeight,
          ),
          paint,
        );
      }
    }
  } finally {
    disposeQuietly(paint);
    disposeQuietly(blur);
  }
}

function clearLandmark(
  canvas: ReturnType<SkSurface['getCanvas']>,
  Skia: typeof import('@shopify/react-native-skia')['Skia'],
  paint: SkPaint,
  point: DetectedFace['leftEye'],
  radius: number,
): void {
  if (!point) return;
  canvas.drawOval(
    Skia.XYWHRect(
      point.x - radius,
      point.y - radius * 0.6,
      radius * 2,
      radius * 1.2,
    ),
    paint,
  );
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
