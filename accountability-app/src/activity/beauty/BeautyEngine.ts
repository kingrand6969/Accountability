import type { BeautySettings } from './types';

export type Point = Readonly<{
  x: number;
  y: number;
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
  maxFaces: number;
}>;

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

export interface BeautyEngine {
  capabilities(): Promise<BeautyCapabilities>;
  detectFaces(frameOrUri: unknown): Promise<DetectedFace[]>;
  renderFinal(sourceUri: string, settings: BeautySettings): Promise<string>;
}
