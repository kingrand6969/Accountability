import {
  MAX_BEAUTY_FACES,
  sanitizeDetectedFaces,
  type DetectedFace,
  type ImageOrientation,
  type ImageSize,
  type Point,
} from './BeautyEngine';

export type BeautyCameraMode =
  | 'plain-camera'
  | 'plain-live-beauty-after'
  | 'beauty-live';

export type BeautyCameraFeatureCapabilities = Readonly<{
  livePreview: boolean;
  finalRender: boolean;
  maxFaces: 0 | typeof MAX_BEAUTY_FACES;
}>;

export type FaceSnapshot = Readonly<{
  capturedAt: number;
  imageSize: ImageSize;
  orientation: ImageOrientation;
  mirrored: boolean;
  faces: readonly DetectedFace[];
}>;

export type BeautyCaptureSource = Readonly<{
  cacheItemId: string | null;
  sourceUri: string;
  imageSize: ImageSize;
  orientation: ImageOrientation;
  mirrored: false;
  faces: FaceSnapshot | null;
}>;

const DEFAULT_MAX_SNAPSHOT_AGE_MS = 500;

// VC5's installed FHD_4_3 target. 2.76 MP stays below the renderer's 4 MP
// ceiling while preserving a camera-native 4:3 capture aspect ratio.
export const BEAUTY_CAPTURE_TARGET_RESOLUTION = Object.freeze({
  width: 1_440,
  height: 1_920,
});

export function resolveBeautyCameraMode(
  capabilities: Pick<
    BeautyCameraFeatureCapabilities,
    'livePreview' | 'finalRender'
  >,
): BeautyCameraMode {
  if (capabilities.livePreview) return 'beauty-live';
  return capabilities.finalRender
    ? 'plain-live-beauty-after'
    : 'plain-camera';
}

export function beautyCameraModeAllowsCapture(
  _mode: BeautyCameraMode,
): true {
  return true;
}

/**
 * Converts the face-detector Nitro objects to privacy-safe plain data at the
 * native boundary. Tracking IDs, classifications, angles, and other metadata
 * are intentionally never copied.
 */
export function sanitizeFaceDetectorResults(value: unknown): DetectedFace[] {
  if (!Array.isArray(value)) return [];

  const approved: unknown[] = [];
  for (
    let index = 0;
    index < Math.min(value.length, MAX_BEAUTY_FACES);
    index += 1
  ) {
    const face = value[index];
    if (typeof face !== 'object' || face === null) continue;

    try {
      const candidate = face as {
        bounds?: unknown;
        landmarks?: Record<string, unknown>;
      };
      const landmarks = candidate.landmarks;
      approved.push({
        bounds: copyBounds(candidate.bounds),
        leftEye: copyPoint(landmarks?.LEFT_EYE),
        rightEye: copyPoint(landmarks?.RIGHT_EYE),
        nose: copyPoint(landmarks?.NOSE_BASE),
        mouth: copyPoint(landmarks?.MOUTH_BOTTOM),
      });
    } catch {
      // A malformed native value is ignored instead of crossing into the app.
    }
  }

  return sanitizeDetectedFaces(approved);
}

export function isFaceSnapshotFresh(
  snapshot: FaceSnapshot | null | undefined,
  capturedAt: number,
  maxAgeMs = DEFAULT_MAX_SNAPSHOT_AGE_MS,
): snapshot is FaceSnapshot {
  if (
    !snapshot ||
    !Number.isFinite(capturedAt) ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs < 0
  ) {
    return false;
  }
  const age = capturedAt - snapshot.capturedAt;
  return age >= 0 && age <= maxAgeMs;
}

export function mapFacesToImage(
  snapshot: FaceSnapshot,
  targetSize: ImageSize,
): DetectedFace[] {
  if (!validSize(snapshot.imageSize) || !validSize(targetSize)) return [];

  const rotatedSize =
    snapshot.orientation === 90 || snapshot.orientation === 270
      ? {
          width: snapshot.imageSize.height,
          height: snapshot.imageSize.width,
        }
      : snapshot.imageSize;
  const scaleX = targetSize.width / rotatedSize.width;
  const scaleY = targetSize.height / rotatedSize.height;

  return snapshot.faces.map((face) => {
    const corners = [
      { x: face.bounds.x, y: face.bounds.y },
      { x: face.bounds.x + face.bounds.width, y: face.bounds.y },
      { x: face.bounds.x, y: face.bounds.y + face.bounds.height },
      {
        x: face.bounds.x + face.bounds.width,
        y: face.bounds.y + face.bounds.height,
      },
    ].map((point) =>
      scalePoint(
        canonicalPoint(
          point,
          snapshot.imageSize,
          snapshot.orientation,
          snapshot.mirrored,
        ),
        scaleX,
        scaleY,
      ),
    );
    const xs = corners.map(({ x }) => x);
    const ys = corners.map(({ y }) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    return mapFaceLandmarks(face, (point) =>
      scalePoint(
        canonicalPoint(
          point,
          snapshot.imageSize,
          snapshot.orientation,
          snapshot.mirrored,
        ),
        scaleX,
        scaleY,
      ),
      {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      },
    );
  });
}

export function createSingleFlightCapture<T, TArgs extends unknown[]>(
  capture: (...args: TArgs) => Promise<T>,
): (...args: TArgs) => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return (...args) => {
    if (inFlight) return inFlight;
    let pending: Promise<T>;
    try {
      pending = capture(...args);
    } catch (error) {
      return Promise.reject(error);
    }
    inFlight = pending;
    const clear = () => {
      if (inFlight === pending) inFlight = null;
    };
    void pending.then(clear, clear);
    return pending;
  };
}

