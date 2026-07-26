import { describe, expect, jest, test } from '@jest/globals';
import {
  createRunMediaCompletionEffects,
  persistRunMedia,
  runMediaRenderSizeKey,
  stageRunMedia,
  type RunMediaPersistenceDependencies,
  type RunMediaStagingDependencies,
} from './saveRunMedia';
import {
  createRunMediaCache,
  type MediaOwner,
  type RunMediaCacheItem,
  type RunMediaFileSystem,
} from './runMediaCache';
import { feedDisabledReasonFor } from './RunMediaActions';

const item: RunMediaCacheItem = {
  id: 'run-media-1',
  uri: 'file:///cache/run-share/run.jpg',
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function dependencies(
  overrides: Partial<RunMediaPersistenceDependencies> = {},
): RunMediaPersistenceDependencies {
  return {
    retain: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    saveToMemories: jest.fn(async () => ({ path: 'member/run.jpg', bytes: 42 })),
    requestPhonePermission: jest.fn(async () => ({ granted: true })),
    saveToPhone: jest.fn(async () => undefined),
    share: jest.fn(async () => undefined),
    uploadToFeed: jest.fn(async () => 'https://images.example/run.jpg'),
    createFeedPost: jest.fn(async () => 'post-1'),
    ...overrides,
  };
}

describe('persistRunMedia', () => {
  test('releases the memories owner only after storage and row confirmation', async () => {
    const confirmation = deferred<{ path: string; bytes: number }>();
    const deps = dependencies({
      saveToMemories: jest.fn(() => confirmation.promise),
    });

    const saving = persistRunMedia('memories', item, deps);

    await Promise.resolve();
    expect(deps.retain).toHaveBeenCalledWith(item.id, 'memories');
    expect(deps.saveToMemories).toHaveBeenCalledWith(item.uri);
    expect(deps.release).not.toHaveBeenCalled();

    confirmation.resolve({ path: 'member/run.jpg', bytes: 42 });
    await expect(saving).resolves.toEqual({ destination: 'memories', persisted: true });
    expect(deps.release).toHaveBeenCalledWith(item.id, 'memories');
  });

  test('requests phone permission before saving and releases after the save confirms', async () => {
    const order: string[] = [];
    const deps = dependencies({
      retain: jest.fn(async (_id: string, owner: MediaOwner) => {
        order.push(`retain:${owner}`);
      }),
      requestPhonePermission: jest.fn(async () => {
        order.push('permission');
        return { granted: true };
      }),
      saveToPhone: jest.fn(async () => {
        order.push('save');
      }),
      release: jest.fn(async (_id: string, owner: MediaOwner) => {
        order.push(`release:${owner}`);
      }),
    });

    await expect(persistRunMedia('phone', item, deps)).resolves.toEqual({
      destination: 'phone',
      persisted: true,
    });

    expect(order).toEqual(['retain:gallery', 'permission', 'save', 'release:gallery']);
  });

  test('share-only uses native sharing and cleans its owner after the API resolves', async () => {
    const shared = deferred<void>();
    const deps = dependencies({
      share: jest.fn(() => shared.promise),
    });

    const sharing = persistRunMedia('share', item, deps);

    await Promise.resolve();
    expect(deps.share).toHaveBeenCalledWith(item.uri);
    expect(deps.saveToMemories).not.toHaveBeenCalled();
    expect(deps.requestPhonePermission).not.toHaveBeenCalled();
    expect(deps.saveToPhone).not.toHaveBeenCalled();
    expect(deps.uploadToFeed).not.toHaveBeenCalled();
    expect(deps.createFeedPost).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();

    shared.resolve();
    await expect(sharing).resolves.toEqual({ destination: 'share', persisted: false });
    expect(deps.release).toHaveBeenCalledWith(item.id, 'share');
  });

  test('an action failure retains cache ownership and preserves the original error for retry', async () => {
    const networkError = new Error('storage request timed out');
    const deps = dependencies({
      saveToMemories: jest.fn(async () => {
        throw networkError;
      }),
    });

    await expect(persistRunMedia('memories', item, deps)).rejects.toBe(networkError);
    expect(deps.retain).toHaveBeenCalledWith(item.id, 'memories');
    expect(deps.release).not.toHaveBeenCalled();
  });

  test('retrying the same destination succeeds without accumulating owner retains', async () => {
    const deleted: string[] = [];
    const fs: RunMediaFileSystem = {
      cacheDirectory: 'file:///cache',
      list: async () => [],
      delete: async (uri) => {
        deleted.push(uri);
      },
    };
    const cache = createRunMediaCache(fs);
    const retryItem = await cache.register(
      'file:///cache/run-share/retry.jpg',
      'editor',
    );
    let attempts = 0;
    const deps = dependencies({
      retain: cache.retain,
      release: cache.release,
      saveToMemories: jest.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary upload failure');
        return { path: 'member/retry.jpg', bytes: 42 };
      }),
    });

    await expect(persistRunMedia('memories', retryItem, deps)).rejects.toThrow(
      'temporary upload failure',
    );
    await expect(persistRunMedia('memories', retryItem, deps)).resolves.toEqual({
      destination: 'memories',
      persisted: true,
    });
    await cache.release(retryItem.id, 'editor');

    expect(attempts).toBe(2);
    expect(deleted).toEqual([retryItem.uri]);
  });

  test('feed release waits for both image upload and post creation confirmation', async () => {
    const uploaded = deferred<string>();
    const posted = deferred<string>();
    const deps = dependencies({
      uploadToFeed: jest.fn(() => uploaded.promise),
      createFeedPost: jest.fn(() => posted.promise),
    });

    const posting = persistRunMedia('feed', item, deps);

    await Promise.resolve();
    expect(deps.createFeedPost).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();

    uploaded.resolve('https://images.example/run.jpg');
    await Promise.resolve();
    expect(deps.createFeedPost).toHaveBeenCalledWith('https://images.example/run.jpg');
    expect(deps.release).not.toHaveBeenCalled();

    posted.resolve('post-1');
    await expect(posting).resolves.toEqual({ destination: 'feed', persisted: true });
    expect(deps.release).toHaveBeenCalledWith(item.id, 'feed');
  });

  test('denied phone permission does not attempt a save or release retry ownership', async () => {
    const deps = dependencies({
      requestPhonePermission: jest.fn(async () => ({ granted: false })),
    });

    await expect(persistRunMedia('phone', item, deps)).rejects.toThrow(
      'Photo library permission is required',
    );
    expect(deps.saveToPhone).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });
});

