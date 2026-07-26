export const COLOR_LOOKS = Object.freeze([
  'natural',
  'clean',
  'golden',
  'energy',
  'night',
  'mono',
] as const);

export type ColorLook = (typeof COLOR_LOOKS)[number];

export type BeautySettings = {
  enabled: boolean;
  overall: number;
  smooth: number;
  blemish: number;
  shine: number;
  underEye: number;
  lighting: number;
  colorLook: ColorLook;
  colorStrength: number;
};

export type ColorLookPreset = Readonly<{
  value: ColorLook;
  label: string;
}>;

const COLOR_LOOK_LABELS = Object.freeze({
  natural: 'Natural',
  clean: 'Clean',
  golden: 'Golden Hour',
  energy: 'Energy',
  night: 'Night Run',
  mono: 'Focus B&W',
} satisfies Record<ColorLook, string>);

export const COLOR_LOOK_PRESETS: readonly ColorLookPreset[] = Object.freeze(
  COLOR_LOOKS.map((value) =>
    Object.freeze({ value, label: COLOR_LOOK_LABELS[value] }),
  ),
);

export const DEFAULT_BEAUTY: Readonly<BeautySettings> = Object.freeze({
  enabled: true,
  overall: 20,
  smooth: 20,
  blemish: 20,
  shine: 15,
  underEye: 10,
  lighting: 10,
  colorLook: 'clean',
  colorStrength: 35,
});

export function normalizeBeautySettings(value: unknown): BeautySettings {
  return {
    enabled: booleanOrDefault(
      ownValue(value, 'enabled'),
      DEFAULT_BEAUTY.enabled,
    ),
    overall: boundedInteger(
      ownValue(value, 'overall'),
      0,
      100,
      DEFAULT_BEAUTY.overall,
    ),
    smooth: boundedInteger(
      ownValue(value, 'smooth'),
      0,
      60,
      DEFAULT_BEAUTY.smooth,
    ),
    blemish: boundedInteger(
      ownValue(value, 'blemish'),
      0,
      60,
      DEFAULT_BEAUTY.blemish,
    ),
    shine: boundedInteger(
      ownValue(value, 'shine'),
      0,
      50,
      DEFAULT_BEAUTY.shine,
    ),
    underEye: boundedInteger(
      ownValue(value, 'underEye'),
      0,
      40,
      DEFAULT_BEAUTY.underEye,
    ),
    lighting: boundedInteger(
      ownValue(value, 'lighting'),
      0,
      40,
      DEFAULT_BEAUTY.lighting,
    ),
    colorLook: colorLookOrDefault(
      ownValue(value, 'colorLook'),
      DEFAULT_BEAUTY.colorLook,
    ),
    colorStrength: boundedInteger(
      ownValue(value, 'colorStrength'),
      0,
      100,
      DEFAULT_BEAUTY.colorStrength,
    ),
  };
}

function ownValue(value: unknown, key: keyof BeautySettings): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !Object.prototype.hasOwnProperty.call(value, key)
  ) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function colorLookOrDefault(
  value: unknown,
  fallback: ColorLook,
): ColorLook {
  return typeof value === 'string' &&
    (COLOR_LOOKS as readonly string[]).includes(value)
    ? (value as ColorLook)
    : fallback;
}
