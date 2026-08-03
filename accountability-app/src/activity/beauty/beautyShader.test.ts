import { describe, expect, jest, test } from '@jest/globals';
import { dirname, join } from 'node:path';
import { TextDecoder as NodeTextDecoder } from 'node:util';
import CanvasKitInit from 'canvaskit-wasm';
import { DEFAULT_BEAUTY, type BeautySettings, type ColorLook } from './types';
import {
  BEAUTY_RUNTIME_EFFECT,
  BEAUTY_SHADER_CHILDREN,
  buildBeautyShaderUniforms,
  colorGains,
  colorUniforms,
  referenceBeautyPixel,
  unpremultiplyPixel,
  type ColorGainUniforms,
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

const COLOR_GAIN_CASES: [
  look: ColorLook,
  gains: ColorGainUniforms,
][] = [
  ['natural', [1, 1, 1, 0]],
  ['clean', [0.99, 1.01, 1.025, 0.01]],
  ['golden', [1.1, 1.02, 0.9, 0.02]],
  ['energy', [1.06, 1.015, 0.97, 0.01]],
  ['night', [0.94, 1.01, 1.1, 0.12]],
  ['mono', [1, 1, 1, 0]],
];

const canvasKitModulePath = require.resolve('canvaskit-wasm');
const canvasKitWasmPath = join(
  dirname(canvasKitModulePath),
  'canvaskit.wasm',
);

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

describe('colorGains', () => {
  test.each(COLOR_GAIN_CASES)(
    '%s maps to its exact gain target at full strength',
    (look, gains) => {
      expect(colorGains(look, 100)).toEqual(gains);
    },
  );

  test.each(COLOR_GAIN_CASES)(
    '%s is neutral at zero strength',
    (look) => {
      expect(colorGains(look, 0)).toEqual([1, 1, 1, 0]);
    },
  );

  test('interpolates warm and cool looks at half strength', () => {
    expect(colorGains('golden', 50)).toEqual([1.05, 1.01, 0.95, 0.01]);
    expect(colorGains('night', 50)).toEqual([0.97, 1.005, 1.05, 0.06]);
  });

  test('makes Golden and Energy warm, and Clean and Night cool', () => {
    const golden = colorGains('golden', 100);
    const energy = colorGains('energy', 100);
    const clean = colorGains('clean', 100);
    const night = colorGains('night', 100);

    expect(golden[0]).toBeGreaterThan(golden[2]);
    expect(energy[0]).toBeGreaterThan(energy[2]);
    expect(clean[2]).toBeGreaterThan(clean[0]);
    expect(night[2]).toBeGreaterThan(night[0]);
    expect(night[3]).toBeGreaterThan(0);
    expect(night[3]).toBeLessThanOrEqual(0.12);
  });

  test('safely handles invalid runtime values', () => {
    expect(colorGains('unknown' as ColorLook, 100)).toEqual([1, 1, 1, 0]);
    expect(colorGains('night', Number.NaN)).toEqual([1, 1, 1, 0]);
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
      redGain: 0.9965,
      greenGain: 1.0035,
      blueGain: 1.00875,
      highlightCompression: 0.0035,
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
      redGain: 1,
      greenGain: 1,
      blueGain: 1,
      highlightCompression: 0,
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
    expect(uniforms.redGain).toBeGreaterThanOrEqual(0.94);
    expect(uniforms.redGain).toBeLessThanOrEqual(1.1);
    expect(uniforms.greenGain).toBeGreaterThanOrEqual(1);
    expect(uniforms.greenGain).toBeLessThanOrEqual(1.02);
    expect(uniforms.blueGain).toBeGreaterThanOrEqual(0.9);
    expect(uniforms.blueGain).toBeLessThanOrEqual(1.1);
    expect(uniforms.highlightCompression).toBeGreaterThanOrEqual(0);
    expect(uniforms.highlightCompression).toBeLessThanOrEqual(0.12);
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

describe('reference beauty pixel semantics', () => {
  const neutralUniforms = buildBeautyShaderUniforms({
    ...DEFAULT_BEAUTY,
    enabled: false,
    colorLook: 'natural',
    colorStrength: 0,
  });

  test('unpremultiplies semi-transparent samples and zeros transparent RGB', () => {
    expect(unpremultiplyPixel([0.2, 0.1, 0.05, 0.5])).toEqual([
      0.4, 0.2, 0.1,
    ]);
    expect(unpremultiplyPixel([1, 0.5, 0.25, 0])).toEqual([0, 0, 0]);

    expect(
      referenceBeautyPixel({
        original: [0.2, 0.1, 0.05, 0.5],
        skinMask: 1,
        underEyeMask: 0,
        uniforms: neutralUniforms,
        neighborhood: [],
      }).pixel,
    ).toEqual([0.2, 0.1, 0.05, 0.5]);
    expect(
      referenceBeautyPixel({
        original: [1, 0.5, 0.25, 0],
        skinMask: 1,
        underEyeMask: 1,
        uniforms: { ...neutralUniforms, underEyeAmount: 0.15 },
        neighborhood: [],
      }).pixel,
    ).toEqual([0, 0, 0, 0]);
  });

  test('rejects excluded and transparent taps and renormalizes accepted skin', () => {
    const result = referenceBeautyPixel({
      original: [0.2, 0.2, 0.2, 1],
      skinMask: 1,
      underEyeMask: 0,
      uniforms: {
        ...neutralUniforms,
        smoothAmount: 0.36,
        blemishAmount: 0.24,
      },
      neighborhood: [
        { pixel: [0.4, 0.4, 0.4, 1], skinMask: 1, weight: 1 },
        { pixel: [1, 0, 0, 1], skinMask: 0, weight: 100 },
        { pixel: [0, 1, 0, 0], skinMask: 1, weight: 100 },
      ],
    });

    expect(result.sampledNeighbors).toBe(3);
    expect(result.acceptedNeighbors).toBe(1);
    expect(result.pixel[0]).toBeCloseTo(result.pixel[1], 6);
    expect(result.pixel[1]).toBeCloseTo(result.pixel[2], 6);
    expect(result.pixel[0]).toBeGreaterThan(0.2);
    expect(result.pixel[0]).toBeLessThan(0.4);
  });

  test('brightens dark pixels only inside the dedicated under-eye mask', () => {
    const uniforms = { ...neutralUniforms, underEyeAmount: 0.15 };
    const outside = referenceBeautyPixel({
      original: [0.1, 0.1, 0.1, 1],
      skinMask: 1,
      underEyeMask: 0,
      uniforms,
      neighborhood: [],
    });
    const inside = referenceBeautyPixel({
      original: [0.1, 0.1, 0.1, 1],
      skinMask: 1,
      underEyeMask: 1,
      uniforms,
      neighborhood: [],
    });

    expect(outside.pixel).toEqual([0.1, 0.1, 0.1, 1]);
    expect(inside.pixel[0]).toBeGreaterThan(outside.pixel[0]);
    expect(inside.pixel[1]).toBeGreaterThan(outside.pixel[1]);
    expect(inside.pixel[2]).toBeGreaterThan(outside.pixel[2]);
  });

  test('skips all neighborhood samples outside skin or at zero soften', () => {
    const tap = [{ pixel: [1, 0, 0, 1] as const, skinMask: 1, weight: 1 }];
    const outside = referenceBeautyPixel({
      original: [0.2, 0.2, 0.2, 1],
      skinMask: 0,
      underEyeMask: 0,
      uniforms: { ...neutralUniforms, smoothAmount: 0.36 },
      neighborhood: tap,
    });
    const zeroSoften = referenceBeautyPixel({
      original: [0.2, 0.2, 0.2, 1],
      skinMask: 1,
      underEyeMask: 0,
      uniforms: neutralUniforms,
      neighborhood: tap,
    });

    expect(outside.sampledNeighbors).toBe(0);
    expect(zeroSoften.sampledNeighbors).toBe(0);
    expect(outside.pixel).toEqual([0.2, 0.2, 0.2, 1]);
    expect(zeroSoften.pixel).toEqual([0.2, 0.2, 0.2, 1]);
  });

  test('applies bounded Night highlight compression in straight RGB', () => {
    const night = buildBeautyShaderUniforms({
      ...DEFAULT_BEAUTY,
      enabled: false,
      colorLook: 'night',
      colorStrength: 100,
    });
    const compressed = referenceBeautyPixel({
      original: [0.8, 0.8, 0.8, 1],
      skinMask: 0,
      underEyeMask: 0,
      uniforms: night,
      neighborhood: [],
    });
    const withoutCompression = referenceBeautyPixel({
      original: [0.8, 0.8, 0.8, 1],
      skinMask: 0,
      underEyeMask: 0,
      uniforms: { ...night, highlightCompression: 0 },
      neighborhood: [],
    });

    expect(compressed.pixel[0]).toBeLessThan(withoutCompression.pixel[0]);
    expect(compressed.pixel[1]).toBeLessThan(withoutCompression.pixel[1]);
    expect(compressed.pixel[2]).toBeLessThan(withoutCompression.pixel[2]);
    expect(compressed.pixel[3]).toBe(1);
  });
});

describe('BEAUTY_RUNTIME_EFFECT', () => {
  test('publishes the typed child-shader binding contract', () => {
    expect(BEAUTY_SHADER_CHILDREN).toEqual([
      'image',
      'skinMask',
      'underEyeMask',
    ]);
  });

  test(
    'compiles in the installed headless CanvasKit runtime',
    async () => {
      const originalTextDecoder = globalThis.TextDecoder;
      Object.defineProperty(globalThis, 'TextDecoder', {
        configurable: true,
        value: NodeTextDecoder,
        writable: true,
      });

      try {
        const canvasKit = await CanvasKitInit({
          locateFile: (file) => {
            expect(file).toBe('canvaskit.wasm');
            return canvasKitWasmPath;
          },
        });

        const expectedCompilerLog = jest
          .spyOn(console, 'log')
          .mockImplementation(() => undefined);
        try {
          expect(
            canvasKit.RuntimeEffect.Make(
              'half4 main(float2 xy) { this is deliberately invalid; }',
            ),
          ).toBeNull();
          expect(expectedCompilerLog).toHaveBeenCalled();
        } finally {
          expectedCompilerLog.mockRestore();
        }

        const effect = canvasKit.RuntimeEffect.Make(BEAUTY_RUNTIME_EFFECT);
        expect(effect).not.toBeNull();
        effect?.delete();
      } finally {
        Object.defineProperty(globalThis, 'TextDecoder', {
          configurable: true,
          value: originalTextDecoder,
          writable: true,
        });
      }
    },
    15_000,
  );

  test.each([
    'uniform shader image;',
    'uniform shader skinMask;',
    'uniform shader underEyeMask;',
    'uniform float smoothAmount;',
    'uniform float blemishAmount;',
    'uniform float shineAmount;',
    'uniform float underEyeAmount;',
    'uniform float lightingAmount;',
    'uniform float saturation;',
    'uniform float contrast;',
    'uniform float brightness;',
    'uniform float redGain;',
    'uniform float greenGain;',
    'uniform float blueGain;',
    'uniform float highlightCompression;',
  ])('declares %s', (declaration) => {
    expect(BEAUTY_RUNTIME_EFFECT).toContain(declaration);
  });

  test('uses a fixed neighborhood and no loops or coordinate deformation', () => {
    expect(BEAUTY_RUNTIME_EFFECT).toContain('sampleSkinNeighborhood');
    expect(BEAUTY_RUNTIME_EFFECT).toContain('weightedSkinTap');
    expect(BEAUTY_RUNTIME_EFFECT).toContain('skinMask.eval(tapXy)');
    expect(BEAUTY_RUNTIME_EFFECT).not.toContain(
      'sampleSkinNeighborhood(shader',
    );
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
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'half underEye = clamp(underEyeMask.eval(xy).a',
    );
    expect(BEAUTY_RUNTIME_EFFECT).toMatch(
      /underEyeAmount\s*\*\s*shadowGate\s*\*\s*underEye/,
    );
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'half4(colored * original.a, original.a)',
    );
  });

  test('uses a neighborhood fast path and straight-alpha processing', () => {
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'if (mask > 0.001 && soften > 0.001)',
    );
    expect(
      BEAUTY_RUNTIME_EFFECT.match(/image\.eval\(xy\)/g),
    ).toHaveLength(1);
    expect(
      BEAUTY_RUNTIME_EFFECT.match(/skinMask\.eval\(xy\)/g),
    ).toHaveLength(1);
    expect(
      BEAUTY_RUNTIME_EFFECT.lastIndexOf(
        'sampleSkinNeighborhood(xy, original, mask)',
      ),
    ).toBeGreaterThan(
      BEAUTY_RUNTIME_EFFECT.indexOf(
        'if (mask > 0.001 && soften > 0.001)',
      ),
    );
    expect(BEAUTY_RUNTIME_EFFECT).toContain('straightRgb(original)');
    expect(BEAUTY_RUNTIME_EFFECT).toContain('straightRgb(tap)');
  });

  test('implements mono-compatible luma saturation and clamps RGB output', () => {
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'mix(half3(luma), color, saturationValue)',
    );
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'rgb *= half3(redGain, greenGain, blueGain)',
    );
    expect(BEAUTY_RUNTIME_EFFECT).toContain(
      'clamp(rgb, half3(0.0), half3(1.0))',
    );
  });
});
