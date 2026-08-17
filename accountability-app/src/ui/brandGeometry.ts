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
    cyan: string;
    cream: string;
  };
  mark: {
    primaryPath: string;
    accentPath: string;
  };
};

export type BrandGeometryContract = DeepReadonly<BrandGeometry>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/.test(value);
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
    !isHexColor(value.colors.cyan) ||
    !isHexColor(value.colors.cream) ||
    !isRecord(value.mark) ||
    typeof value.mark.primaryPath !== 'string' ||
    value.mark.primaryPath.length === 0 ||
    typeof value.mark.accentPath !== 'string' ||
    value.mark.accentPath.length === 0
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
  "viewBox": "0 0 96 96",
  "wordmark": "Accountability",
  "colors": {
    "cobalt": "#155EEF",
    "navy": "#081A3A",
    "cyan": "#20C7D9",
    "cream": "#F7F4EC"
  },
  "mark": {
    "primaryPath": "M6 86 36 13Q39 5 47 5t11 8l32 73H68L61 68H31L24 86H6Zm32-35h16L46 30l-8 21Z",
    "accentPath": "M31 62 58 40 62 49 36 66Z"
  }
}`));

export const BRAND_WORDMARK = BRAND_GEOMETRY.wordmark;
