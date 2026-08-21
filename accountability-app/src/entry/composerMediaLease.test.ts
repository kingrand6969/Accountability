import { describe, expect, jest, test } from '@jest/globals';
import { createComposerMediaLease, runComposerPickerLease } from './composerMediaLease';

describe('Composer media picker lease', () => {
  test.each(['A to B', 'A to B to A', 'unmount'])(
    'discards a deferred picker result after %s',
    async (transition) => {
      let owner: string | null = 'owner-a';
      let mountToken = 1;
      let requestToken = 1;
      let active = true;
      let resolve!: (value: string) => void;
      const launch = jest.fn(() => new Promise<string>((done) => { resolve = done; }));
      const accept = jest.fn(async () => {});
      const discard = jest.fn(async () => {});
      const lease = createComposerMediaLease('owner-a', mountToken, requestToken);
      const pending = runComposerPickerLease({
        lease,
        current: () => ({ owner, mountToken, requestToken, active, editing: false }),
        launch,
        accept,
        discard,
      });

      if (transition === 'A to B') {
        owner = 'owner-b'; mountToken = 2;
      } else if (transition === 'A to B to A') {
        owner = 'owner-b'; mountToken = 2;
        owner = 'owner-a'; mountToken = 3;
      } else {
        active = false; mountToken = 2;
      }
      resolve('picked-result');
      await pending;

      expect(accept).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledWith('picked-result');
    },
  );

  test('accepts only the current request and rechecks after async acceptance', async () => {
    let requestToken = 4;
    const accepted = jest.fn(async () => { requestToken = 5; });
    const discard = jest.fn(async () => {});
    const applied = await runComposerPickerLease({
      lease: createComposerMediaLease('owner-a', 2, 4),
      current: () => ({ owner: 'owner-a', mountToken: 2, requestToken, active: true, editing: false }),
      launch: async () => 'picked-result',
      accept: accepted,
      discard,
    });
    expect(applied).toBe(false);
    expect(discard).toHaveBeenCalledWith('picked-result');
  });

  test.each(['picker persistence', 'edited-photo persistence'])(
    'rejects a deferred %s result when context changes before persistence resolves',
    async () => {
      let mountToken = 8;
      let finishPersistence!: () => void;
      const persistence = new Promise<void>((resolve) => { finishPersistence = resolve; });
      const discard = jest.fn(async () => {});
      const pending = runComposerPickerLease({
        lease: createComposerMediaLease('owner-a', 8, 3),
        current: () => ({
          owner: 'owner-a', mountToken, requestToken: 3, active: true, editing: false,
        }),
        launch: async () => 'durable-result',
        accept: async () => persistence,
        discard,
      });
      await Promise.resolve();
      mountToken = 9;
      finishPersistence();
      await expect(pending).resolves.toBe(false);
      expect(discard).toHaveBeenCalledWith('durable-result');
    },
  );
});
