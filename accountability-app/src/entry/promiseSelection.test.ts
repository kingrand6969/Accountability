import { expect, it, jest } from '@jest/globals';
import {
  completePromiseSelection,
  createSingleFlight,
  promiseCompletionWrites,
  togglePromiseSelection,
} from './promiseSelection';
import { persistPromisesForToday } from './promisePersistence';
import type { NewTimelineItem, TimelineItem } from '../timeline/types';
import { readFileSync } from 'node:fs';

it('binds the zero, partial, full, and attempted-fourth states to the Promise screen', () => {
  const source = readFileSync(require.resolve('../app/onboarding'), 'utf8');

  expect(source).toContain('selectedPromises.size} of 3 selected');
  expect(source).toContain('selectedPromises.size === 0');
  expect(source).toContain('selectedPromises.size === 3');
  expect(source).toContain('You can choose up to 3. Remove one to choose another.');
  expect(source).toContain('disabled={saving || selectedPromises.size === 0}');
});

it('adds an unselected promise', () => {
  expect([...togglePromiseSelection(new Set(), 'body-run')]).toEqual(['body-run']);
});

it('removes a selected promise', () => {
  expect([...togglePromiseSelection(new Set(['body-run']), 'body-run')]).toEqual([]);
});

it('does not add a fourth promise', () => {
  expect([
    ...togglePromiseSelection(
      new Set(['body-run', 'money-save', 'focus-work']),
      'people-call',
    ),
  ]).toEqual(['body-run', 'money-save', 'focus-work']);
});

it('describes skip completion without a timeline write', () => {
  expect(promiseCompletionWrites('u1', new Set(), 'skip')).toEqual({
    dailyKey: 'daily-promises:u1',
    dailyValue: '[]',
    onboardingKey: 'onboarded:u1',
    onboardingValue: '1',
    persistTimeline: false,
  });
});

function completionDependencies() {
  return {
    persistTimeline: jest.fn<(selected: ReadonlySet<string>) => Promise<void>>(
      async () => {},
    ),
    setItem: jest.fn<(key: string, value: string) => Promise<void>>(async () => {}),
  };
}

it('makes zero-selection Start a no-op', async () => {
  const dependencies = completionDependencies();

  await expect(
    completePromiseSelection(
      { userId: 'u1', selected: new Set(), completion: 'start' },
      dependencies,
    ),
  ).resolves.toEqual({ outcome: 'noop' });
  expect(dependencies.persistTimeline).not.toHaveBeenCalled();
  expect(dependencies.setItem).not.toHaveBeenCalled();
});

it('completes Skip with daily then onboarded storage and no timeline call', async () => {
  const dependencies = completionDependencies();

  await expect(
    completePromiseSelection(
      { userId: 'u1', selected: new Set(), completion: 'skip' },
      dependencies,
    ),
  ).resolves.toEqual({ outcome: 'completed' });
  expect(dependencies.persistTimeline).not.toHaveBeenCalled();
  expect(dependencies.setItem.mock.calls).toEqual([
    ['daily-promises:u1', '[]'],
    ['onboarded:u1', '1'],
  ]);
});

it('persists selected Start timeline before storage', async () => {
  const order: string[] = [];
  const selected = new Set(['body-run']);

  await expect(
    completePromiseSelection(
      { userId: 'u1', selected, completion: 'start' },
      {
        persistTimeline: async (received) => {
          expect(received).toBe(selected);
          order.push('timeline');
        },
        setItem: async (key) => {
          order.push(key);
        },
      },
    ),
  ).resolves.toEqual({ outcome: 'completed' });
  expect(order).toEqual(['timeline', 'daily-promises:u1', 'onboarded:u1']);
});

it('stays for retry without completion storage after timeline failure', async () => {
  const dependencies = completionDependencies();
  dependencies.persistTimeline.mockRejectedValueOnce(new Error('offline'));

  await expect(
    completePromiseSelection(
      { userId: 'u1', selected: new Set(['body-run']), completion: 'start' },
      dependencies,
    ),
  ).resolves.toEqual({
    outcome: 'stay',
    error: 'offline Check your connection, then try again.',
  });
  expect(dependencies.setItem).not.toHaveBeenCalled();
});

it('retries partial timeline persistence without duplicating reconciled rows', async () => {
  const day = new Date(2026, 6, 28, 12, 0, 0);
  const rows: TimelineItem[] = [];
  let failSecondCreate = true;
  const persistTimeline = (selected: ReadonlySet<string>) =>
    persistPromisesForToday(
      selected,
      {
        listItemsForDay: async () => rows,
        createItem: async (item: NewTimelineItem) => {
          if (failSecondCreate && rows.length === 1) {
            failSecondCreate = false;
            throw new Error('connection lost');
          }
          rows.push({
            ...item,
            id: `created-${rows.length}`,
            user_id: 'u1',
            note: item.note ?? null,
            checklist: null,
            reminder_id: item.reminder_id ?? null,
            created_at: day.toISOString(),
          });
        },
      },
      day,
    );
  const setItem = jest.fn(async () => {});
  const request = {
    userId: 'u1',
    selected: new Set(['body-run', 'money-save']),
    completion: 'start' as const,
  };

  await expect(completePromiseSelection(request, { persistTimeline, setItem })).resolves.toMatchObject({
    outcome: 'stay',
  });
  await expect(completePromiseSelection(request, { persistTimeline, setItem })).resolves.toEqual({
    outcome: 'completed',
  });
  expect(rows.map((row) => row.title)).toEqual(['Morning run 3.2 km', 'Save $50']);
});

