import {
  MAX_BEAUTY_FACES,
  sanitizeDetectedFace,
  sanitizeDetectedFaces,
  type Bounds,
  type DetectedFace,
  type ImageSize,
  type Point,
} from './BeautyEngine';
import {
  effectiveBeautySettings,
  type BeautySettings,
} from './types';

export const MAX_MASK_REGIONS = 12;

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
  /**
   * Returns feathered mask alpha. Coverage fades inward from the outer oval;
   * feature exclusions fade from protected centers back to full coverage.
   */
  coverageAt(point: Point): number;
  /** Uses a strict alpha threshold: coverageAt(point) > 0.5. */
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
// Allows small detector jitter near a cropped face without accepting distant
// image coordinates as facial landmarks.
const LANDMARK_FACE_TOLERANCE = 0.2;

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

  coverageAt(point: Point): number {
    if (!isFinitePoint(point)) return 0;

    let coverage = inwardEllipseCoverage(this.coverage, point);
    for (const exclusion of this.exclusions) {
      coverage = Math.min(
        coverage,
        exclusionProtection(exclusion, point),
      );
    }
    return stableAlpha(coverage);
  }

  contains(point: Point): boolean {
    return this.coverageAt(point) > 0.5;
  }
}

export function buildFaceMask(
  face: unknown,
  image: ImageSize,
): FaceMask | null {
  if (!isValidImageSize(image)) return null;
  const sanitized = sanitizeDetectedFace(face);
  if (!sanitized) return null;
  return buildSanitizedFaceMask(sanitized, image);
}

function buildSanitizedFaceMask(
  face: DetectedFace,
  image: ImageSize,
): FaceMask | null {
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
    const point = validLandmarkPoint(
      face[scale.name],
      image,
      faceBounds,
    );
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
    if (!bounds || !boundsCenterInside(bounds, expandedFaceBounds(faceBounds))) {
      continue;
    }
    exclusions.push(ellipseFromBounds(bounds, exclusionFeather));
  }

  return new EllipseFaceMask(
    { ...faceBounds },
    cloneEllipse(coverage),
    exclusions.map(cloneEllipse),
  );
}

export function buildFaceMasks(
  faces: unknown,
  image: ImageSize,
): FaceMask[] {
  if (!isValidImageSize(image)) return [];

  const masks: FaceMask[] = [];
  const sanitizedFaces = sanitizeDetectedFaces(faces);
  const workLimit = Math.min(sanitizedFaces.length, MAX_BEAUTY_FACES);
  for (let index = 0; index < workLimit; index += 1) {
    const mask = buildSanitizedFaceMask(sanitizedFaces[index], image);
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
  faces: unknown,
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

function validLandmarkPoint(
  point: Point | null | undefined,
  image: ImageSize,
  faceBounds: Bounds,
): Point | null {
  if (!isFinitePoint(point)) return null;
  if (
    point.x < 0 ||
    point.x > image.width ||
    point.y < 0 ||
    point.y > image.height ||
    !pointInsideBounds(point, expandedFaceBounds(faceBounds))
  ) {
    return null;
  }
  return { x: point.x, y: point.y };
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

function expandedFaceBounds(bounds: Bounds): Bounds {
  const horizontal = bounds.width * LANDMARK_FACE_TOLERANCE;
  const vertical = bounds.height * LANDMARK_FACE_TOLERANCE;
  return {
    x: bounds.x - horizontal,
    y: bounds.y - vertical,
    width: bounds.width + horizontal * 2,
    height: bounds.height + vertical * 2,
  };
}

function pointInsideBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function boundsCenterInside(bounds: Bounds, container: Bounds): boolean {
  return pointInsideBounds(
    {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
    container,
  );
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

function ellipsePosition(
  region: EllipseRegion,
  point: Point,
): Readonly<{ radial: number; inwardDistance: number }> | null {
  if (region.radiusX <= 0 || region.radiusY <= 0) return null;
  const deltaX = point.x - region.center.x;
  const deltaY = point.y - region.center.y;
  const horizontal = deltaX / region.radiusX;
  const vertical = deltaY / region.radiusY;
  const radial = Math.hypot(horizontal, vertical);
  if (!Number.isFinite(radial)) return null;
  if (radial === 0) {
    return {
      radial,
      inwardDistance: Math.min(region.radiusX, region.radiusY),
    };
  }
  const localRadius = Math.hypot(deltaX, deltaY) / radial;
  return {
    radial,
    inwardDistance: Math.max(0, (1 - radial) * localRadius),
  };
}

function inwardEllipseCoverage(
  region: EllipseRegion,
  point: Point,
): number {
  const position = ellipsePosition(region, point);
  if (!position || position.radial >= 1) return 0;
  if (region.feather <= 0) return 1;
  return clamp(position.inwardDistance / region.feather, 0, 1);
}

function exclusionProtection(
  region: EllipseRegion,
  point: Point,
): number {
  const position = ellipsePosition(region, point);
  if (!position || position.radial >= 1) return 1;
  if (region.feather <= 0) return 0;
  return clamp(1 - position.inwardDistance / region.feather, 0, 1);
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

function stableAlpha(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1_000_000_000_000) /
    1_000_000_000_000;
}
