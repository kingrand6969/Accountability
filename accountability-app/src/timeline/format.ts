import type { TimelineType } from './types';

/** icon = Ionicons name; tint = per-type accent for the icon badge. */
export const TIMELINE_TYPES: {
  value: TimelineType;
  label: string;
  emoji: string;
  icon: string;
  tint: string;
}[] = [
  { value: 'event', label: 'Event', emoji: '📅', icon: 'calendar-outline', tint: '#2563eb' },
  { value: 'task', label: 'Task', emoji: '✅', icon: 'checkmark-circle-outline', tint: '#16a34a' },
  { value: 'workout', label: 'Workout', emoji: '🏋️', icon: 'barbell-outline', tint: '#7c3aed' },
  { value: 'meal', label: 'Meal', emoji: '🥗', icon: 'nutrition-outline', tint: '#16a34a' },
  { value: 'expense', label: 'Expense', emoji: '💸', icon: 'cash-outline', tint: '#dc2626' },
  { value: 'income', label: 'Income', emoji: '💰', icon: 'wallet-outline', tint: '#16a34a' },
  { value: 'activity', label: 'Activity', emoji: '🏃', icon: 'walk-outline', tint: '#ea580c' },
  { value: 'grocery', label: 'Groceries', emoji: '🛒', icon: 'cart-outline', tint: '#0d9488' },
  { value: 'other', label: 'Other', emoji: '📌', icon: 'bookmark-outline', tint: '#64748b' },
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
