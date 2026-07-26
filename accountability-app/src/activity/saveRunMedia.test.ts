import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../lib/supabase', () => {
  const insert = jest.fn();
  const maybeSingle = jest.fn();
  const upload = jest.fn();
  const remove = jest.fn();
  return {
    memoryApiMocks: { insert, maybeSingle, upload, remove },
    supabase: {
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: { id: 'member-1' } },
          error: null,
        })),
      },
      rpc: jest.fn(async () => ({ data: 0, error: null })),
      storage: {
        from: jest.fn(() => ({
          upload,
          remove,
        })),
      },
      from: jest.fn(() => ({
        insert,
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle })),
        })),
      })),
    },
  };
});

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async () => ({ base64: 'AQ==' })),
  SaveFormat: { JPEG: 'jpeg' },
}));

import {
  createRunMediaCompletionEffects,
  createRunMediaOperationId,
  persistRunMedia,
  runMediaRenderSizeKey,
  stageRunMediaForGeneration,
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
import { feedDisabledReasonFor, runMediaErrorMessage } from './RunMediaActions';
import {
  confirmMemoryRowAfterInsertError,
  saveImageToMemories,
} from '../memories/api';

const memoryApiMocks = (
  jest.requireMock('../lib/supabase') as {
    memoryApiMocks: {
      insert: jest.Mock<(...args: any[]) => Promise<any>>;
      maybeSingle: jest.Mock<(...args: any[]) => Promise<any>>;
      upload: jest.Mock<(...args: any[]) => Promise<any>>;
      remove: jest.Mock<(...args: any[]) => Promise<any>>;
    };
  }
).memoryApiMocks;

const item: RunMediaCacheItem = {
  id: 'run-media-1',
  uri: 'file:///cache/run-share/run.jpg',
};

beforeEach(() => {
  memoryApiMocks.insert.mockReset();
  memoryApiMocks.maybeSingle.mockReset();
  memoryApiMocks.upload.mockReset();
  memoryApiMocks.remove.mockReset();
  memoryApiMocks.upload.mockResolvedValue({ error: null });
  memoryApiMocks.remove.mockResolvedValue({ error: null });
});

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
    findExistingFeedPost: jest.fn(async () => null),
    uploadToFeed: jest.fn(async () => 'https://images.example/run.jpg'),
    createFeedPost: jest.fn(async () => ({ postId: 'post-1', created: true })),
    ...overrides,
  };
}

