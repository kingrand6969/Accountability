import { postVisibility, type ShareVisibility } from '../progress/visibility';

export const SHARE_CAPTION_LIMIT = 300;

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

export function createShareStudioResult(input: {
  ownerId: string;
  context: ShareStudioContext;
  caption: string;
  showPublicly: boolean;
  media: ShareStudioMedia;
}): ShareStudioResult {
  const ownerId = requiredText(input.ownerId, 'Owner');
  const title = requiredText(input.context.title, 'Share title');
  const date = requiredText(input.context.date, 'Share date');
  const caption = input.caption.trim();
  if (caption.length > SHARE_CAPTION_LIMIT) throw new Error(`Caption must be ${SHARE_CAPTION_LIMIT} characters or fewer.`);
  const metrics = input.context.metrics.map((metric) => Object.freeze({
    label: requiredText(metric.label, 'Metric label'),
    value: requiredText(metric.value, 'Metric value'),
  }));
  const context = Object.freeze({ title, date, metrics: Object.freeze(metrics) });
  const visibility = Object.freeze(postVisibility(input.showPublicly));
  const media = Object.freeze({ ...input.media }) as ShareStudioMedia;
  return Object.freeze({ ownerId, context, caption, showPublicly: input.showPublicly, visibility, media });
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}
