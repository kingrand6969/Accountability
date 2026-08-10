import { describe, expect, jest, test } from '@jest/globals';
import { createChecklistPersistence } from './checklistPersistence';
import type { ChecklistItem } from './types';

const row = (done: boolean): ChecklistItem[] => [{ text: 'Squats', done }];

describe('checklist persistence', () => {
  test('serializes writes and only the latest successful revision completes', async () => {
    const releases: (() => void)[] = [];
    const write = jest.fn(() => new Promise<void>((resolve) => releases.push(resolve)));
    const completed: number[] = [];
    const failed: number[] = [];
    const controller = createChecklistPersistence(row(false), write, {
      onLatestSuccess: (revision, previous, next) => {
        if (!previous.every((item) => item.done) && next.every((item) => item.done)) completed.push(revision);
      },
      onLatestFailure: (revision) => failed.push(revision),
    });

    const first = controller.submit(row(true));
    const second = controller.submit(row(false));
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    releases.shift()?.();
    await first;
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(2);
    releases.shift()?.();
    await second;

    expect(completed).toEqual([]);
    expect(failed).toEqual([]);
  });

  test('a stale failure cannot roll back a newer revision', async () => {
    const write = jest.fn<(next: ChecklistItem[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('old failure'))
      .mockResolvedValueOnce(undefined);
    const failures: number[] = [];
    const controller = createChecklistPersistence(row(false), write, {
      onLatestSuccess: jest.fn(),
      onLatestFailure: (revision) => failures.push(revision),
    });

    const first = controller.submit(row(true));
    const second = controller.submit(row(false));
    await expect(first).rejects.toThrow('old failure');
    await second;
    expect(failures).toEqual([]);
  });
});
