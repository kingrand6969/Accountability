export type RunShareLayout =
  | 'center-stack'
  | 'right-rail'
  | 'data-horizon'
  | 'editorial-stack'
  | 'map-focus';

export type RunShareFont = 'momentum' | 'classic' | 'strong' | 'street';
export type RunCardTheme = 'dark' | 'day' | 'night';

export type RunShareAppearance = Readonly<{
  layout: RunShareLayout;
  font: RunShareFont;
  showTimestamp: boolean;
  showEndpoints: boolean;
  theme: RunCardTheme;
  completedAt: string;
}>;

export const RUN_SHARE_LAYOUTS = [
  { id: 'center-stack', label: 'Center Stack' },
  { id: 'right-rail', label: 'Right Rail' },
  { id: 'data-horizon', label: 'Data Horizon' },
  { id: 'editorial-stack', label: 'Editorial Stack' },
  { id: 'map-focus', label: 'Map Focus' },
] as const satisfies readonly { id: RunShareLayout; label: string }[];

export const RUN_SHARE_FONTS = [
  { id: 'momentum', label: 'Momentum' },
  { id: 'classic', label: 'Classic' },
  { id: 'strong', label: 'Strong' },
  { id: 'street', label: 'Street' },
] as const satisfies readonly { id: RunShareFont; label: string }[];

export function runCardThemeForLocalHour(_hour: number): RunCardTheme {
  return 'dark';
}

export function createDefaultRunShareAppearance(
  completedAt: string,
  localHour = new Date(completedAt).getHours(),
): RunShareAppearance {
  return Object.freeze({
    layout: 'map-focus',
    font: 'momentum',
    showTimestamp: true,
    showEndpoints: false,
    theme: runCardThemeForLocalHour(localHour),
    completedAt,
  });
}

export function formatRunCardTimestamp(
  completedAt: string,
  locale?: string,
  timeZone?: string,
): string {
  const date = new Date(completedAt);
  if (!Number.isFinite(date.getTime())) return '';
  const dateParts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const day = dateParts.find((part) => part.type === 'day')?.value ?? '';
  const month = dateParts.find((part) => part.type === 'month')?.value ?? '';
  const dayMonth = `${day} ${month}`.trim().toLocaleUpperCase(locale);
  const clock = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date).toLocaleUpperCase(locale);
  return `${dayMonth} · ${clock}`;
}

export function runShareLayoutLabel(layout: RunShareLayout): string {
  return RUN_SHARE_LAYOUTS.find((option) => option.id === layout)?.label ?? 'Map Focus';
}

export function completedRunTimestamp(startedAt: string, durationSeconds: number): string {
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return new Date().toISOString();
  }
  return new Date(startedMs + Math.round(durationSeconds) * 1_000).toISOString();
}

export function runCardTitle(
  activity: 'run' | 'walk' | 'ride',
  completedAt: string,
  locale?: string,
  timeZone?: string,
): string {
  const date = new Date(completedAt);
  const weekday = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        ...(timeZone ? { timeZone } : {}),
      }).format(date)
    : 'Completed';
  const activityLabel = activity.charAt(0).toLocaleUpperCase(locale) + activity.slice(1);
  return `${weekday} ${activityLabel}`;
}

export function routeEndpointVisibilityIntent(showEndpoints: boolean): Readonly<{
  next: boolean;
  requiresConfirmation: boolean;
}> {
  return Object.freeze({
    next: !showEndpoints,
    requiresConfirmation: !showEndpoints,
  });
}
