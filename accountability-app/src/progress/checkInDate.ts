const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(value: string): Date {
  const match = DATE_KEY.exec(value);
  if (!match) throw new Error('Enter a valid check-in date.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error('Enter a valid check-in date.');
  }
  return parsed;
}

export function recordedAtForLocalDate(value: string, now = new Date()): string {
  const selected = parseLocalDateKey(value);
  const selectedKey = localDateKey(selected);
  const todayKey = localDateKey(now);
  if (selectedKey > todayKey) throw new Error('Check-in date cannot be in the future.');
  if (selectedKey === todayKey) return now.toISOString();

  // Noon preserves the selected local wall date when stored as an explicit instant.
  selected.setHours(12, 0, 0, 0);
  return selected.toISOString();
}

export function checkInTimeZoneLabel(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${zone || 'Local'} timezone`;
}

export function displayLocalDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(parseLocalDateKey(value));
  } catch {
    return value;
  }
}
