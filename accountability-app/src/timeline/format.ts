import type { TimelineType } from './types';

export const TIMELINE_TYPES: {
  value: TimelineType;
  label: string;
  emoji: string;
}[] = [
  { value: 'event', label: 'Event', emoji: '📅' },
  { value: 'task', label: 'Task', emoji: '✅' },
  { value: 'workout', label: 'Workout', emoji: '🏋️' },
  { value: 'meal', label: 'Meal', emoji: '🥗' },
  { value: 'expense', label: 'Expense', emoji: '💸' },
  { value: 'activity', label: 'Activity', emoji: '🏃' },
];

export function typeMeta(type: TimelineType) {
  return TIMELINE_TYPES.find((t) => t.value === type) ?? TIMELINE_TYPES[0];
}

/** 'HH:MM' (local) for an ISO timestamp. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** A 0-23 hour as a friendly label, e.g. 0 -> '12 AM', 13 -> '1 PM'. */
export function formatHourLabel(hour: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12} ${ampm}`;
}