it('keeps completion keys isolated when accounts switch', async () => {
  const dependencies = completionDependencies();

  await completePromiseSelection(
    { userId: 'user-a', selected: new Set(['body-run']), completion: 'start' },
    dependencies,
  );
  await completePromiseSelection(
    { userId: 'user-b', selected: new Set(['money-save']), completion: 'start' },
    dependencies,
  );

  expect(dependencies.setItem.mock.calls).toEqual([
    ['daily-promises:user-a', '["body-run"]'],
    ['onboarded:user-a', '1'],
    ['daily-promises:user-b', '["money-save"]'],
    ['onboarded:user-b', '1'],
  ]);
});

it('coalesces simultaneous UI submissions into one persistence flight', async () => {
  const flight = createSingleFlight();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const persist = jest.fn(async () => {
    await blocked;
    return { outcome: 'completed' as const };
  });

  const first = flight.run(persist);
  const second = flight.run(persist);
  release();

  await expect(Promise.all([first, second])).resolves.toEqual([
    { outcome: 'completed' },
    { outcome: 'completed' },
  ]);
  expect(persist).toHaveBeenCalledTimes(1);
});

it('fails closed when owner changes A to B during an in-flight timeline write', async () => {
  let owner = 'A';
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const setItem = jest.fn(async () => {});
  const result = completePromiseSelection(
    { userId: 'A', selected: new Set(['body-run']), completion: 'start' },
    {
      persistTimeline: async () => { await blocked; },
      setItem,
      isCurrentOwner: () => owner === 'A',
    },
  );

  owner = 'B';
  release();

  await expect(result).resolves.toEqual({ outcome: 'detached' });
  expect(setItem).not.toHaveBeenCalled();
});

it('fails closed across an A to B to A ABA switch by binding an owner epoch', async () => {
  let owner = 'A';
  let epoch = 1;
  const expectedEpoch = epoch;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const setItem = jest.fn(async () => {});
  const result = completePromiseSelection(
    { userId: 'A', selected: new Set(['body-run']), completion: 'start' },
    {
      persistTimeline: async () => { await blocked; },
      setItem,
      isCurrentOwner: () => owner === 'A' && epoch === expectedEpoch,
    },
  );

  owner = 'B';
  epoch += 1;
  owner = 'A';
  epoch += 1;
  release();

  await expect(result).resolves.toEqual({ outcome: 'detached' });
  expect(setItem).not.toHaveBeenCalled();
});

it('production-binds account changes to reset state, flight, and owner epoch', () => {
  const source = readFileSync(require.resolve('../app/onboarding'), 'utf8');

  expect(source).toContain("<PromiseStep key={userId ?? 'signed-out'} userId={userId}");
  expect(source).toContain('const completionFlight = useRef(createSingleFlight()).current');
  expect(source).toContain('const [selectedPromises, setSelectedPromises] = useState<Set<string>>(new Set())');
  expect(source).toContain('activeOwnerRef.current = false');
  expect(source).toContain("result.outcome === 'detached'");
});

it('stays unauthenticated before any timeline or storage side effect', async () => {
  const dependencies = completionDependencies();

  await expect(
    completePromiseSelection(
      { userId: null, selected: new Set(['body-run']), completion: 'start' },
      dependencies,
    ),
  ).resolves.toEqual({
    outcome: 'stay',
    error: 'Please sign in again before starting your day.',
  });
  expect(dependencies.persistTimeline).not.toHaveBeenCalled();
  expect(dependencies.setItem).not.toHaveBeenCalled();
});

it('reports only a failed daily selection write while completing', async () => {
  const dependencies = completionDependencies();
  dependencies.setItem.mockImplementation(async (key) => {
    if (key === 'daily-promises:u1') throw new Error('storage unavailable');
  });

  await expect(
    completePromiseSelection(
      { userId: 'u1', selected: new Set(['body-run']), completion: 'start' },
      dependencies,
    ),
  ).resolves.toEqual({
    outcome: 'completed',
    storageFailures: ['daily'],
    warning:
      "Your day is ready, but today's promise choices were not saved on this device. Continue now; you can choose them again later.",
  });
});

it('reports only a failed onboarded write while completing', async () => {
  const dependencies = completionDependencies();
  dependencies.setItem.mockImplementation(async (key) => {
    if (key === 'onboarded:u1') throw new Error('storage unavailable');
  });

  await expect(
    completePromiseSelection(
      { userId: 'u1', selected: new Set(['body-run']), completion: 'start' },
      dependencies,
    ),
  ).resolves.toEqual({
    outcome: 'completed',
    storageFailures: ['onboarding'],
    warning:
      'Your day is ready, but this device could not remember that onboarding is complete. Continue now; onboarding may appear again next time.',
  });
});
