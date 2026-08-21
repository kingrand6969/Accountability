import { postVisibility, type ShareVisibility } from '../progress/visibility';

export const SHARE_CAPTION_LIMIT = 300;
export const SHARE_CARD_METRIC_LIMIT = 3;

export type ShareStudioContext = Readonly<{
  title: string;
  date: string;
  metrics: readonly Readonly<{ label: string; value: string }>[];
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
    /** The callback owns this idempotent cleanup after Continue is pressed. */
    release: () => Promise<void>;
  }
>;

export type ShareStudioResult = Readonly<{
  ownerId: string;
  context: ShareStudioContext;
  caption: string;
  showPublicly: boolean;
  visibility: ShareVisibility;
  media: ShareStudioMedia;
}>;

const canonicalContexts = new WeakSet<object>();

/**
 * The share card and its callback intentionally expose at most three metrics.
 * Anything after the third item is outside the share boundary and is discarded.
 */
export function canonicalShareStudioContext(input: ShareStudioContext): ShareStudioContext {
  if (canonicalContexts.has(input)) return input;
  if (!Array.isArray(input.metrics)) throw new Error('Share metrics must be a list.');
  const metrics = input.metrics.slice(0, SHARE_CARD_METRIC_LIMIT).map((metric) => Object.freeze({
    label: requiredText(metric.label, 'Metric label'),
    value: requiredText(metric.value, 'Metric value'),
  }));
  const context = Object.freeze({
    title: requiredText(input.title, 'Share title'),
    date: requiredText(input.date, 'Share date'),
    metrics: Object.freeze(metrics),
  });
  canonicalContexts.add(context);
  return context;
}

export function createShareStudioResult(input: {
  ownerId: string;
  context: ShareStudioContext;
  caption: string;
  showPublicly: boolean;
  media: ShareStudioMedia;
}): ShareStudioResult {
  const ownerId = requiredText(input.ownerId, 'Owner');
  const caption = input.caption.trim();
  if (caption.length > SHARE_CAPTION_LIMIT) throw new Error(`Caption must be ${SHARE_CAPTION_LIMIT} characters or fewer.`);
  const context = canonicalShareStudioContext(input.context);
  const visibility = Object.freeze(postVisibility(input.showPublicly));
  const media = Object.freeze({ ...input.media }) as ShareStudioMedia;
  return Object.freeze({ ownerId, context, caption, showPublicly: input.showPublicly, visibility, media });
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}
