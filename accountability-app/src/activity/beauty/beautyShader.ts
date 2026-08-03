import { shaderUniforms, type BeautyShaderUniforms } from './beautyMath';
import {
  COLOR_LOOKS,
  type BeautySettings,
  type ColorLook,
} from './types';

export type ColorUniforms = readonly [
  saturation: number,
  contrast: number,
  brightness: number,
];

export type ColorGainUniforms = readonly [
  redGain: number,
  greenGain: number,
  blueGain: number,
  highlightCompression: number,
];

export type BeautyRuntimeUniforms = Readonly<
  BeautyShaderUniforms & {
    saturation: number;
    contrast: number;
    brightness: number;
    redGain: number;
    greenGain: number;
    blueGain: number;
    highlightCompression: number;
  }
>;

export const BEAUTY_SHADER_CHILDREN = Object.freeze([
  'image',
  'skinMask',
  'underEyeMask',
] as const);

export type BeautyShaderChild = (typeof BEAUTY_SHADER_CHILDREN)[number];

export type PremultipliedPixel = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

export type StraightRgb = readonly [
  red: number,
  green: number,
  blue: number,
];

export type ReferenceBeautyTap = Readonly<{
  pixel: PremultipliedPixel;
  skinMask: number;
  weight: number;
}>;

export type ReferenceBeautyPixelInput = Readonly<{
  original: PremultipliedPixel;
  skinMask: number;
  underEyeMask: number;
  uniforms: BeautyRuntimeUniforms;
  neighborhood: readonly ReferenceBeautyTap[];
}>;

export type ReferenceBeautyPixelResult = Readonly<{
  pixel: PremultipliedPixel;
  sampledNeighbors: number;
  acceptedNeighbors: number;
}>;

const ALPHA_EPSILON = 0.001;
const NEUTRAL_COLOR: ColorUniforms = Object.freeze([1, 1, 1]);
const NEUTRAL_GAINS: ColorGainUniforms = Object.freeze([1, 1, 1, 0]);

const COLOR_TARGETS = Object.freeze({
  natural: Object.freeze([1, 1, 1] as const),
  clean: Object.freeze([0.92, 1.08, 1.07] as const),
  golden: Object.freeze([1.2, 1.04, 1.03] as const),
  energy: Object.freeze([1.35, 1.1, 1.03] as const),
  night: Object.freeze([1.18, 1.22, 0.88] as const),
  mono: Object.freeze([0, 1.2, 1.04] as const),
} satisfies Record<ColorLook, ColorUniforms>);

const COLOR_GAIN_TARGETS = Object.freeze({
  natural: Object.freeze([1, 1, 1, 0] as const),
  clean: Object.freeze([0.99, 1.01, 1.025, 0.01] as const),
  golden: Object.freeze([1.1, 1.02, 0.9, 0.02] as const),
  energy: Object.freeze([1.06, 1.015, 0.97, 0.01] as const),
  night: Object.freeze([0.94, 1.01, 1.1, 0.12] as const),
  mono: Object.freeze([1, 1, 1, 0] as const),
} satisfies Record<ColorLook, ColorGainUniforms>);

export function colorUniforms(
  look: ColorLook,
  strength: number,
): ColorUniforms {
  const safeLook = isColorLook(look) ? look : 'natural';
  const target = COLOR_TARGETS[safeLook];
  const blend = boundedStrength(strength) / 100;

  return [
    blendUniform(NEUTRAL_COLOR[0], target[0], blend),
    blendUniform(NEUTRAL_COLOR[1], target[1], blend),
    blendUniform(NEUTRAL_COLOR[2], target[2], blend),
  ];
}

export function colorGains(
  look: ColorLook,
  strength: number,
): ColorGainUniforms {
  const safeLook = isColorLook(look) ? look : 'natural';
  const target = COLOR_GAIN_TARGETS[safeLook];
  const blend = boundedStrength(strength) / 100;

  return [
    blendUniform(NEUTRAL_GAINS[0], target[0], blend),
    blendUniform(NEUTRAL_GAINS[1], target[1], blend),
    blendUniform(NEUTRAL_GAINS[2], target[2], blend),
    blendUniform(NEUTRAL_GAINS[3], target[3], blend),
  ];
}

export function buildBeautyShaderUniforms(
  settings: BeautySettings,
): BeautyRuntimeUniforms {
  const beauty = shaderUniforms(settings);
  const [saturation, contrast, brightness] = colorUniforms(
    settings?.colorLook,
    settings?.colorStrength,
  );
  const [redGain, greenGain, blueGain, highlightCompression] = colorGains(
    settings?.colorLook,
    settings?.colorStrength,
  );

  return {
    ...beauty,
    saturation,
    contrast,
    brightness,
    redGain,
    greenGain,
    blueGain,
    highlightCompression,
  };
}

