type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

type BrandNode = {
  cx: number;
  cy: number;
  r: number;
};

type BrandGeometry = {
  viewBox: string;
  wordmark: string;
  colors: {
    lime: string;
    supportingLime: string;
    charcoal: string;
    cream: string;
  };
  mark: {
    paths: [string, string];
    strokeWidth: number;
    nodes: [BrandNode, BrandNode];
  };
};

export type BrandGeometryContract = DeepReadonly<BrandGeometry>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBrandNode(value: unknown): value is BrandNode {
  return (
    isRecord(value) &&
    isFiniteNumber(value.cx) &&
    value.cx >= 0 &&
    isFiniteNumber(value.cy) &&
    value.cy >= 0 &&
    isFiniteNumber(value.r) &&
    value.r > 0
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
    !isHexColor(value.colors.lime) ||
    !isHexColor(value.colors.supportingLime) ||
    !isHexColor(value.colors.charcoal) ||
    !isHexColor(value.colors.cream) ||
    !isRecord(value.mark) ||
    !Array.isArray(value.mark.paths) ||
    value.mark.paths.length !== 2 ||
    !value.mark.paths.every((path) => typeof path === 'string' && path.length > 0) ||
    !isFiniteNumber(value.mark.strokeWidth) ||
    value.mark.strokeWidth <= 0 ||
    !Array.isArray(value.mark.nodes) ||
    value.mark.nodes.length !== 2 ||
    !isBrandNode(value.mark.nodes[0]) ||
    !isBrandNode(value.mark.nodes[1])
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
  "viewBox": "0 0 120 80",
  "wordmark": "Mantle",
  "colors": {
    "lime": "#B9FF3D",
    "supportingLime": "#7FAF1C",
    "charcoal": "#111411",
    "cream": "#F4F5F1"
  },
  "mark": {
    "paths": [
      "M25 51C37 43 44 26 56 27C63 27 65 33 70 32",
      "M51 54C62 65 74 66 84 53C92 42 97 34 101 32"
    ],
    "strokeWidth": 20,
    "nodes": [
      { "cx": 11.5, "cy": 68, "r": 11.5 },
      { "cx": 108.5, "cy": 12, "r": 11.5 }
    ]
  }
}`));

/**
 * General/native framing keeps rasterized small marks clear of every canvas edge.
 */
export const BRAND_GENERAL_MARK_RENDER_VIEW_BOX = '-24 -44 168 168';

/**
 * Android adaptive foregrounds must fit the centered 66/108 circular safe zone.
 */
export const BRAND_ADAPTIVE_ICON_RENDER_VIEW_BOX = '-65 -85 250 250';

export const BRAND_WORDMARK = BRAND_GEOMETRY.wordmark;
