import type { TimelineType } from '../timeline/types';

type AddRouteParams = {
  date?: unknown;
  time?: unknown;
  type?: unknown;
};

export type AddRouteSeed = {
  key: string;
  date: string;
  time: string;
  type: TimelineType;
  detailsOpen: boolean;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function timelineType(value: unknown): TimelineType | null {
  return value === 'event' || value === 'task' || value === 'grocery' || value === 'other'
    ? value
    : null;
}

export function resolveAddRouteSeed(
  params: AddRouteParams,
  defaults: { date: string; time: string },
): AddRouteSeed {
  const date = nonEmptyString(params.date);
  const time = nonEmptyString(params.time);
  const type = timelineType(params.type);

  return {
    key: JSON.stringify([date, time, type]),
    date: date ?? defaults.date,
    time: time ?? defaults.time,
    type: type ?? 'event',
    detailsOpen: Boolean(date || type),
  };
}

export function resolveTodayRouteSeed(value: unknown, fallback: Date) {
  const date = nonEmptyString(value);
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;

  return {
    key: validDate ?? 'today',
    day: validDate ? new Date(`${validDate}T12:00:00`) : fallback,
  };
}
