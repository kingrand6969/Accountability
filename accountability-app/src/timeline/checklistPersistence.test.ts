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

  test('dispose suppresses deferred success and failure callbacks after blur', async () => {
    let release!: () => void;
    const deferred = new Promise<void>((resolve) => { release = resolve; });
    const success = jest.fn();
    const failure = jest.fn();
    const controller = createChecklistPersistence(row(false), () => deferred, {
      onLatestSuccess: success,
      onLatestFailure: failure,
    });
    const pending = controller.submit(row(true));
    await Promise.resolve();
    controller.dispose();
    release();
    await pending;
    expect(success).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  test('dispose suppresses a deferred failure and active completion fires once', async () => {
    let reject!: (error: Error) => void;
    const deferred = new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const failure = jest.fn();
    const disposed = createChecklistPersistence(row(false), () => deferred, {
      onLatestSuccess: jest.fn(),
      onLatestFailure: failure,
    });
    const pending = disposed.submit(row(true));
    await Promise.resolve();
    disposed.dispose();
    reject(new Error('late failure'));
    await expect(pending).rejects.toThrow('late failure');
    expect(failure).not.toHaveBeenCalled();

    const success = jest.fn();
    const active = createChecklistPersistence(row(false), async () => undefined, {
      onLatestSuccess: success,
      onLatestFailure: jest.fn(),
    });
    await active.submit(row(true));
    expect(success).toHaveBeenCalledTimes(1);
  });
});
