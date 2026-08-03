import { describe, expect, it } from '@jest/globals';
import {
  COLOR_LOOK_PRESETS,
  COLOR_LOOKS,
  DEFAULT_BEAUTY,
  effectiveBeautySettings,
  normalizeBeautySettings,
  type BeautySettings,
  type ColorLook,
} from './types';

const EXPECTED_DEFAULTS: BeautySettings = {
  enabled: true,
  overall: 20,
  smooth: 20,
  blemish: 20,
  shine: 15,
  underEye: 10,
  lighting: 10,
  colorLook: 'clean',
  colorStrength: 35,
};

type NumericBeautyField = Exclude<
  keyof BeautySettings,
  'enabled' | 'colorLook'
>;

describe('beauty settings', () => {
  it('uses the approved subtle defaults', () => {
    expect(DEFAULT_BEAUTY).toEqual(EXPECTED_DEFAULTS);
    expect(Object.keys(DEFAULT_BEAUTY)).toEqual(Object.keys(EXPECTED_DEFAULTS));
  });

  it('derives and accepts every supported color look', () => {
    const expected: readonly ColorLook[] = [
      'natural',
      'clean',
      'golden',
      'energy',
      'night',
      'mono',
    ];

    expect(COLOR_LOOKS).toEqual(expected);
    for (const colorLook of expected) {
      expect(normalizeBeautySettings({ colorLook }).colorLook).toBe(colorLook);
    }
  });

  it('provides safe display metadata for every color look', () => {
    expect(COLOR_LOOK_PRESETS).toEqual([
      { value: 'natural', label: 'Natural' },
      { value: 'clean', label: 'Clean' },
      { value: 'golden', label: 'Golden Hour' },
      { value: 'energy', label: 'Energy' },
      { value: 'night', label: 'Night Run' },
      { value: 'mono', label: 'Focus B&W' },
    ]);
    expect(DEFAULT_BEAUTY.colorLook).toBe('clean');
  });

  it('preserves every boundary and clamps values outside them', () => {
    const bounds: [NumericBeautyField, number, number][] = [
      ['overall', 0, 100],
      ['smooth', 0, 60],
      ['blemish', 0, 60],
      ['shine', 0, 50],
      ['underEye', 0, 40],
      ['lighting', 0, 40],
      ['colorStrength', 0, 100],
    ];

    for (const [field, minimum, maximum] of bounds) {
      expect(normalizeBeautySettings({ [field]: minimum })[field]).toBe(minimum);
      expect(normalizeBeautySettings({ [field]: maximum })[field]).toBe(maximum);
      expect(normalizeBeautySettings({ [field]: minimum - 1 })[field]).toBe(
        minimum,
      );
      expect(normalizeBeautySettings({ [field]: maximum + 1 })[field]).toBe(
        maximum,
      );
    }
  });

  it('falls back to defaults for invalid and non-finite values', () => {
    const defaults: [NumericBeautyField, number][] = [
      ['overall', 20],
      ['smooth', 20],
      ['blemish', 20],
      ['shine', 15],
      ['underEye', 10],
      ['lighting', 10],
      ['colorStrength', 35],
    ];

    for (const [field, fallback] of defaults) {
      for (const value of [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        '42',
        null,
        undefined,
        {},
      ]) {
        expect(normalizeBeautySettings({ [field]: value })[field]).toBe(
          fallback,
        );
      }
    }
  });

  it('rounds fractional percentages to integers', () => {
    expect(
      normalizeBeautySettings({
        overall: 20.4,
        smooth: 20.5,
        blemish: 19.5,
        shine: 14.6,
        underEye: 9.5,
        lighting: 10.49,
        colorStrength: 35.7,
      }),
    ).toMatchObject({
      overall: 20,
      smooth: 21,
      blemish: 20,
      shine: 15,
      underEye: 10,
      lighting: 10,
      colorStrength: 36,
    });
  });

  it('falls back for invalid booleans and unknown looks', () => {
    expect(normalizeBeautySettings({ enabled: false }).enabled).toBe(false);
    expect(normalizeBeautySettings({ enabled: 'false' }).enabled).toBe(true);
    expect(normalizeBeautySettings({ colorLook: 'vintage' }).colorLook).toBe(
      'clean',
    );
  });

  it.each([undefined, null, true, 42, 'settings', [], () => undefined])(
    'safely normalizes non-record input %p',
    (value) => {
      expect(normalizeBeautySettings(value)).toEqual(EXPECTED_DEFAULTS);
    },
  );

  it('never executes an own accessor while normalizing', () => {
    let getterCalls = 0;
    const input = Object.defineProperty({}, 'smooth', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 40;
      },
    });

    expect(normalizeBeautySettings(input)).toEqual(EXPECTED_DEFAULTS);
    expect(getterCalls).toBe(0);
  });

  it('ignores a throwing getter without throwing', () => {
    const input = Object.defineProperty({}, 'overall', {
      get() {
        throw new Error('must not execute');
      },
    });

    expect(() => normalizeBeautySettings(input)).not.toThrow();
    expect(normalizeBeautySettings(input)).toEqual(EXPECTED_DEFAULTS);
  });

  it('falls back safely when a proxy descriptor trap throws', () => {
    const input = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('hostile descriptor trap');
        },
      },
    );

    expect(() => normalizeBeautySettings(input)).not.toThrow();
    expect(normalizeBeautySettings(input)).toEqual(EXPECTED_DEFAULTS);
  });

  it('returns only the exact approved fields for malicious input', () => {
    const inherited = Object.create({
      enabled: false,
      overall: 99,
      faceSlim: 100,
      eyeSize: 100,
      bodySlim: 100,
    }) as Record<string, unknown>;
    inherited.smooth = 25;
    inherited.geometry = { jaw: 100 };
    Object.defineProperty(inherited, '__proto__', {
      value: { polluted: true },
      enumerable: true,
    });

    const normalized = normalizeBeautySettings(inherited);

    expect(normalized.enabled).toBe(true);
    expect(normalized.overall).toBe(20);
    expect(normalized.smooth).toBe(25);
    expect(normalized).toEqual({
      ...EXPECTED_DEFAULTS,
      smooth: 25,
    });
    expect(normalized).not.toHaveProperty('faceSlim');
    expect(normalized).not.toHaveProperty('eyeSize');
    expect(normalized).not.toHaveProperty('bodySlim');
    expect(normalized).not.toHaveProperty('geometry');
    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
  });

  it('does not mutate or alias input and returns a fresh object each time', () => {
    const input = {
      ...EXPECTED_DEFAULTS,
      overall: 31.6,
      unknown: { nested: true },
    };
    const snapshot = { ...input };

    const first = normalizeBeautySettings(input);
    const second = normalizeBeautySettings(input);

    expect(input).toEqual(snapshot);
    expect(first).not.toBe(input);
    expect(second).not.toBe(first);
    first.overall = 0;
    expect(second.overall).toBe(32);
    expect(DEFAULT_BEAUTY.overall).toBe(20);
  });

  it('keeps exported defaults and preset metadata immutable', () => {
    expect(Object.isFrozen(DEFAULT_BEAUTY)).toBe(true);
    expect(Object.isFrozen(COLOR_LOOKS)).toBe(true);
    expect(Object.isFrozen(COLOR_LOOK_PRESETS)).toBe(true);
    expect(COLOR_LOOK_PRESETS.every(Object.isFrozen)).toBe(true);
  });
});

