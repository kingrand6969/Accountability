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

  test('deletes abandoned exports older than 24 hours', async () => {
    const now = Date.UTC(2026, 6, 26);
    const { fs, deleted } = createFakeFileSystem([
      { uri: '/cache/run-share/old.jpg', modifiedAt: now - DAY - 1 },
    ]);

    await cleanupAbandonedRunMedia(now, fs);

    expect(deleted).toEqual(['/cache/run-share/old.jpg']);
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
