import type {
  Bounds,
  DetectedFace,
  Point,
} from './BeautyEngine';
import {
  effectiveBeautySettings,
  type BeautySettings,
} from './types';

export const MAX_BEAUTY_FACES = 8;
export const MAX_MASK_REGIONS = 12;

export type ImageSize = Readonly<{
  width: number;
  height: number;
}>;

export type EllipseRegion = Readonly<{
  kind: 'ellipse';
  center: Point;
  radiusX: number;
  radiusY: number;
  feather: number;
}>;

export type FaceMask = Readonly<{
  coordinateSpace: 'canonical-unmirrored-image-pixels';
  faceBounds: Bounds;
  coverage: EllipseRegion;
  exclusions: readonly EllipseRegion[];
  contains(point: Point): boolean;
}>;

export type BeautyShaderUniforms = Readonly<{
  smoothAmount: number;
  blemishAmount: number;
  shineAmount: number;
  underEyeAmount: number;
  lightingAmount: number;
}>;

export type FaceRenderPlan = Readonly<{
  mask: FaceMask;
  uniforms: BeautyShaderUniforms;
}>;

type LandmarkName =
  | 'leftEye'
  | 'rightEye'
  | 'leftEyebrow'
  | 'rightEyebrow'
  | 'nose'
  | 'leftNostril'
  | 'rightNostril'
  | 'mouth';

type LandmarkRegionScale = Readonly<{
  name: LandmarkName;
  radiusX: number;
  radiusY: number;
}>;

const COORDINATE_SPACE =
  'canonical-unmirrored-image-pixels' as const;
const FACE_INSET_X = 0.04;
const FACE_INSET_Y = 0.04;
const FACE_FEATHER = 0.08;
const EXCLUSION_FEATHER = 0.025;

const LANDMARK_REGION_SCALES: readonly LandmarkRegionScale[] = Object.freeze([
  { name: 'leftEye', radiusX: 0.1, radiusY: 0.055 },
  { name: 'rightEye', radiusX: 0.1, radiusY: 0.055 },
  { name: 'leftEyebrow', radiusX: 0.12, radiusY: 0.045 },
  { name: 'rightEyebrow', radiusX: 0.12, radiusY: 0.045 },
  { name: 'nose', radiusX: 0.07, radiusY: 0.12 },
  { name: 'leftNostril', radiusX: 0.045, radiusY: 0.035 },
  { name: 'rightNostril', radiusX: 0.045, radiusY: 0.035 },
  { name: 'mouth', radiusX: 0.16, radiusY: 0.08 },
]);

class EllipseFaceMask implements FaceMask {
  readonly coordinateSpace = COORDINATE_SPACE;

  constructor(
    readonly faceBounds: Bounds,
    readonly coverage: EllipseRegion,
    readonly exclusions: readonly EllipseRegion[],
  ) {}

  contains(point: Point): boolean {
    if (!isFinitePoint(point) || !ellipseContains(this.coverage, point)) {
      return false;
    }

    return !this.exclusions.some((region) => ellipseContains(region, point));
  }
}

export function buildFaceMask(
  face: DetectedFace,
  image: ImageSize,
): FaceMask | null {
  if (!isValidImageSize(image)) return null;

  const faceBounds = clampBounds(face.bounds, image);
  if (!faceBounds) return null;

  const coverage = ellipseFromBounds(
    insetBounds(faceBounds, FACE_INSET_X, FACE_INSET_Y),
    Math.max(1, Math.min(faceBounds.width, faceBounds.height) * FACE_FEATHER),
  );
  const exclusions: EllipseRegion[] = [];
  const exclusionFeather = Math.max(
    0.5,
    Math.min(faceBounds.width, faceBounds.height) * EXCLUSION_FEATHER,
  );

  for (const scale of LANDMARK_REGION_SCALES) {
    if (exclusions.length >= MAX_MASK_REGIONS - 1) break;
    const point = clampPoint(face[scale.name], image);
    if (!point) continue;
    exclusions.push({
      kind: 'ellipse',
      center: point,
      radiusX: Math.max(1, faceBounds.width * scale.radiusX),
      radiusY: Math.max(1, faceBounds.height * scale.radiusY),
      feather: exclusionFeather,
    });
  }

  const facialHair = Array.isArray(face.facialHair)
    ? face.facialHair
    : [];
  const availableRegionSlots = MAX_MASK_REGIONS - 1 - exclusions.length;
  for (
    let index = 0;
    index < facialHair.length && index < availableRegionSlots;
    index += 1
  ) {
    const bounds = clampBounds(facialHair[index], image);
    if (!bounds) continue;
    exclusions.push(ellipseFromBounds(bounds, exclusionFeather));
  }

  return new EllipseFaceMask(
    { ...faceBounds },
    cloneEllipse(coverage),
    exclusions.map(cloneEllipse),
  );
}