describe('effective beauty settings', () => {
  it('turns all five natural beauty controls off at Overall zero', () => {
    expect(
      effectiveBeautySettings({
        ...EXPECTED_DEFAULTS,
        overall: 0,
        colorLook: 'golden',
        colorStrength: 71,
      }),
    ).toEqual({
      ...EXPECTED_DEFAULTS,
      overall: 20,
      smooth: 0,
      blemish: 0,
      shine: 0,
      underEye: 0,
      lighting: 0,
      colorLook: 'golden',
      colorStrength: 71,
    });
  });

  it('uses approved Overall 20 as the neutral advanced-control baseline', () => {
    const settings: BeautySettings = {
      ...EXPECTED_DEFAULTS,
      smooth: 13,
      blemish: 17,
      shine: 19,
      underEye: 23,
      lighting: 29,
    };

    const effective = effectiveBeautySettings(settings);

    expect(effective).toEqual(settings);
    expect(effective).not.toBe(settings);
  });

  it('scales advanced edits once and rounds them to integer percentages', () => {
    expect(
      effectiveBeautySettings({
        ...EXPECTED_DEFAULTS,
        overall: 40,
        smooth: 10,
        blemish: 12,
        shine: 6,
        underEye: 7,
        lighting: 8,
      }),
    ).toMatchObject({
      overall: 20,
      smooth: 20,
      blemish: 24,
      shine: 12,
      underEye: 14,
      lighting: 16,
      colorLook: 'clean',
      colorStrength: 35,
    });
  });

  it('scales Overall 100 by five and clamps every beauty control safely', () => {
    expect(effectiveBeautySettings(EXPECTED_DEFAULTS)).toMatchObject({
      smooth: 20,
      blemish: 20,
      shine: 15,
      underEye: 10,
      lighting: 10,
    });
    expect(
      effectiveBeautySettings({ ...EXPECTED_DEFAULTS, overall: 100 }),
    ).toMatchObject({
      overall: 20,
      smooth: 60,
      blemish: 60,
      shine: 50,
      underEye: 40,
      lighting: 40,
    });
  });

  it('disables beauty without disabling independent color looks', () => {
    expect(
      effectiveBeautySettings({
        ...EXPECTED_DEFAULTS,
        enabled: false,
        overall: 100,
        colorLook: 'mono',
        colorStrength: 87,
      }),
    ).toEqual({
      ...EXPECTED_DEFAULTS,
      enabled: false,
      overall: 20,
      smooth: 0,
      blemish: 0,
      shine: 0,
      underEye: 0,
      lighting: 0,
      colorLook: 'mono',
      colorStrength: 87,
    });
  });

  it('returns a fresh exact schema without geometry and does not mutate', () => {
    const settings = {
      ...EXPECTED_DEFAULTS,
      overall: 40,
      faceSlim: 100,
      eyeSize: 100,
      geometry: { jaw: 100 },
    };
    const snapshot = { ...settings };

    const effective = effectiveBeautySettings(settings);

    expect(settings).toEqual(snapshot);
    expect(effective).not.toBe(settings);
    expect(Object.keys(effective)).toEqual(Object.keys(EXPECTED_DEFAULTS));
    expect(effective).not.toHaveProperty('faceSlim');
    expect(effective).not.toHaveProperty('eyeSize');
    expect(effective).not.toHaveProperty('geometry');
  });

  it('is idempotent after Overall has been resolved to neutral 20', () => {
    const settings: BeautySettings = {
      ...EXPECTED_DEFAULTS,
      overall: 40,
      smooth: 13,
      blemish: 17,
      shine: 11,
      underEye: 9,
      lighting: 7,
    };

    const once = effectiveBeautySettings(settings);
    const twice = effectiveBeautySettings(once);

    expect(once.overall).toBe(20);
    expect(twice).toEqual(once);
    expect(twice).not.toBe(once);
  });
});