export function unpremultiplyPixel(pixel: PremultipliedPixel): StraightRgb {
  const alpha = boundedUnit(pixel?.[3]);
  if (alpha <= ALPHA_EPSILON) return [0, 0, 0];

  return [
    boundedUnit(roundUniform(boundedUnit(pixel?.[0]) / alpha)),
    boundedUnit(roundUniform(boundedUnit(pixel?.[1]) / alpha)),
    boundedUnit(roundUniform(boundedUnit(pixel?.[2]) / alpha)),
  ];
}

export function referenceBeautyPixel(
  input: ReferenceBeautyPixelInput,
): ReferenceBeautyPixelResult {
  const originalAlpha = boundedUnit(input.original?.[3]);
  const originalRgb = unpremultiplyPixel(input.original);
  const mask = boundedUnit(input.skinMask);
  const underEye = boundedUnit(input.underEyeMask);
  const soften = bounded(
    mask *
      (boundedUnit(input.uniforms.smoothAmount) +
        boundedUnit(input.uniforms.blemishAmount)),
    0,
    0.6,
    0,
  );

  let sampledNeighbors = 0;
  let acceptedNeighbors = 0;
  let skinRgb: StraightRgb = originalRgb;

  if (mask > ALPHA_EPSILON && soften > ALPHA_EPSILON) {
    sampledNeighbors = input.neighborhood.length;
    const centerWeight = originalAlpha > ALPHA_EPSILON ? 4 * mask : 0;
    const weighted = originalRgb.map((channel) => channel * centerWeight);
    let weightTotal = centerWeight;

    for (const tap of input.neighborhood) {
      const tapAlpha = boundedUnit(tap.pixel?.[3]);
      const tapMask = boundedUnit(tap.skinMask);
      const baseWeight = bounded(tap.weight, 0, 100, 0);
      if (
        tapAlpha <= ALPHA_EPSILON ||
        tapMask <= ALPHA_EPSILON ||
        baseWeight <= 0
      ) {
        continue;
      }

      acceptedNeighbors += 1;
      const weight = baseWeight * tapMask;
      const straight = unpremultiplyPixel(tap.pixel);
      weighted[0] += straight[0] * weight;
      weighted[1] += straight[1] * weight;
      weighted[2] += straight[2] * weight;
      weightTotal += weight;
    }

    const localAverage: StraightRgb =
      weightTotal > ALPHA_EPSILON
        ? [
            weighted[0] / weightTotal,
            weighted[1] / weightTotal,
            weighted[2] / weightTotal,
          ]
        : originalRgb;
    skinRgb = mixRgb(originalRgb, localAverage, soften);
  }

  const skinLuma = luma(skinRgb);
  const shineGate = smoothstep(0.62, 0.92, skinLuma);
  const shineScale =
    1 -
    boundedUnit(input.uniforms.shineAmount) *
      shineGate *
      mask;
  let corrected: [number, number, number] = [
    skinRgb[0] * shineScale,
    skinRgb[1] * shineScale,
    skinRgb[2] * shineScale,
  ];

  const shadowGate = 1 - smoothstep(0.2, 0.55, skinLuma);
  const underEyeLift =
    boundedUnit(input.uniforms.underEyeAmount) *
    shadowGate *
    underEye *
    0.25;
  const lightingLift =
    boundedUnit(input.uniforms.lightingAmount) * mask * 0.35;
  corrected = [
    boundedUnit(corrected[0] + underEyeLift + lightingLift),
    boundedUnit(corrected[1] + underEyeLift + lightingLift),
    boundedUnit(corrected[2] + underEyeLift + lightingLift),
  ];

  const colored = applyReferenceColor(corrected, input.uniforms);
  const pixel: PremultipliedPixel =
    originalAlpha <= ALPHA_EPSILON
      ? [0, 0, 0, originalAlpha]
      : [
          roundUniform(colored[0] * originalAlpha),
          roundUniform(colored[1] * originalAlpha),
          roundUniform(colored[2] * originalAlpha),
          originalAlpha,
        ];

  return { pixel, sampledNeighbors, acceptedNeighbors };
}

function isColorLook(value: unknown): value is ColorLook {
  return (
    typeof value === 'string' &&
    (COLOR_LOOKS as readonly string[]).includes(value)
  );
}

function boundedStrength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function blendUniform(neutral: number, target: number, blend: number): number {
  return roundUniform(neutral + (target - neutral) * blend);
}