function realCacheFixture(filename: string) {
  const deleted: string[] = [];
  const fs: RunMediaFileSystem = {
    cacheDirectory: 'file:///cache',
    list: async () => [],
    delete: async (uri) => {
      deleted.push(uri);
    },
  };
  const cache = createRunMediaCache(fs);
  return {
    cache,
    deleted,
    register: () =>
      cache.register(`file:///cache/run-share/${filename}`, 'editor'),
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
    await expect(saving).resolves.toEqual({
      destination: 'memories',
      persisted: true,
      newlyPersisted: true,
    });
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
      newlyPersisted: true,
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
    await expect(sharing).resolves.toEqual({
      destination: 'share',
      persisted: false,
      newlyPersisted: false,
    });
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
    expect(deps.release).toHaveBeenCalledWith(item.id, 'memories');
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
      newlyPersisted: true,
    });
    await cache.release(retryItem.id, 'editor');

    expect(attempts).toBe(2);
    expect(deleted).toEqual([retryItem.uri]);
  });

  test('feed release waits for both image upload and post creation confirmation', async () => {
    const uploaded = deferred<string>();
    const posted = deferred<{ postId: string; created: boolean }>();
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
    await Promise.resolve();
    expect(deps.createFeedPost).toHaveBeenCalledWith('https://images.example/run.jpg');
    expect(deps.release).not.toHaveBeenCalled();

    posted.resolve({ postId: 'post-1', created: true });
    await expect(posting).resolves.toEqual({
      destination: 'feed',
      persisted: true,
      newlyPersisted: true,
    });
    expect(deps.release).toHaveBeenCalledWith(item.id, 'feed');
  });

  test('feed skips image upload and post creation when the operation already exists', async () => {
    const deps = dependencies({
      findExistingFeedPost: jest.fn(async () => 'post-existing'),
    });

    await expect(persistRunMedia('feed', item, deps)).resolves.toEqual({
      destination: 'feed',
      persisted: true,
      newlyPersisted: false,
    });
    expect(deps.uploadToFeed).not.toHaveBeenCalled();
    expect(deps.createFeedPost).not.toHaveBeenCalled();
  });

  test('feed retry reuses the same deterministic image after post creation fails', async () => {
    let postAttempts = 0;
    const deterministicUrl = 'https://images.example/member/post/operation.jpg';
    const deps = dependencies({
      uploadToFeed: jest.fn(async () => deterministicUrl),
      createFeedPost: jest.fn(async () => {
        postAttempts += 1;
        if (postAttempts === 1) throw new Error('post unavailable');
        return { postId: 'post-1', created: true };
      }),
    });

    await expect(persistRunMedia('feed', item, deps)).rejects.toThrow('post unavailable');
    await expect(persistRunMedia('feed', item, deps)).resolves.toEqual({
      destination: 'feed',
      persisted: true,
      newlyPersisted: true,
    });

    expect(deps.uploadToFeed).toHaveBeenNthCalledWith(1, item.uri);
    expect(deps.uploadToFeed).toHaveBeenNthCalledWith(2, item.uri);
    expect(postAttempts).toBe(2);
  });

  test('denied phone permission does not attempt a save or release retry ownership', async () => {
    const deps = dependencies({
      requestPhonePermission: jest.fn(async () => ({ granted: false })),
    });

    await expect(persistRunMedia('phone', item, deps)).rejects.toThrow(
      'Photo library permission is required',
    );
    expect(deps.saveToPhone).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith(item.id, 'gallery');
  });

  test('a failed destination can be cleaned when the editor closes', async () => {
    const { cache, deleted, register } = realCacheFixture('failed-close.jpg');
    const failedItem = await register();
    const deps = dependencies({
      retain: cache.retain,
      release: cache.release,
      saveToMemories: jest.fn(async () => {
        throw new Error('upload failed');
      }),
    });

    await expect(persistRunMedia('memories', failedItem, deps)).rejects.toThrow(
      'upload failed',
    );
    await cache.release(failedItem.id, 'editor');

    expect(deleted).toEqual([failedItem.uri]);
  });

  test('a render change can discard a failed old export without affecting the replacement', async () => {
    const { cache, deleted, register } = realCacheFixture('failed-render.jpg');
    const oldItem = await register();
    const deps = dependencies({
      retain: cache.retain,
      release: cache.release,
      saveToMemories: jest.fn(async () => {
        throw new Error('upload failed');
      }),
    });

    await expect(persistRunMedia('memories', oldItem, deps)).rejects.toThrow(
      'upload failed',
    );
    await cache.release(oldItem.id, 'editor');
    const replacement = await cache.register(
      'file:///cache/run-share/replacement.jpg',
      'editor',
    );

    expect(deleted).toEqual([oldItem.uri]);
    await cache.release(replacement.id, 'editor');
    expect(deleted).toEqual([oldItem.uri, replacement.uri]);
  });

  test('a different destination can succeed after a failure on the same editor export', async () => {
    const { cache, deleted, register } = realCacheFixture('other-action.jpg');
    const sharedItem = await register();
    const deps = dependencies({
      retain: cache.retain,
      release: cache.release,
      saveToMemories: jest.fn(async () => {
        throw new Error('upload failed');
      }),
    });

    await expect(persistRunMedia('memories', sharedItem, deps)).rejects.toThrow(
      'upload failed',
    );
    await expect(persistRunMedia('share', sharedItem, deps)).resolves.toEqual({
      destination: 'share',
      persisted: false,
      newlyPersisted: false,
    });
    await cache.release(sharedItem.id, 'editor');

    expect(deleted).toEqual([sharedItem.uri]);
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

  test('never assigns a staged export when the render generation changes in flight', async () => {
    const captured = deferred<string | null>();
    let generation = 3;
    const stage = jest.fn(async () => item);
    const release = jest.fn(async () => undefined);

    const result = stageRunMediaForGeneration(3, {
      capture: () => captured.promise,
      currentGeneration: () => generation,
      stage,
      release,
    });
    generation = 4;
    captured.resolve('file:///temporary/stale.jpg');

    await expect(result).resolves.toEqual({ status: 'stale' });
    expect(stage).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  test('releases only the managed staged export when generation changes during staging', async () => {
    const staged = deferred<RunMediaCacheItem>();
    let generation = 7;
    const release = jest.fn(async () => undefined);

    const result = stageRunMediaForGeneration(7, {
      capture: async () => 'file:///temporary/capture.jpg',
      currentGeneration: () => generation,
      stage: () => staged.promise,
      release,
    });
    await Promise.resolve();
    generation = 8;
    staged.resolve(item);

    await expect(result).resolves.toEqual({ status: 'stale' });
    expect(release).toHaveBeenCalledWith(item.id, 'editor');
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

  test('normalizes null and Error failures without leaving an empty message', () => {
    expect(runMediaErrorMessage(new Error('Network unavailable'))).toBe(
      'Network unavailable',
    );
    expect(runMediaErrorMessage(null)).toBe('Something went wrong');
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

describe('run-media Feed operation identity', () => {
  test('generates a stable UUID value that can be retained across retries', () => {
    const operationId = createRunMediaOperationId(() => 0.5);

    expect(operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(createRunMediaOperationId(() => 0.5)).toBe(operationId);
  });
});

describe('ambiguous Memories row insertion', () => {
  test('saveImageToMemories confirms a committed row after a lost response without deleting the object', async () => {
    const insertError = new Error('response lost');
    memoryApiMocks.insert.mockResolvedValue({ error: insertError });
    memoryApiMocks.maybeSingle.mockResolvedValue({
      data: { path: 'member-1/confirmed.jpg', bytes: 1 },
      error: null,
    });

    await expect(saveImageToMemories('file:///run.jpg')).resolves.toEqual({
      path: 'member-1/confirmed.jpg',
      bytes: 1,
    });
    expect(memoryApiMocks.upload).toHaveBeenCalledTimes(1);
    expect(memoryApiMocks.remove).not.toHaveBeenCalled();
  });

  test('saveImageToMemories retains the object when confirmation is unavailable', async () => {
    const insertError = new Error('insert response lost');
    const confirmationError = new Error('confirmation unavailable');
    memoryApiMocks.insert.mockResolvedValue({ error: insertError });
    memoryApiMocks.maybeSingle.mockResolvedValue({
      data: null,
      error: confirmationError,
    });

    await expect(saveImageToMemories('file:///run.jpg')).rejects.toMatchObject({
      errors: [insertError, confirmationError],
    });
    expect(memoryApiMocks.upload).toHaveBeenCalledTimes(1);
    expect(memoryApiMocks.remove).not.toHaveBeenCalled();
  });

  test('treats a committed row with a lost insert response as success without deletion', async () => {
    const insertError = new Error('response lost');
    const deleteUploadedObject = jest.fn(async () => undefined);

    await expect(
      confirmMemoryRowAfterInsertError(
        { path: 'member/run.jpg', bytes: 42 },
        insertError,
        async () => ({ path: 'member/run.jpg', bytes: 42 }),
      ),
    ).resolves.toEqual({ path: 'member/run.jpg', bytes: 42 });
    expect(deleteUploadedObject).not.toHaveBeenCalled();
  });

  test('retains the object and combines errors when row confirmation is unavailable', async () => {
    const insertError = new Error('insert response lost');
    const confirmationError = new Error('confirmation unavailable');
    const deleteUploadedObject = jest.fn(async () => undefined);

    const recovery = confirmMemoryRowAfterInsertError(
      { path: 'member/run.jpg', bytes: 42 },
      insertError,
      async () => {
        throw confirmationError;
      },
    );

    await expect(recovery).rejects.toMatchObject({
      errors: [insertError, confirmationError],
    });
    expect(deleteUploadedObject).not.toHaveBeenCalled();
  });
});
