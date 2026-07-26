import { describe, expect, test } from '@jest/globals';
import { DEFAULT_BEAUTY, type BeautySettings, type ColorLook } from './types';
import {
  BEAUTY_RUNTIME_EFFECT,
  buildBeautyShaderUniforms,
  colorUniforms,
} from './beautyShader';

const COLOR_TARGET_CASES: [
  look: ColorLook,
  target: readonly [number, number, number],
][] = [
  ['natural', [1, 1, 1]],
  ['clean', [0.92, 1.08, 1.07]],
  ['golden', [1.2, 1.04, 1.03]],
  ['energy', [1.35, 1.1, 1.03]],
  ['night', [1.18, 1.22, 0.88]],
  ['mono', [0, 1.2, 1.04]],
];

describe('colorUniforms', () => {
  test.each(COLOR_TARGET_CASES)(
    '%s maps to its exact target at full strength',
    (look, target) => {
      expect(colorUniforms(look, 100)).toEqual(target);
    },
  );

  test.each([
    'natural',
    'clean',
    'golden',
    'energy',
    'night',
    'mono',
  ] as const)('%s is neutral at zero strength', (look) => {
    expect(colorUniforms(look, 0)).toEqual([1, 1, 1]);
  });

  test('linearly blends each target at half strength', () => {
    expect(colorUniforms('clean', 50)).toEqual([0.96, 1.04, 1.035]);
    expect(colorUniforms('mono', 50)).toEqual([0.5, 1.1, 1.02]);
  });

  test('clamps, rounds, and safely handles invalid runtime strengths', () => {
    expect(colorUniforms('energy', -20)).toEqual([1, 1, 1]);
    expect(colorUniforms('energy', 150)).toEqual([1.35, 1.1, 1.03]);
    expect(colorUniforms('energy', 49.5)).toEqual([1.175, 1.05, 1.015]);
    expect(colorUniforms('energy', Number.NaN)).toEqual([1, 1, 1]);
    expect(colorUniforms('energy', Number.POSITIVE_INFINITY)).toEqual([
      1,
      1,
      1,
    ]);
  });

  test('falls back to natural for an unknown runtime look', () => {
    expect(colorUniforms('vintage' as ColorLook, 100)).toEqual([1, 1, 1]);
  });

  test('is deterministic and returns a fresh tuple', () => {
    const first = colorUniforms('night', 37);
    const second = colorUniforms('night', 37);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

describe('buildBeautyShaderUniforms', () => {
  test('combines the normalized default beauty and color uniforms', () => {
    expect(buildBeautyShaderUniforms(DEFAULT_BEAUTY)).toEqual({
      smoothAmount: 0.12,
      blemishAmount: 0.08,
      shineAmount: 0.06,
      underEyeAmount: 0.0375,
      lightingAmount: 0.03,
      saturation: 0.972,
      contrast: 1.028,
      brightness: 1.0245,
    });
  });

  test('keeps color active while disabled beauty controls are neutral', () => {
    expect(
      buildBeautyShaderUniforms({
        ...DEFAULT_BEAUTY,
        enabled: false,
        colorLook: 'mono',
        colorStrength: 50,
      }),
    ).toEqual({
      smoothAmount: 0,
      blemishAmount: 0,
      shineAmount: 0,
      underEyeAmount: 0,
      lightingAmount: 0,
      saturation: 0.5,
      contrast: 1.1,
      brightness: 1.02,
    });
  });

  test('bounds every output when typed settings are corrupted at runtime', () => {
    const corrupted = {
      ...DEFAULT_BEAUTY,
      overall: Number.POSITIVE_INFINITY,
      smooth: Number.NaN,
      blemish: -10_000,
      shine: 10_000,
      underEye: Number.NEGATIVE_INFINITY,
      lighting: 10_000,
      colorLook: 'unknown',
      colorStrength: Number.NaN,
    } as unknown as BeautySettings;

    const uniforms = buildBeautyShaderUniforms(corrupted);

    expect(Object.values(uniforms).every(Number.isFinite)).toBe(true);
    expect(uniforms.smoothAmount).toBeGreaterThanOrEqual(0);
    expect(uniforms.smoothAmount).toBeLessThanOrEqual(0.36);
    expect(uniforms.blemishAmount).toBeGreaterThanOrEqual(0);
    expect(uniforms.blemishAmount).toBeLessThanOrEqual(0.24);
    expect(uniforms.shineAmount).toBeGreaterThanOrEqual(0);
    expect(uniforms.shineAmount).toBeLessThanOrEqual(0.2);
    expect(uniforms.underEyeAmount).toBeGreaterThanOrEqual(0);
    expect(uniforms.underEyeAmount).toBeLessThanOrEqual(0.15);
    expect(uniforms.lightingAmount).toBeGreaterThanOrEqual(0);
    expect(uniforms.lightingAmount).toBeLessThanOrEqual(0.12);
    expect(uniforms.saturation).toBeGreaterThanOrEqual(0);
    expect(uniforms.saturation).toBeLessThanOrEqual(1.35);
    expect(uniforms.contrast).toBeGreaterThanOrEqual(1);
    expect(uniforms.contrast).toBeLessThanOrEqual(1.22);
    expect(uniforms.brightness).toBeGreaterThanOrEqual(0.88);
    expect(uniforms.brightness).toBeLessThanOrEqual(1.07);
  });

  test('is deterministic without mutating settings', () => {
    const settings: BeautySettings = { ...DEFAULT_BEAUTY };
    const before = { ...settings };

    expect(buildBeautyShaderUniforms(settings)).toEqual(
      buildBeautyShaderUniforms(settings),
    );
    expect(settings).toEqual(before);
  });
});

describe('BEAUTY_RUNTIME_EFFECT', () => {
  test.each([
    'uniform shader image;',
    'uniform shader skinMask;',
    'uniform float smoothAmount;',
    'uniform float blemishAmount;',
    'uniform float shineAmount;',
    'uniform float underEyeAmount;',
    'uniform float lightingAmount;',
    'uniform float saturation;',
    'uniform float contrast;',
    'uniform float brightness;',
  ])('declares %s', (declaration) => {
    expect(BEAUTY_RUNTIME_EFFECT).toContain(declaration);
  });

  test('uses a fixed neighborhood and no loops or coordinate deformation', () => {
    expect(BEAUTY_RUNTIME_EFFECT).toContain('sampleNeighborhood');
    expect(BEAUTY_RUNTIME_EFFECT).not.toContain('sampleNeighborhood(shader');
    expect(BEAUTY_RUNTIME_EFFECT).not.toMatch(/\b(for|while|do)\s*\(/);
    expect(BEAUTY_RUNTIME_EFFECT).not.toMatch(
      /\b(warp|reshape|distort|displace|transform|matrix)\b/i,
    );
    expect(BEAUTY_RUNTIME_EFFECT).not.toMatch(
      /\b(sin|cos|tan|atan|normalize|distance)\s*\(/,
    );
  });

  test('gates local skin corrections by the mask and preserves source alpha', () => {
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'half mask = clamp(skinMask.eval(xy).a',
    );
    expect(BEAUTY_RUNTIME_EFFECT).toMatch(
      /mask\s*\*\s*\(smoothAmount\s*\+\s*blemishAmount\)/,
    );
    expect(BEAUTY_RUNTIME_EFFECT).toMatch(
      /shineAmount\s*\*\s*shineGate\s*\*\s*mask/,
    );
    expect(BEAUTY_RUNTIME_EFFECT).toContain('original.a');
  });

  test('implements mono-compatible luma saturation and clamps RGB output', () => {
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'mix(half3(luma), color.rgb, saturationValue)',
    );
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'clamp(rgb, half3(0.0), half3(1.0))',
    );
  });
});
