import { describe, expect, it } from '@jest/globals';
import {
  COLOR_LOOK_PRESETS,
  COLOR_LOOKS,
  DEFAULT_BEAUTY,
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
    const bounds: Array<[NumericBeautyField, number, number]> = [
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
    const defaults: Array<[NumericBeautyField, number]> = [
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
