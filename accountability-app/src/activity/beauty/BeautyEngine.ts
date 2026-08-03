import type { BeautySettings } from './types';

export const MAX_BEAUTY_FACES = 8 as const;

export type Point = Readonly<{
  x: number;
  y: number;
}>;

export type ImageSize = Readonly<{
  width: number;
  height: number;
}>;

export type Bounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type BeautyCapabilities = Readonly<{
  livePreview: boolean;
  finalRender: boolean;
  maxFaces: typeof MAX_BEAUTY_FACES;
}>;

export type ImageOrientation = 0 | 90 | 180 | 270;

type CancellableDetectionInput = Readonly<{
  signal?: AbortSignal;
}>;

export type FrameDetectionInput = CancellableDetectionInput &
  Readonly<{
    kind: 'frame';
    frame: unknown;
    imageSize: ImageSize;
    orientation: ImageOrientation;
    mirrored: boolean;
  }>;

export type UriDetectionInput = CancellableDetectionInput &
  Readonly<{
    kind: 'uri';
    uri: string;
    imageSize?: ImageSize;
    orientation: ImageOrientation;
  }>;

export type BeautyDetectionInput =
  | FrameDetectionInput
  | UriDetectionInput;

/**
 * Face geometry in canonical, unmirrored image pixels.
 *
 * Camera preview adapters are responsible for rotating or mirroring these
 * coordinates for display. This shape deliberately carries no identity,
 * embedding, or inferred demographic data.
 */
export type DetectedFace = Readonly<{
  bounds: Bounds;
  leftEye?: Point | null;
  rightEye?: Point | null;
  leftEyebrow?: Point | null;
  rightEyebrow?: Point | null;
  nose?: Point | null;
  leftNostril?: Point | null;
  rightNostril?: Point | null;
  mouth?: Point | null;
  facialHair?: readonly Bounds[] | null;
}>;

type MutableDetectedFace = {
  -readonly [Key in keyof DetectedFace]: DetectedFace[Key];
};

type OwnDataResult =
  | Readonly<{ found: false }>
  | Readonly<{ found: true; value: unknown }>;

const LANDMARK_FIELDS = Object.freeze([
  'leftEye',
  'rightEye',
  'leftEyebrow',
  'rightEyebrow',
  'nose',
  'leftNostril',
  'rightNostril',
  'mouth',
] as const);

const MAX_SANITIZED_HAIR_REGIONS = 12;

/**
 * Copies only renderer-approved face geometry from an untrusted native value.
 * Accessors, proxy traps, tracking identifiers, embeddings, inferred
 * demographics, and every other extra field fail closed and are never copied.
 */
export function sanitizeDetectedFace(value: unknown): DetectedFace | null {
  const boundsValue = ownDataValue(value, 'bounds');
  if (!boundsValue.found) return null;
  const bounds = sanitizeBounds(boundsValue.value);
  if (!bounds) return null;

  const face: MutableDetectedFace = { bounds };
  for (const field of LANDMARK_FIELDS) {
    const landmarkValue = ownDataValue(value, field);
    if (!landmarkValue.found) continue;
    if (landmarkValue.value === null) {
      face[field] = null;
      continue;
    }
    const point = sanitizePoint(landmarkValue.value);
    if (point) face[field] = point;
  }

  const facialHairValue = ownDataValue(value, 'facialHair');
  if (facialHairValue.found) {
    if (facialHairValue.value === null) {
      face.facialHair = null;
    } else {
      const regions = sanitizeBoundsList(facialHairValue.value);
      if (regions) face.facialHair = regions;
    }
  }

  return face;
}

/**
 * Sanitizes and caps untrusted detector output before any mask work occurs.
 */
export function sanitizeDetectedFaces(value: unknown): DetectedFace[] {
  if (!isArray(value)) return [];
  const lengthValue = ownDataValue(value, 'length');
  if (
    !lengthValue.found ||
    !Number.isSafeInteger(lengthValue.value) ||
    (lengthValue.value as number) < 0
  ) {
    return [];
  }

  const faces: DetectedFace[] = [];
  const workLimit = Math.min(
    lengthValue.value as number,
    MAX_BEAUTY_FACES,
  );
  for (let index = 0; index < workLimit; index += 1) {
    const item = ownDataValue(value, String(index));
    if (!item.found) continue;
    const face = sanitizeDetectedFace(item.value);
    if (face) faces.push(face);
  }
  return faces;
}

export interface BeautyEngine {
  capabilities(): Promise<BeautyCapabilities>;
  /**
   * Returns sanitized geometry in canonical, unmirrored image pixels.
   * Adapters resolve source orientation and mirroring before returning.
   */
  detectFaces(input: BeautyDetectionInput): Promise<DetectedFace[]>;
  renderFinal(sourceUri: string, settings: BeautySettings): Promise<string>;
}

function sanitizePoint(value: unknown): Point | null {
  const x = ownDataValue(value, 'x');
  const y = ownDataValue(value, 'y');
  if (
    !x.found ||
    !y.found ||
    !isFiniteNumber(x.value) ||
    !isFiniteNumber(y.value)
  ) {
    return null;
  }
  return { x: x.value, y: y.value };
}

function sanitizeBounds(value: unknown): Bounds | null {
  const x = ownDataValue(value, 'x');
  const y = ownDataValue(value, 'y');
  const width = ownDataValue(value, 'width');
  const height = ownDataValue(value, 'height');
  if (
    !x.found ||
    !y.found ||
    !width.found ||
    !height.found ||
    !isFiniteNumber(x.value) ||
    !isFiniteNumber(y.value) ||
    !isFiniteNumber(width.value) ||
    !isFiniteNumber(height.value) ||
    width.value <= 0 ||
    height.value <= 0
  ) {
    return null;
  }
  return {
    x: x.value,
    y: y.value,
    width: width.value,
    height: height.value,
  };
}

function sanitizeBoundsList(value: unknown): Bounds[] | null {
  if (!isArray(value)) return null;
  const lengthValue = ownDataValue(value, 'length');
  if (
    !lengthValue.found ||
    !Number.isSafeInteger(lengthValue.value) ||
    (lengthValue.value as number) < 0
  ) {
    return null;
  }

  const bounds: Bounds[] = [];
  const workLimit = Math.min(
    lengthValue.value as number,
    MAX_SANITIZED_HAIR_REGIONS,
  );
  for (let index = 0; index < workLimit; index += 1) {
    const item = ownDataValue(value, String(index));
    if (!item.found) continue;
    const region = sanitizeBounds(item.value);
    if (region) bounds.push(region);
  }
  return bounds;
}

function ownDataValue(value: unknown, key: string): OwnDataResult {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  ) {
    return { found: false };
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? { found: true, value: descriptor.value }
      : { found: false };
  } catch {
    return { found: false };
  }
}

function isArray(value: unknown): value is readonly unknown[] {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
