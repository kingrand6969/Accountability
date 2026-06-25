export function validateDateString(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Date is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Use the format YYYY-MM-DD.';
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const valid =
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d;
  return valid ? null : 'That date is not valid.';
}

export function validateTimeString(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Time is required.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
    return 'Use 24-hour time, e.g. 14:30.';
  }
  return null;
}

/**
 * Combines a 'YYYY-MM-DD' date and 'HH:MM' time, interpreted in the device's
 * local timezone, into an ISO (UTC) timestamp for storage.
 */
export function toIsoFromLocal(date: string, time: string): string {
  const [y, m, d] = date.trim().split('-').map(Number);
  const [hh, mm] = time.trim().split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** 'YYYY-MM-DD' for the given date in local time. */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}
