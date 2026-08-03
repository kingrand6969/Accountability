import { expect, it, jest } from '@jest/globals';
import { buildPromiseItems, persistPromisesForToday } from './promisePersistence';
import type { NewTimelineItem, TimelineItem } from '../timeline/types';

const DAY = new Date(2026, 6, 28, 12, 0, 0);

it('maps selected promises to real timeline items only', () => {
  const items = buildPromiseItems(new Set(['body-run', 'focus-work', 'unknown']), DAY);
  expect(items.map(({ id }) => id)).toEqual(['body-run', 'focus-work']);
  expect(items[0].item.type).toBe('activity');
  expect(items[1].item.title).toBe('90 min deep work');
  expect(items.every(({ item }) => item.note === null)).toBe(true);
});

it('does not create a duplicate promise when the same promise already exists today', async () => {
  const created: NewTimelineItem[] = [];
  const existing = [
    {
      id: 'existing',
      user_id: 'user',
      type: 'activity',
      title: 'Morning run 3.2 km',
      note: null,
      checklist: null,
      starts_at: DAY.toISOString(),
      reminder_id: null,
      created_at: DAY.toISOString(),
    },
  ] satisfies TimelineItem[];

  await persistPromisesForToday(
    new Set(['body-run', 'money-save']),
    {
      listItemsForDay: async () => existing,
      createItem: async (item) => {
        created.push(item);
      },
    },
    DAY,
  );

  expect(created).toHaveLength(1);
  expect(created[0].title).toBe('Save $50');
});

it('creates no timeline item when no promise is selected', async () => {
  const createItem = jest.fn<(item: NewTimelineItem) => Promise<void>>();

  await persistPromisesForToday(
    new Set(),
    {
      listItemsForDay: async () => [],
      createItem,
    },
    DAY,
  );

  expect(createItem).not.toHaveBeenCalled();
});

it('creates no duplicates when the same selection is persisted twice', async () => {
  const rows: TimelineItem[] = [];
  const createItem = jest.fn(async (item: NewTimelineItem) => {
    rows.push({
      ...item,
      id: `created-${rows.length}`,
      user_id: 'user',
      note: item.note ?? null,
      checklist: null,
      reminder_id: item.reminder_id ?? null,
      created_at: DAY.toISOString(),
    });
  });
  const dependencies = {
    listItemsForDay: async () => rows,
    createItem,
  };

  await persistPromisesForToday(new Set(['body-run', 'money-save']), dependencies, DAY);
  await persistPromisesForToday(new Set(['body-run', 'money-save']), dependencies, DAY);

  expect(createItem).toHaveBeenCalledTimes(2);
  expect(rows.map((row) => row.title)).toEqual(['Morning run 3.2 km', 'Save $50']);
});

it('does not create an item if the owner changes while the existing day is loading', async () => {
  let current = true;
  const createItem = jest.fn(async (_item: NewTimelineItem) => {});

  await expect(
    persistPromisesForToday(
      new Set(['body-run']),
      {
        listItemsForDay: async () => {
          current = false;
          return [];
        },
        createItem,
        isCurrentOwner: () => current,
      },
      DAY,
    ),
  ).rejects.toThrow('Account changed');
  expect(createItem).not.toHaveBeenCalled();
});

it('stops before a second item if the owner changes during the first create', async () => {
  let current = true;
  const createItem = jest.fn(async (_item: NewTimelineItem) => {
    current = false;
  });

  await expect(
    persistPromisesForToday(
      new Set(['body-run', 'money-save']),
      {
        listItemsForDay: async () => [],
        createItem,
        isCurrentOwner: () => current,
      },
      DAY,
    ),
  ).rejects.toThrow('Account changed');
  expect(createItem).toHaveBeenCalledTimes(1);
});