function roundUniform(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function bounded(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function boundedUnit(value: unknown): number {
  return bounded(value, 0, 1, 0);
}

function luma(rgb: StraightRgb): number {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = bounded((value - edge0) / (edge1 - edge0), 0, 1, 0);
  return t * t * (3 - 2 * t);
}

function mixRgb(
  from: StraightRgb,
  to: StraightRgb,
  amount: number,
): StraightRgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

function applyReferenceColor(
  color: StraightRgb,
  uniforms: BeautyRuntimeUniforms,
): StraightRgb {
  const colorLuma = luma(color);
  const saturation = bounded(uniforms.saturation, 0, 1.35, 1);
  const saturated = color.map(
    (channel) => colorLuma + (channel - colorLuma) * saturation,
  );
  const contrasted = saturated.map(
    (channel) =>
      ((channel - 0.5) * bounded(uniforms.contrast, 1, 1.22, 1) + 0.5) *
      bounded(uniforms.brightness, 0.88, 1.07, 1),
  );
  const gained = [
    contrasted[0] * bounded(uniforms.redGain, 0.94, 1.1, 1),
    contrasted[1] * bounded(uniforms.greenGain, 1, 1.02, 1),
    contrasted[2] * bounded(uniforms.blueGain, 0.9, 1.1, 1),
  ];
  const peak = Math.max(gained[0], gained[1], gained[2]);
  const compression =
    bounded(uniforms.highlightCompression, 0, 0.12, 0) *
    smoothstep(0.65, 1, peak);

  return [
    roundUniform(boundedUnit(gained[0] * (1 - compression))),
    roundUniform(boundedUnit(gained[1] * (1 - compression))),
    roundUniform(boundedUnit(gained[2] * (1 - compression))),
  ];
}

export const BEAUTY_RUNTIME_EFFECT = `
uniform shader image;
uniform shader skinMask;
uniform shader underEyeMask;
uniform float smoothAmount;
uniform float blemishAmount;
uniform float shineAmount;
uniform float underEyeAmount;
uniform float lightingAmount;
uniform float saturation;
uniform float contrast;
uniform float brightness;
uniform float redGain;
uniform float greenGain;
uniform float blueGain;
uniform float highlightCompression;

half3 straightRgb(half4 color) {
  return color.a > 0.001
    ? clamp(color.rgb / color.a, half3(0.0), half3(1.0))
    : half3(0.0);
}

half4 weightedSkinTap(float2 tapXy, float baseWeight) {
  half4 tap = image.eval(tapXy);
  half tapMask = clamp(skinMask.eval(tapXy).a, 0.0, 1.0);
  half accepted =
    tap.a > 0.001 && tapMask > 0.001 ? 1.0 : 0.0;
  half weight = baseWeight * tapMask * accepted;
  return half4(straightRgb(tap) * weight, weight);
}

half3 sampleSkinNeighborhood(
  float2 xy,
  half4 center,
  half centerMask
) {
  half centerWeight = center.a > 0.001 ? 4.0 * centerMask : 0.0;
  half4 sum = half4(straightRgb(center) * centerWeight, centerWeight);
  sum += weightedSkinTap(xy + float2(-1.25, 0.0), 0.75);
  sum += weightedSkinTap(xy + float2(1.25, 0.0), 0.75);
  sum += weightedSkinTap(xy + float2(0.0, -1.25), 0.75);
  sum += weightedSkinTap(xy + float2(0.0, 1.25), 0.75);
  sum += weightedSkinTap(xy + float2(-0.9, -0.9), 0.25);
  sum += weightedSkinTap(xy + float2(0.9, -0.9), 0.25);
  sum += weightedSkinTap(xy + float2(-0.9, 0.9), 0.25);
  sum += weightedSkinTap(xy + float2(0.9, 0.9), 0.25);
  return sum.a > 0.001 ? sum.rgb / sum.a : straightRgb(center);
}

half3 applyColor(
  half3 color,
  float saturationValue,
  float contrastValue,
  float brightnessValue
) {
  half luma = dot(color, half3(0.2126, 0.7152, 0.0722));
  half3 rgb = mix(half3(luma), color, saturationValue);
  rgb = (rgb - half3(0.5)) * contrastValue + half3(0.5);
  rgb *= brightnessValue;
  rgb *= half3(redGain, greenGain, blueGain);
  half peak = max(rgb.r, max(rgb.g, rgb.b));
  half highlightGate = smoothstep(0.65, 1.0, peak);
  rgb *= 1.0 - highlightCompression * highlightGate;
  return clamp(rgb, half3(0.0), half3(1.0));
}

half4 main(float2 xy) {
  half4 original = image.eval(xy);
  half mask = clamp(skinMask.eval(xy).a, 0.0, 1.0);
  half underEye = clamp(underEyeMask.eval(xy).a, 0.0, 1.0);
  half3 skinRgb = straightRgb(original);
  half soften = clamp(mask * (smoothAmount + blemishAmount), 0.0, 0.6);
  if (mask > 0.001 && soften > 0.001) {
    half3 localAverage = sampleSkinNeighborhood(xy, original, mask);
    skinRgb = mix(skinRgb, localAverage, soften);
  }

  half skinLuma = dot(skinRgb, half3(0.2126, 0.7152, 0.0722));
  half shineGate = smoothstep(0.62, 0.92, skinLuma);
  skinRgb *= 1.0 - shineAmount * shineGate * mask;

  half shadowGate = 1.0 - smoothstep(0.2, 0.55, skinLuma);
  skinRgb += half3(underEyeAmount * shadowGate * underEye * 0.25);
  skinRgb += half3(lightingAmount * mask * 0.35);
  skinRgb = clamp(skinRgb, half3(0.0), half3(1.0));

  half3 colored = applyColor(
    skinRgb,
    saturation,
    contrast,
    brightness
  );
  return half4(colored * original.a, original.a);
}
`;
