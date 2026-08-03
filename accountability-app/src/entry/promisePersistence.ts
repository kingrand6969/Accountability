import type { NewTimelineItem, TimelineItem, TimelineType } from '../timeline/types';
import { toLocalDateString, toIsoFromLocal } from '../timeline/datetime';

export const PROMISE_DEFINITIONS = [
  { id: 'body-run', type: 'activity', title: 'Morning run 3.2 km', time: '07:15' },
  { id: 'money-save', type: 'task', title: 'Save $50', time: '09:30' },
  { id: 'focus-work', type: 'task', title: '90 min deep work', time: '13:00' },
  { id: 'people-call', type: 'task', title: 'Call someone I care about', time: '18:00' },
] as const satisfies readonly {
  id: string;
  type: TimelineType;
  title: string;
  time: string;
}[];

export function buildPromiseItems(
  selectedIds: ReadonlySet<string>,
  day = new Date(),
): { id: string; item: NewTimelineItem }[] {
  const date = toLocalDateString(day);
  return PROMISE_DEFINITIONS.filter((definition) => selectedIds.has(definition.id)).map(
    (definition) => ({
      id: definition.id,
      item: {
        type: definition.type,
        title: definition.title,
        note: null,
        starts_at: toIsoFromLocal(date, definition.time),
        reminder_id: null,
      },
    }),
  );
}

export async function persistPromisesForToday(
  selectedIds: ReadonlySet<string>,
  dependencies: {
    listItemsForDay: (day: Date) => Promise<TimelineItem[]>;
    createItem: (item: NewTimelineItem) => Promise<void>;
    isCurrentOwner?: () => boolean;
  },
  day = new Date(),
): Promise<void> {
  const isCurrentOwner = dependencies.isCurrentOwner ?? (() => true);
  if (!isCurrentOwner()) throw new Error('Account changed');
  const existing = await dependencies.listItemsForDay(day);
  if (!isCurrentOwner()) throw new Error('Account changed');
  const existingTitles = new Set(existing.map((item) => item.title.trim().toLocaleLowerCase()));
  const pending = buildPromiseItems(selectedIds, day).filter(
    ({ item }) => !existingTitles.has(item.title.trim().toLocaleLowerCase()),
  );
  for (const { item } of pending) {
    if (!isCurrentOwner()) throw new Error('Account changed');
    await dependencies.createItem(item);
    if (!isCurrentOwner()) throw new Error('Account changed');
  }
}
