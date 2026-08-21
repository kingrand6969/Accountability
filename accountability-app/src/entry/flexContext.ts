export const FLEX_KINDS = [
  'manual',
  'streak',
  'workout',
  'challenge',
  'medal',
  'rank',
  'leaderboard',
  'run',
] as const;

export type FlexKind = (typeof FLEX_KINDS)[number];
export type FlexAudience = 'buddies' | 'public';

export type FlexContext = Readonly<{
  kind: FlexKind;
  sourceId: string;
  title: string;
  body: string;
  showPublicly: boolean;
}>;

export type FlexContextParams = Readonly<{
  achievementKind?: string | string[];
  achievementSourceId?: string | string[];
  achievementTitle?: string | string[];
  achievementText?: string | string[];
  audience?: string | string[];
  showOnCard?: string | string[];
  showPublicly?: string | string[];
}>;

export const FLEX_SOURCE_ID_MAX_LENGTH = 128;
export const FLEX_TITLE_MAX_LENGTH = 120;
export const FLEX_BODY_MAX_LENGTH = 500;

const FLEX_KIND_SET: ReadonlySet<string> = new Set(FLEX_KINDS);
const SAFE_INTERNAL_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/u;
const UNSAFE_DISPLAY_CHARACTER = /[\u0000-\u001f\u007f-\u009f]|\p{Cf}/u;

export function isFlexKind(value: string): value is FlexKind {
  return FLEX_KIND_SET.has(value);
}

export function isFlexAudience(value: string): value is FlexAudience {
  return value === 'buddies' || value === 'public';
}

export function isValidFlexSourceId(value: string): boolean {
  return value.length <= FLEX_SOURCE_ID_MAX_LENGTH && SAFE_INTERNAL_ID.test(value);
}

export function normalizeFlexDisplayText(value: string, maxLength: number): string | null {
  if (!value || value.length > maxLength || UNSAFE_DISPLAY_CHARACTER.test(value)) return null;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function parseFlexContext(params: FlexContextParams): FlexContext | null {
  const kind = scalar(params.achievementKind);
  const sourceId = scalar(params.achievementSourceId);
  const rawTitle = scalar(params.achievementTitle);
  if (
    !kind ||
    !isFlexKind(kind) ||
    !sourceId ||
    !isValidFlexSourceId(sourceId) ||
    !rawTitle
  ) {
    return null;
  }

  const title = normalizeFlexDisplayText(rawTitle, FLEX_TITLE_MAX_LENGTH);
  if (!title) return null;

  const rawBody = optionalScalar(params.achievementText);
  if (rawBody === INVALID_SCALAR) return null;
  const body = rawBody === undefined
    ? `${title} completed on AccountAbility. I showed up today.`
    : normalizeFlexDisplayText(rawBody, FLEX_BODY_MAX_LENGTH);
  if (!body) return null;

  const rawShowPublicly = optionalScalar(params.showPublicly);
  if (rawShowPublicly === INVALID_SCALAR || (rawShowPublicly !== undefined && rawShowPublicly !== '1')) return null;
  const rawAudience = optionalScalar(params.audience);
  const rawShowOnCard = optionalScalar(params.showOnCard);
  if (
    rawAudience === INVALID_SCALAR ||
    rawShowOnCard === INVALID_SCALAR ||
    (rawAudience !== undefined && !isFlexAudience(rawAudience)) ||
    (rawShowOnCard !== undefined && rawShowOnCard !== '1') ||
    (rawShowPublicly !== undefined && (rawAudience !== undefined || rawShowOnCard !== undefined))
  ) {
    return null;
  }

  return {
    kind,
    sourceId,
    title,
    body,
    showPublicly: rawShowPublicly === '1' ||
      (rawShowPublicly === undefined && rawAudience === 'public' && rawShowOnCard === '1'),
  };
}

const INVALID_SCALAR = Symbol('invalid-flex-scalar');

function scalar(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function optionalScalar(
  value: string | string[] | undefined,
): string | undefined | typeof INVALID_SCALAR {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : INVALID_SCALAR;
}