export function buildFaceMasks(
  faces: readonly DetectedFace[],
  image: ImageSize,
): FaceMask[] {
  if (!isValidImageSize(image) || !Array.isArray(faces)) return [];

  const masks: FaceMask[] = [];
  const workLimit = Math.min(faces.length, MAX_BEAUTY_FACES);
  for (let index = 0; index < workLimit; index += 1) {
    const mask = buildFaceMask(faces[index], image);
    if (mask) masks.push(mask);
  }
  return masks;
}

export function shaderUniforms(
  settings: BeautySettings,
): BeautyShaderUniforms {
  const effective = effectiveBeautySettings(settings);

  return {
    smoothAmount: boundedAmount(effective.smooth * 0.006, 0.36),
    blemishAmount: boundedAmount(effective.blemish * 0.004, 0.24),
    shineAmount: boundedAmount(effective.shine * 0.004, 0.2),
    underEyeAmount: boundedAmount(effective.underEye * 0.00375, 0.15),
    lightingAmount: boundedAmount(effective.lighting * 0.003, 0.12),
  };
}

export function buildFaceRenderPlans(
  faces: readonly DetectedFace[],
  image: ImageSize,
  settings: BeautySettings,
): FaceRenderPlan[] {
  const masks = buildFaceMasks(faces, image);
  if (masks.length === 0) return [];

  const uniforms = shaderUniforms(settings);
  return masks.map((mask) => ({
    mask,
    uniforms: { ...uniforms },
  }));
}

function isValidImageSize(image: ImageSize): boolean {
  return (
    isFiniteNumber(image?.width) &&
    image.width > 0 &&
    isFiniteNumber(image?.height) &&
    image.height > 0
  );
}

function clampBounds(bounds: Bounds, image: ImageSize): Bounds | null {
  if (
    !bounds ||
    !isFiniteNumber(bounds.x) ||
    !isFiniteNumber(bounds.y) ||
    !isFiniteNumber(bounds.width) ||
    !isFiniteNumber(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }

  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  if (!isFiniteNumber(right) || !isFiniteNumber(bottom)) return null;

  const x = clamp(bounds.x, 0, image.width);
  const y = clamp(bounds.y, 0, image.height);
  const clampedRight = clamp(right, 0, image.width);
  const clampedBottom = clamp(bottom, 0, image.height);
  const width = clampedRight - x;
  const height = clampedBottom - y;

  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function clampPoint(
  point: Point | null | undefined,
  image: ImageSize,
): Point | null {
  if (!isFinitePoint(point)) return null;
  return {
    x: clamp(point.x, 0, image.width),
    y: clamp(point.y, 0, image.height),
  };
}

function isFinitePoint(
  point: Point | null | undefined,
): point is Point {
  return (
    point !== null &&
    point !== undefined &&
    isFiniteNumber(point.x) &&
    isFiniteNumber(point.y)
  );
}

function insetBounds(
  bounds: Bounds,
  horizontalRatio: number,
  verticalRatio: number,
): Bounds {
  const horizontalInset = bounds.width * horizontalRatio;
  const verticalInset = bounds.height * verticalRatio;
  return {
    x: bounds.x + horizontalInset,
    y: bounds.y + verticalInset,
    width: bounds.width - horizontalInset * 2,
    height: bounds.height - verticalInset * 2,
  };
}

function ellipseFromBounds(
  bounds: Bounds,
  feather: number,
): EllipseRegion {
  return {
    kind: 'ellipse',
    center: {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
    radiusX: bounds.width / 2,
    radiusY: bounds.height / 2,
    feather,
  };
}

function cloneEllipse(region: EllipseRegion): EllipseRegion {
  return {
    kind: 'ellipse',
    center: { ...region.center },
    radiusX: region.radiusX,
    radiusY: region.radiusY,
    feather: region.feather,
  };
}

function ellipseContains(region: EllipseRegion, point: Point): boolean {
  if (region.radiusX <= 0 || region.radiusY <= 0) return false;
  const horizontal = (point.x - region.center.x) / region.radiusX;
  const vertical = (point.y - region.center.y) / region.radiusY;
  return horizontal * horizontal + vertical * vertical <= 1;
}

function boundedAmount(value: number, maximum: number): number {
  if (!isFiniteNumber(value)) return 0;
  return Math.min(maximum, Math.max(0, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
