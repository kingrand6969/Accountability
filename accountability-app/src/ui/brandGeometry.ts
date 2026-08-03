type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

type BrandGeometry = {
  viewBox: string;
  wordmark: string;
  colors: {
    cobalt: string;
    navy: string;
    cream: string;
  };
  heads: {
    cx: number;
    cy: number;
    r: number;
  }[];
  ribbons: string[];
};

export type BrandGeometryContract = DeepReadonly<BrandGeometry>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/.test(value);
}

function isHead(value: unknown) {
  return (
    isRecord(value) &&
    ['cx', 'cy', 'r'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
    )
  );
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export function parseBrandGeometry(value: unknown): BrandGeometryContract {
  if (
    !isRecord(value) ||
    typeof value.viewBox !== 'string' ||
    typeof value.wordmark !== 'string' ||
    !isRecord(value.colors) ||
    !isHexColor(value.colors.cobalt) ||
    !isHexColor(value.colors.navy) ||
    !isHexColor(value.colors.cream) ||
    !Array.isArray(value.heads) ||
    value.heads.length !== 2 ||
    !value.heads.every(isHead) ||
    !Array.isArray(value.ribbons) ||
    value.ribbons.length !== 2 ||
    !value.ribbons.every(
      (ribbon) => typeof ribbon === 'string' && ribbon.length > 0,
    )
  ) {
    throw new Error('Invalid brand geometry');
  }
  return deepFreeze(value as BrandGeometry);
}

/**
 * This JSON payload is deliberately parseable by both TypeScript/Metro and the
 * Node asset generator. Keep it as JSON so neither runtime needs a transpiler.
 */
export const BRAND_GEOMETRY = parseBrandGeometry(JSON.parse(String.raw`{
  "viewBox": "0 0 96 88",
  "wordmark": "AccountAbility",
  "colors": {
    "cobalt": "#155EEF",
    "navy": "#081A3A",
    "cream": "#F7F4EC"
  },
  "heads": [
    { "cx": 27, "cy": 15, "r": 10 },
    { "cx": 69, "cy": 15, "r": 10 }
  ],
  "ribbons": [
    "M5 78 20 33c2-7 11-10 17-5l22 22-14 17-13-15-10 30H9c-3 0-5-2-4-4Z",
    "m91 78-15-45c-2-7-11-10-17-5L37 50l14 17 13-15 10 30h13c3 0 5-2 4-4Z"
  ]
}`));

export const BRAND_WORDMARK = BRAND_GEOMETRY.wordmark;
