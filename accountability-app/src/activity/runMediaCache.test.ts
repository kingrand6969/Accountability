import { describe, expect, test } from '@jest/globals';
import {
  cleanupAbandonedRunMedia,
  createRunMediaCache,
  type RunMediaFileSystem,
} from './runMediaCache';

const DAY = 24 * 60 * 60 * 1000;

function createFakeFileSystem(
  entries: Awaited<ReturnType<RunMediaFileSystem['list']>> = [],
) {
  const deleted: string[] = [];
  const fs: RunMediaFileSystem = {
    cacheDirectory: '/cache',
    list: async () => entries,
    delete: async (uri) => {
      deleted.push(uri);
    },
  };

  return { fs, deleted };
}

describe('temporary run-media cache', () => {
  test('deletes a share-only file after release', async () => {
    const { fs, deleted } = createFakeFileSystem();
    const cache = createRunMediaCache(fs);
    const item = await cache.register('/cache/run-share/a.jpg', 'share');

    await cache.release(item.id);

    expect(deleted).toEqual(['/cache/run-share/a.jpg']);
  });

  test('keeps a file until editor and share owners have both released it', async () => {
    const { fs, deleted } = createFakeFileSystem();
    const cache = createRunMediaCache(fs);
    const item = await cache.register('/cache/run-share/a.jpg', 'editor');
    await cache.retain(item.id, 'share');

    await cache.release(item.id, 'editor');
    expect(deleted).toEqual([]);

    await cache.release(item.id, 'share');
    expect(deleted).toEqual(['/cache/run-share/a.jpg']);
  });

  test('uses one identity for dot-segment and percent-encoded aliases', async () => {
    const { fs, deleted } = createFakeFileSystem();
    const cache = createRunMediaCache(fs);
    const editorItem = await cache.register('/cache/run-share/./run%20photo.jpg', 'editor');
    const shareItem = await cache.register('/cache/run-share/run photo.jpg', 'share');

    expect(shareItem.id).toBe(editorItem.id);
    await cache.release(editorItem.id, 'editor');
    expect(deleted).toEqual([]);
    await cache.release(shareItem.id, 'share');
    expect(deleted).toEqual(['/cache/run-share/./run%20photo.jpg']);
  });

  test('normalizes Windows file URI aliases case-insensitively', async () => {
    const deleted: string[] = [];
    const fs: RunMediaFileSystem = {
      cacheDirectory: 'file:///C:/Cache',
      list: async () => [],
      delete: async (uri) => {
        deleted.push(uri);
      },
    };
    const cache = createRunMediaCache(fs);
    const first = await cache.register('file:///c:/cache/run-share/run%20photo.jpg', 'editor');
    const alias = await cache.register('FILE:///C:/CACHE/run-share/./run photo.jpg', 'share');

    expect(alias.id).toBe(first.id);
    await cache.release(first.id, 'editor');
    await cache.release(alias.id, 'share');
    expect(deleted).toHaveLength(1);
  });

  test('rejects nested descendants of the run-share directory', async () => {
    const { fs } = createFakeFileSystem();
    const cache = createRunMediaCache(fs);

    await expect(
      cache.register('/cache/run-share/nested/photo.jpg', 'editor'),
    ).rejects.toThrow('managed run-share directory');
  });

  test('keeps failed deletions tracked so release can retry', async () => {
    let deleteAttempts = 0;
    const fs: RunMediaFileSystem = {
      cacheDirectory: '/cache',
      list: async () => [],
      delete: async () => {
        deleteAttempts += 1;
        if (deleteAttempts === 1) throw new Error('device busy');
      },
    };
    const cache = createRunMediaCache(fs);
    const item = await cache.register('/cache/run-share/retry.jpg', 'share');

    await expect(cache.release(item.id)).rejects.toThrow('device busy');
    await expect(cache.release(item.id)).resolves.toBeUndefined();

    expect(deleteAttempts).toBe(2);
  });

  test('rejects re-registration while an old deletion is in flight', async () => {
    let finishDelete!: () => void;
    const deletion = new Promise<void>((resolve) => {
      finishDelete = resolve;
    });
    const fs: RunMediaFileSystem = {
      cacheDirectory: '/cache',
      list: async () => [],
      delete: async () => deletion,
    };
    const cache = createRunMediaCache(fs);
    const item = await cache.register('/cache/run-share/race.jpg', 'share');

    const release = cache.release(item.id);
    await expect(
      cache.register('/cache/run-share/./race.jpg', 'editor'),
    ).rejects.toThrow('being deleted');

    finishDelete();
    await release;
    const replacement = await cache.register('/cache/run-share/race.jpg', 'editor');
    expect(replacement.id).not.toBe(item.id);
  });

  test('deletes abandoned exports older than 24 hours', async () => {
    const now = Date.UTC(2026, 6, 26);
    const { fs, deleted } = createFakeFileSystem([
      { uri: '/cache/run-share/old.jpg', modifiedAt: now - DAY - 1 },
    ]);

    await cleanupAbandonedRunMedia(now, fs);

    expect(deleted).toEqual(['/cache/run-share/old.jpg']);
  });

  test('continues cleaning later stale files after one deletion fails', async () => {
    const now = Date.UTC(2026, 6, 26);
    const attempted: string[] = [];
    const fs: RunMediaFileSystem = {
      cacheDirectory: '/cache',
      list: async () => [
        { uri: '/cache/run-share/fails.jpg', modifiedAt: now - DAY - 1 },
        { uri: '/cache/run-share/deletes.jpg', modifiedAt: now - DAY - 1 },
      ],
      delete: async (uri) => {
        attempted.push(uri);
        if (uri.endsWith('/fails.jpg')) throw new Error('locked');
      },
    };

    await expect(cleanupAbandonedRunMedia(now, fs)).rejects.toThrow(
      'Unable to delete 1 abandoned run-media file',
    );
    expect(attempted).toEqual([
      '/cache/run-share/fails.jpg',
      '/cache/run-share/deletes.jpg',
    ]);
  });

  test('treats an already-missing stale file as successful cleanup', async () => {
    const now = Date.UTC(2026, 6, 26);
    const fs: RunMediaFileSystem = {
      cacheDirectory: '/cache',
      list: async () => [
        { uri: '/cache/run-share/missing.jpg', modifiedAt: now - DAY - 1 },
      ],
      delete: async () => {
        throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
      },
    };

    await expect(cleanupAbandonedRunMedia(now, fs)).resolves.toBeUndefined();
  });

  test('retains exports newer than 24 hours', async () => {
    const now = Date.UTC(2026, 6, 26);
    const { fs, deleted } = createFakeFileSystem([
      { uri: '/cache/run-share/new.jpg', modifiedAt: now - DAY + 1 },
    ]);

    await cleanupAbandonedRunMedia(now, fs);

    expect(deleted).toEqual([]);
  });

  test('never deletes media outside the managed run-share directory', async () => {
    const now = Date.UTC(2026, 6, 26);
    const { fs, deleted } = createFakeFileSystem([
      { uri: '/photos/user-library.jpg', modifiedAt: now - DAY - 1 },
      { uri: '/cache/run-share-elsewhere/lookalike.jpg', modifiedAt: now - DAY - 1 },
      { uri: '/cache/run-share/../outside.jpg', modifiedAt: now - DAY - 1 },
    ]);
    const cache = createRunMediaCache(fs);

    await expect(cache.register('/photos/user-library.jpg', 'editor')).rejects.toThrow(
      'managed run-share directory',
    );
    await cleanupAbandonedRunMedia(now, fs);

    expect(deleted).toEqual([]);
  });
});