describe('stageRunMedia', () => {
  test('copies a captured image into managed storage before registering the editor owner', async () => {
    const order: string[] = [];
    const deps: RunMediaStagingDependencies = {
      copyToManagedCache: jest.fn(async () => {
        order.push('copy');
        return item.uri;
      }),
      register: jest.fn(async (uri: string, owner: MediaOwner) => {
        order.push(`register:${owner}`);
        return { id: item.id, uri };
      }),
    };

    await expect(stageRunMedia('file:///temporary/capture.jpg', deps)).resolves.toEqual(item);
    expect(order).toEqual(['copy', 'register:editor']);
    expect(deps.copyToManagedCache).toHaveBeenCalledWith('file:///temporary/capture.jpg');
  });
});

describe('RunMediaActions feed availability', () => {
  test('disables Feed while a queued activity is waiting to sync', () => {
    expect(feedDisabledReasonFor(true)).toBe(
      'Post to Feed is available after this activity syncs.',
    );
  });

  test('uses a supplied Feed disabled reason and otherwise leaves Feed enabled', () => {
    expect(feedDisabledReasonFor(false, 'Verified activities only.')).toBe(
      'Verified activities only.',
    );
    expect(feedDisabledReasonFor(false)).toBeNull();
  });
});

describe('RunShareSheet completion effects', () => {
  test('external Share completion performs no selfie achievement cloud write', async () => {
    const recordSelfie = jest.fn(async () => undefined);
    const effects = createRunMediaCompletionEffects(recordSelfie);

    await effects.complete('share', true, 5);

    expect(recordSelfie).not.toHaveBeenCalled();
  });

  test('records a selfie once after a confirmed persistent in-app destination', async () => {
    const recordSelfie = jest.fn(async () => undefined);
    const effects = createRunMediaCompletionEffects(recordSelfie);

    await effects.complete('phone', true, 5);
    await effects.complete('memories', true, 5);
    await effects.complete('feed', true, 5);

    expect(recordSelfie).toHaveBeenCalledTimes(1);
    expect(recordSelfie).toHaveBeenCalledWith(5);
  });
});

describe('run-media render-size key', () => {
  test('changes when viewport, preview, or export dimensions change', () => {
    const size = {
      viewportWidth: 390,
      viewportHeight: 844,
      previewWidth: 320,
      exportWidth: 1080,
      exportHeight: 1350,
    };
    const original = runMediaRenderSizeKey(size);

    expect(runMediaRenderSizeKey({ ...size, viewportWidth: 844 })).not.toBe(original);
    expect(runMediaRenderSizeKey({ ...size, viewportHeight: 390 })).not.toBe(original);
    expect(runMediaRenderSizeKey({ ...size, previewWidth: 321 })).not.toBe(original);
    expect(
      runMediaRenderSizeKey({ ...size, exportWidth: 1350, exportHeight: 1080 }),
    ).not.toBe(original);
  });
});
