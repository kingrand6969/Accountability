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

export type BeautyRuntimeUniforms = Readonly<
  BeautyShaderUniforms & {
    saturation: number;
    contrast: number;
    brightness: number;
  }
>;

const NEUTRAL_COLOR: ColorUniforms = Object.freeze([1, 1, 1]);

const COLOR_TARGETS = Object.freeze({
  natural: Object.freeze([1, 1, 1] as const),
  clean: Object.freeze([0.92, 1.08, 1.07] as const),
  golden: Object.freeze([1.2, 1.04, 1.03] as const),
  energy: Object.freeze([1.35, 1.1, 1.03] as const),
  night: Object.freeze([1.18, 1.22, 0.88] as const),
  mono: Object.freeze([0, 1.2, 1.04] as const),
} satisfies Record<ColorLook, ColorUniforms>);

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

export function buildBeautyShaderUniforms(
  settings: BeautySettings,
): BeautyRuntimeUniforms {
  const beauty = shaderUniforms(settings);
  const [saturation, contrast, brightness] = colorUniforms(
    settings?.colorLook,
    settings?.colorStrength,
  );

  return {
    ...beauty,
    saturation,
    contrast,
    brightness,
  };
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

export const BEAUTY_RUNTIME_EFFECT = `
uniform shader image;
uniform shader skinMask;
uniform float smoothAmount;
uniform float blemishAmount;
uniform float shineAmount;
uniform float underEyeAmount;
uniform float lightingAmount;
uniform float saturation;
uniform float contrast;
uniform float brightness;

half4 sampleNeighborhood(float2 xy) {
  half4 sum = image.eval(xy) * 4.0;
  sum += image.eval(xy + float2(-1.25, 0.0)) * 0.75;
  sum += image.eval(xy + float2(1.25, 0.0)) * 0.75;
  sum += image.eval(xy + float2(0.0, -1.25)) * 0.75;
  sum += image.eval(xy + float2(0.0, 1.25)) * 0.75;
  sum += image.eval(xy + float2(-0.9, -0.9)) * 0.25;
  sum += image.eval(xy + float2(0.9, -0.9)) * 0.25;
  sum += image.eval(xy + float2(-0.9, 0.9)) * 0.25;
  sum += image.eval(xy + float2(0.9, 0.9)) * 0.25;
  return sum * 0.125;
}

half4 applyColor(
  half4 color,
  float saturationValue,
  float contrastValue,
  float brightnessValue
) {
  half luma = dot(color.rgb, half3(0.2126, 0.7152, 0.0722));
  half3 rgb = mix(half3(luma), color.rgb, saturationValue);
  rgb = (rgb - half3(0.5)) * contrastValue + half3(0.5);
  rgb *= brightnessValue;
  return half4(clamp(rgb, half3(0.0), half3(1.0)), color.a);
}

half4 main(float2 xy) {
  half4 original = image.eval(xy);
  half mask = clamp(skinMask.eval(xy).a, 0.0, 1.0);
  half4 localAverage = sampleNeighborhood(xy);
  half soften = clamp(mask * (smoothAmount + blemishAmount), 0.0, 0.6);
  half3 skinRgb = mix(original.rgb, localAverage.rgb, soften);

  half skinLuma = dot(skinRgb, half3(0.2126, 0.7152, 0.0722));
  half shineGate = smoothstep(0.62, 0.92, skinLuma);
  skinRgb *= 1.0 - shineAmount * shineGate * mask;

  half shadowGate = 1.0 - smoothstep(0.2, 0.55, skinLuma);
  skinRgb += half3(underEyeAmount * shadowGate * mask * 0.25);
  skinRgb += half3(lightingAmount * mask * 0.35);
  skinRgb = clamp(skinRgb, half3(0.0), half3(1.0));

  return applyColor(
    half4(skinRgb, original.a),
    saturation,
    contrast,
    brightness
  );
}
`;
