import { describe, expect, jest, test } from '@jest/globals';
import { runFeedCriticalLoad } from './feedLoadCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

describe('runFeedCriticalLoad', () => {
  test('commits page rows and settles visible loading before previews resolve', async () => {
    const pendingPreviews = deferred<Map<string, string>>();
    const events: string[] = [];

    const result = await runFeedCriticalLoad({
      loadPage: async () => [{ id: 'post-1' }],
      loadPreviews: () => pendingPreviews.promise,
      isCurrent: () => true,
      onPage: (page) => events.push(`page:${page[0]?.id}`),
      onPageError: () => events.push('page-error'),
      onPreviews: () => events.push('previews'),
      onVisibleSettled: () => events.push('settled'),
    });

    expect(result).toBe('loaded');
    expect(events).toEqual(['page:post-1', 'settled']);

    pendingPreviews.resolve(new Map([['post-1', 'ready']]));
    await pendingPreviews.promise;
    await Promise.resolve();
    expect(events).toEqual(['page:post-1', 'settled', 'previews']);
  });

  test('preserves existing rows when a same-owner refresh fails', async () => {
    let rows = [{ id: 'existing-post' }];
    const onPageError = jest.fn();
    const onVisibleSettled = jest.fn();

    const result = await runFeedCriticalLoad({
      loadPage: async () => { throw new Error('offline'); },
      loadPreviews: async () => new Map<string, string>(),
      isCurrent: () => true,
      onPage: (page) => { rows = page; },
      onPageError,
      onPreviews: jest.fn(),
      onVisibleSettled,
    });

    expect(result).toBe('failed');
    expect(rows).toEqual([{ id: 'existing-post' }]);
    expect(onPageError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }));
    expect(onVisibleSettled).toHaveBeenCalledTimes(1);
  });

  test('drops preview completion after its owner or generation becomes stale', async () => {
    const pendingPreviews = deferred<Map<string, string>>();
    let current = true;
    const onPreviews = jest.fn();

    await runFeedCriticalLoad({
      loadPage: async () => [{ id: 'private-post' }],
      loadPreviews: () => pendingPreviews.promise,
      isCurrent: () => current,
      onPage: jest.fn(),
      onPageError: jest.fn(),
      onPreviews,
      onVisibleSettled: jest.fn(),
    });

    current = false;
    pendingPreviews.resolve(new Map([['private-post', 'stale']]));
    await pendingPreviews.promise;
    await Promise.resolve();
    expect(onPreviews).not.toHaveBeenCalled();
  });

  test('does not commit a page that becomes stale before its critical request settles', async () => {
    const pendingPage = deferred<{ id: string }[]>();
    let current = true;
    const onPage = jest.fn();
    const onVisibleSettled = jest.fn();

    const load = runFeedCriticalLoad({
      loadPage: () => pendingPage.promise,
      loadPreviews: async () => new Map<string, string>(),
      isCurrent: () => current,
      onPage,
      onPageError: jest.fn(),
      onPreviews: jest.fn(),
      onVisibleSettled,
    });
    current = false;
    pendingPage.resolve([{ id: 'owner-a-post' }]);

    await expect(load).resolves.toBe('stale');
    expect(onPage).not.toHaveBeenCalled();
    expect(onVisibleSettled).not.toHaveBeenCalled();
  });
});
