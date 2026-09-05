import { postVisibility, type ShareVisibility } from '../progress/visibility';

export const SHARE_CAPTION_LIMIT = 300;
export const SHARE_CARD_METRIC_LIMIT = 3;

export type ShareStudioContext = Readonly<{
  title: string;
  date: string;
  metrics: readonly ShareStudioMetric[];
}>;

export type ShareStudioMetric = Readonly<{
  label: string;
  value: string;
  sensitivity: 'standard' | 'body';
}>;

export type ShareStudioMedia = Readonly<
  | { kind: 'card' }
  | {
    kind: 'photo';
    source: 'selfie' | 'gallery';
    uri: string;
    width: number;
    height: number;
    capturedAt: string;
    /** The callback owns this idempotent cleanup only after it resolves successfully. */
    release: () => Promise<void>;
  }
>;

export type ShareStudioResult = Readonly<{
  ownerId: string;
  operationId: string;
  context: ShareStudioContext;
  caption: string;
  showPublicly: boolean;
  includeBodyStats: boolean;
  visibility: ShareVisibility;
  media: ShareStudioMedia;
}>;

const canonicalContexts = new WeakMap<object, boolean>();

/**
 * The share card and callback expose the same three metrics. Body stats are
 * ineligible by default and receive visible slots first only after opt-in.
 */
export function canonicalShareStudioContext(input: ShareStudioContext, includeBodyStats = false): ShareStudioContext {
  if (canonicalContexts.get(input) === includeBodyStats) return input;
  if (!Array.isArray(input.metrics)) throw new Error('Share metrics must be a list.');
  const validatedMetrics = input.metrics.map(validateMetric);
  const standardMetrics = validatedMetrics.filter((metric) => !isBodyStatMetric(metric));
  const bodyMetrics = validatedMetrics.filter(isBodyStatMetric);
  const metrics = (includeBodyStats ? [...bodyMetrics, ...standardMetrics] : standardMetrics)
    .slice(0, SHARE_CARD_METRIC_LIMIT)
    .map((metric) => Object.freeze(metric));
  const context = Object.freeze({
    title: requiredText(input.title, 'Share title'),
    date: requiredText(input.date, 'Share date'),
    metrics: Object.freeze(metrics),
  });
  canonicalContexts.set(context, includeBodyStats);
  return context;
}

export function hasBodyStats(input: ShareStudioContext): boolean {
  if (!Array.isArray(input.metrics)) return false;
  return input.metrics.some((metric) => isBodyStatMetric(validateMetric(metric)));
}

export function createShareStudioResult(input: {
  ownerId: string;
  operationId: string;
  context: ShareStudioContext;
  caption: string;
  showPublicly: boolean;
  includeBodyStats: boolean;
  media: ShareStudioMedia;
}): ShareStudioResult {
  const ownerId = requiredText(input.ownerId, 'Owner');
  const operationId = requiredUuidV4(input.operationId);
  const caption = input.caption.trim();
  if (caption.length > SHARE_CAPTION_LIMIT) throw new Error(`Caption must be ${SHARE_CAPTION_LIMIT} characters or fewer.`);
  const context = canonicalShareStudioContext(input.context, input.includeBodyStats);
  const visibility = Object.freeze(postVisibility(input.showPublicly));
  const media = Object.freeze({ ...input.media }) as ShareStudioMedia;
  return Object.freeze({ ownerId, operationId, context, caption, showPublicly: input.showPublicly, includeBodyStats: input.includeBodyStats, visibility, media });
}

function validateMetric(metric: ShareStudioMetric): ShareStudioMetric {
  if (metric.sensitivity !== 'standard' && metric.sensitivity !== 'body') {
    throw new Error('Metric sensitivity must be standard or body.');
  }
  return {
    label: requiredText(metric.label, 'Metric label'),
    value: requiredText(metric.value, 'Metric value'),
    sensitivity: metric.sensitivity,
  };
}

function isBodyStatMetric(metric: ShareStudioMetric): boolean {
  return metric.sensitivity === 'body' || /\b(?:weight|bmi|body fat|body measurements?|waist|hips?|chest|neck)\b/i.test(metric.label);
}

function requiredUuidV4(value: string): string {
  const normalized = requiredText(value, 'Operation ID');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(normalized)) {
    throw new Error('Operation ID must be a UUIDv4.');
  }
  return normalized;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}