export type CaptureLeaseItem = Readonly<{ id: string; uri: string }>;

export function createCaptureLeaseTransaction(
  dependencies: Readonly<{
    register(): Promise<CaptureLeaseItem>;
    isAlive(): boolean;
    buildSource(item: CaptureLeaseItem): BeautyCaptureSource;
    dispatch(source: BeautyCaptureSource): void | Promise<void>;
    release(id: string): Promise<void>;
  }>,
): () => Promise<BeautyCaptureSource> {
  return async () => {
    const item = await dependencies.register();
    let transferred = false;
    try {
      if (!dependencies.isAlive()) throw abortError('Camera capture was cancelled.');
      const source = dependencies.buildSource(item);
      if (!dependencies.isAlive()) throw abortError('Camera capture was cancelled.');
      await dependencies.dispatch(source);
      transferred = true;
      return source;
    } finally {
      if (!transferred) await dependencies.release(item.id);
    }
  };
}

export function canRequestCameraPermission(input: Readonly<{
  permissionStatus: string;
  isFocused: boolean;
  appState: string;
  requestStarted: boolean;
  hasError: boolean;
}>): boolean {
  return (
    input.permissionStatus === 'not-determined' &&
    input.isFocused &&
    input.appState === 'active' &&
    !input.requestStarted &&
    !input.hasError
  );
}

export function createPermissionAttemptController() {
  let activeNonce: number | null = null;
  let attemptedNonce: number | null = null;
  return {
    begin(nonce: number): boolean {
      if (activeNonce !== null || attemptedNonce === nonce) return false;
      activeNonce = nonce;
      attemptedNonce = nonce;
      return true;
    },
    settle(nonce: number): void {
      if (activeNonce === nonce) activeNonce = null;
    },
    isRequestStarted(): boolean {
      return activeNonce !== null;
    },
  };
}

export function createWebPhotoPickerInteraction(
  dependencies: Readonly<{
    pick(): Promise<BeautyCaptureSource | null>;
    dispatch(source: BeautyCaptureSource): void | Promise<void>;
    onError(error: Error): void;
  }>,
): () => Promise<void> {
  return createSingleFlightCapture(async () => {
    try {
      const source = await dependencies.pick();
      if (source) await dependencies.dispatch(source);
    } catch (error) {
      dependencies.onError(
        error instanceof Error
          ? new Error(error.message || 'That photo could not be opened.')
          : new Error('That photo could not be opened.'),
      );
    }
  });
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function copyPoint(value: unknown): Point | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y)
    ? { x: point.x, y: point.y }
    : undefined;
}

function copyBounds(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  const bounds = value as {
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
  };
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function validSize(size: ImageSize): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

function canonicalPoint(
  point: Point,
  size: ImageSize,
  orientation: ImageOrientation,
  mirrored: boolean,
): Point {
  const x = mirrored ? size.width - point.x : point.x;
  const y = point.y;
  switch (orientation) {
    case 90:
      return { x: size.height - y, y: x };
    case 180:
      return { x: size.width - x, y: size.height - y };
    case 270:
      return { x: y, y: size.width - x };
    default:
      return { x, y };
  }
}

function scalePoint(point: Point, scaleX: number, scaleY: number): Point {
  return { x: point.x * scaleX, y: point.y * scaleY };
}

function mapFaceLandmarks(
  face: DetectedFace,
  map: (point: Point) => Point,
  bounds: DetectedFace['bounds'],
): DetectedFace {
  const result: {
    -readonly [Key in keyof DetectedFace]: DetectedFace[Key];
  } = { bounds };
  const keys = [
    'leftEye',
    'rightEye',
    'leftEyebrow',
    'rightEyebrow',
    'nose',
    'leftNostril',
    'rightNostril',
    'mouth',
  ] as const;
  for (const key of keys) {
    const point = face[key];
    if (point === null) result[key] = null;
    else if (point) result[key] = map(point);
  }
  if (face.facialHair !== undefined) {
    result.facialHair =
      face.facialHair?.map((region) => {
        const topLeft = map({ x: region.x, y: region.y });
        const bottomRight = map({
          x: region.x + region.width,
          y: region.y + region.height,
        });
        return {
          x: Math.min(topLeft.x, bottomRight.x),
          y: Math.min(topLeft.y, bottomRight.y),
          width: Math.abs(bottomRight.x - topLeft.x),
          height: Math.abs(bottomRight.y - topLeft.y),
        };
      }) ?? null;
  }
  return result;
}
