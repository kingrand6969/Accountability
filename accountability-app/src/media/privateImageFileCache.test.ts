import { describe, expect, it, jest } from '@jest/globals';

import {
  createPrivateImageFileCache,
  type PrivateImageFileSystem,
} from './privateImageFileCache';

const SIGNED_URL =
  'https://media.example/avatars/member/dog.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret';

function jpegHeader(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createFakeFileSystem(): PrivateImageFileSystem & {
  files: Map<string, { bytes: number; header: Uint8Array }>;
  directories: Set<string>;
  downloads: string[];
  deletedFiles: string[];
  deletedSessions: string[];
  evictSession(uri: string): void;
  seedFile(uri: string, bytes?: number): void;
} {
  const files = new Map<string, { bytes: number; header: Uint8Array }>();
  const directories = new Set(['file:///cache/private-images']);
  let nextSession = 0;
  let nextPart = 0;
  return {
    cacheRootUri: 'file:///cache/private-images',
    files,
    directories,
    downloads: [],
    deletedFiles: [],
    deletedSessions: [],
    createSessionId: () => `session-${++nextSession}`,
    createPartId: () => `part-${++nextPart}`,
    hashResourceIdentity: async () => 'a'.repeat(64),
    prepareSession: async function (sessionUri) {
      directories.add(this.cacheRootUri);
      directories.add(sessionUri);
    },
    purgeSessions: async function () {
      for (const directory of [...directories]) {
        if (directory !== this.cacheRootUri) {
          directories.delete(directory);
          for (const path of [...files.keys()]) {
            if (path.startsWith(`${directory}/`)) files.delete(path);
          }
        }
      }
    },
    listSessionFiles: async (sessionUri) =>
      [...files.entries()]
        .filter(([uri]) => uri.startsWith(`${sessionUri}/`))
        .map(([uri, value]) => ({ uri, bytes: value.bytes, modifiedAt: null })),
    download: async function (url, destination) {
      const parent = destination.slice(0, destination.lastIndexOf('/'));
      if (!directories.has(parent)) throw new Error('missing parent directory');
      this.downloads.push(url);
      files.set(destination, { bytes: 25_639, header: jpegHeader() });
    },
    inspect: async (uri) => files.get(uri) ?? { bytes: 0, header: new Uint8Array() },
    move: async (from, to) => {
      const value = files.get(from);
      if (!value) throw new Error('missing source');
      files.delete(from);
      files.set(to, value);
    },
    deleteFile: async function (uri) {
      this.deletedFiles.push(uri);
      files.delete(uri);
    },
    deleteSession: async function (uri) {
      this.deletedSessions.push(uri);
      directories.delete(uri);
      for (const path of [...files.keys()]) {
        if (path.startsWith(`${uri}/`)) files.delete(path);
      }
    },
    evictSession(uri) {
      directories.delete(uri);
      for (const path of [...files.keys()]) {
        if (path.startsWith(`${uri}/`)) files.delete(path);
      }
    },
    seedFile(uri, bytes = 100) {
      const directory = uri.slice(0, uri.lastIndexOf('/'));
      directories.add(directory);
      files.set(uri, { bytes, header: jpegHeader() });
    },
  };
}

describe('private image file cache', () => {
  it('downloads a signed image through a unique part and returns an opaque stable file URI', async () => {
    const fs = createFakeFileSystem();
    const cache = createPrivateImageFileCache(fs);

    await expect(cache.resolve(SIGNED_URL)).resolves.toBe(
      `file:///cache/private-images/session-1/${'a'.repeat(64)}.jpg`,
    );

    expect(fs.downloads).toEqual([SIGNED_URL]);
    expect([...fs.files.keys()]).toEqual([
      `file:///cache/private-images/session-1/${'a'.repeat(64)}.jpg`,
    ]);
    expect([...fs.files.keys()][0]).not.toContain('X-Amz');
  });

  it('deduplicates concurrent requests for the same private object', async () => {
    const fs = createFakeFileSystem();
    const pending = deferred<void>();
    fs.download = jest.fn(async (_url: string, destination: string) => {
      await pending.promise;
      fs.files.set(destination, { bytes: 25_639, header: jpegHeader() });
    });
    const cache = createPrivateImageFileCache(fs);

    const first = cache.resolve(SIGNED_URL);
    const second = cache.resolve(
      SIGNED_URL.replace('X-Amz-Signature=secret', 'X-Amz-Signature=renewed'),
    );
    pending.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([
      `file:///cache/private-images/session-1/${'a'.repeat(64)}.jpg`,
      `file:///cache/private-images/session-1/${'a'.repeat(64)}.jpg`,
    ]);
    expect(fs.download).toHaveBeenCalledTimes(1);
  });

  it('redownloads when the operating system evicts a cached file', async () => {
    const fs = createFakeFileSystem();
    fs.download = jest.fn(async (_url: string, destination: string) => {
      fs.files.set(destination, { bytes: 25_639, header: jpegHeader() });
    });
    const cache = createPrivateImageFileCache(fs);

    const firstUri = await cache.resolve(SIGNED_URL);
    fs.files.delete(firstUri);
    await expect(cache.resolve(SIGNED_URL)).resolves.toBe(firstUri);

    expect(fs.download).toHaveBeenCalledTimes(2);
  });

  it('recreates the session directory when the operating system evicts the whole directory', async () => {
    const fs = createFakeFileSystem();
    const cache = createPrivateImageFileCache(fs);
    const fileUri = await cache.resolve(SIGNED_URL);
    const sessionUri = fileUri.slice(0, fileUri.lastIndexOf('/'));

    fs.evictSession(sessionUri);

    await expect(cache.resolve(SIGNED_URL)).resolves.toBe(fileUri);
    expect(fs.directories).toContain(sessionUri);
    expect(fs.downloads).toHaveLength(2);
  });

  it('serializes a fresh-process auth purge before creating the new session', async () => {
    const fs = createFakeFileSystem();
    const staleUri = 'file:///cache/private-images/stale-session/avatar.jpg';
    fs.seedFile(staleUri);
    const purgeGate = deferred<void>();
    const originalPurgeSessions = fs.purgeSessions;
    fs.purgeSessions = jest.fn(async () => {
      await purgeGate.promise;
      await originalPurgeSessions.call(fs);
    });
    const cache = createPrivateImageFileCache(fs);

    cache.clear();
    const resolution = cache.resolve(SIGNED_URL);
    await Promise.resolve();
    await Promise.resolve();
    expect(fs.downloads).toHaveLength(0);

    purgeGate.resolve();
    const winner = await resolution;

    expect(fs.files.has(staleUri)).toBe(false);
    expect(fs.directories.has('file:///cache/private-images/stale-session')).toBe(false);
    expect(fs.files.has(winner)).toBe(true);
  });

  it('enforces deterministic total count and byte bounds without evicting the requested winner', async () => {
    const fs = createFakeFileSystem();
    fs.hashResourceIdentity = async (value) => {
      const marker = value.includes('one.jpg') ? '1' : value.includes('two.jpg') ? '2' : '3';
      return marker.repeat(64);
    };
    fs.download = jest.fn(async (_url: string, destination: string) => {
      const parent = destination.slice(0, destination.lastIndexOf('/'));
      if (!fs.directories.has(parent)) throw new Error('missing parent directory');
      fs.files.set(destination, { bytes: 90, header: jpegHeader() });
    });
    const cache = createPrivateImageFileCache(fs, { maxBytes: 180, maxFiles: 2 });
    const urls = ['one.jpg', 'two.jpg', 'three.jpg'].map(
      (name) =>
        `https://media.example/avatars/${name}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret`,
    );

    const first = await cache.resolve(urls[0]);
    const second = await cache.resolve(urls[1]);
    const winner = await cache.resolve(urls[2]);

    expect(fs.files.has(first)).toBe(false);
    expect(fs.files.has(second)).toBe(true);
    expect(fs.files.has(winner)).toBe(true);
    expect([...fs.files.values()].reduce((total, file) => total + file.bytes, 0)).toBeLessThanOrEqual(180);
  });

  it('re-enforces bounds on a cached hit after external files appear in the session', async () => {
    const fs = createFakeFileSystem();
    fs.download = jest.fn(async (_url: string, destination: string) => {
      fs.files.set(destination, { bytes: 90, header: jpegHeader() });
    });
    const cache = createPrivateImageFileCache(fs, { maxBytes: 180, maxFiles: 2 });
    const winner = await cache.resolve(SIGNED_URL);
    const sessionUri = winner.slice(0, winner.lastIndexOf('/'));
    fs.seedFile(`${sessionUri}/${'b'.repeat(64)}.jpg`, 90);
    fs.seedFile(`${sessionUri}/${'c'.repeat(64)}.jpg`, 90);

    await expect(cache.resolve(SIGNED_URL)).resolves.toBe(winner);

    const finals = [...fs.files.entries()].filter(([uri]) => uri.endsWith('.jpg'));
    expect(finals).toHaveLength(2);
    expect(finals.reduce((total, [, file]) => total + file.bytes, 0)).toBeLessThanOrEqual(180);
    expect(fs.files.has(winner)).toBe(true);
  });

  it('never evicts an active part or the in-flight winner while enforcing bounds', async () => {
    const fs = createFakeFileSystem();
    const firstDownload = deferred<void>();
    fs.hashResourceIdentity = async (value) =>
      (value.includes('one.jpg') ? '1' : '2').repeat(64);
    fs.download = jest.fn(async (url: string, destination: string) => {
      fs.files.set(destination, { bytes: 90, header: jpegHeader() });
      if (url.includes('one.jpg')) await firstDownload.promise;
    });
    const cache = createPrivateImageFileCache(fs, { maxBytes: 90, maxFiles: 1 });
    const firstUrl =
      'https://media.example/avatars/one.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret';
    const secondUrl = firstUrl.replace('one.jpg', 'two.jpg');

    const firstResolution = cache.resolve(firstUrl);
    for (let index = 0; index < 20 && ![...fs.files.keys()].some((uri) => uri.endsWith('.part')); index += 1) {
      await Promise.resolve();
    }
    const activePart = [...fs.files.keys()].find((uri) => uri.endsWith('.part'))!;
    const secondWinner = await cache.resolve(secondUrl);

    expect(fs.files.has(activePart)).toBe(true);
    expect(fs.deletedFiles).not.toContain(activePart);
    expect(fs.files.has(secondWinner)).toBe(true);

    firstDownload.resolve();
    const firstWinner = await firstResolution;
    expect(fs.files.has(firstWinner)).toBe(true);
    expect(fs.deletedFiles).not.toContain(activePart);
    expect([...fs.files.keys()].filter((uri) => uri.endsWith('.jpg'))).toHaveLength(1);
  });

  it('rejects oversized and non-image downloads, removes parts, and retries only once', async () => {
    const fs = createFakeFileSystem();
    fs.download = jest.fn(async (_url: string, destination: string) => {
      fs.files.set(destination, {
        bytes: 21 * 1024 * 1024,
        header: Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c]),
      });
    });
    const cache = createPrivateImageFileCache(fs);

    await expect(cache.resolve(SIGNED_URL)).rejects.toThrow('Could not open this private image.');
    expect(fs.download).toHaveBeenCalledTimes(2);
    expect(fs.deletedFiles).toHaveLength(2);
    expect(fs.files).toEqual(new Map());
  });

  it('accepts PNG and WebP magic and chooses the matching local extension', async () => {
    const formats = [
      {
        extension: 'png',
        header: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
      {
        extension: 'webp',
        header: Uint8Array.from([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      },
    ];

    for (const { extension, header } of formats) {
      const fs = createFakeFileSystem();
      fs.download = jest.fn(async (_url: string, destination: string) => {
        fs.files.set(destination, { bytes: 100, header });
      });
      const cache = createPrivateImageFileCache(fs);
      await expect(cache.resolve(SIGNED_URL)).resolves.toMatch(
        new RegExp(`\\.${extension}$`),
      );
    }
  });

  it('fails closed and removes a completed file when auth changes in flight', async () => {
    const fs = createFakeFileSystem();
    const pending = deferred<void>();
    fs.download = jest.fn(async (_url: string, destination: string) => {
      await pending.promise;
      fs.files.set(destination, { bytes: 25_639, header: jpegHeader() });
    });
    const cache = createPrivateImageFileCache(fs);

    const resolution = cache.resolve(SIGNED_URL);
    const observedResolution = resolution.catch((error: unknown) => error);
    await Promise.resolve();
    await Promise.resolve();
    cache.clear();
    pending.resolve();

    await expect(observedResolution).resolves.toThrow('Private image access changed.');
    expect(fs.deletedSessions).toContain('file:///cache/private-images/session-1');
    expect(fs.files).toEqual(new Map());
  });

  it('does not publish a completed file when auth clears during the atomic move', async () => {
    const fs = createFakeFileSystem();
    const originalMove = fs.move;
    const cache = createPrivateImageFileCache(fs);
    fs.move = async (from, to) => {
      await originalMove(from, to);
      cache.clear();
    };

    await expect(cache.resolve(SIGNED_URL)).rejects.toThrow('Private image access changed.');
    expect(fs.files).toEqual(new Map());
  });

  it('serializes session preparation so an old sweep cannot delete the new session', async () => {
    const fs = createFakeFileSystem();
    const firstPrepare = deferred<void>();
    const prepared: string[] = [];
    const originalPrepareSession = fs.prepareSession;
    fs.prepareSession = jest.fn(async (uri: string) => {
      prepared.push(uri);
      if (prepared.length === 1) await firstPrepare.promise;
      await originalPrepareSession.call(fs, uri);
    });
    const cache = createPrivateImageFileCache(fs);

    const oldResolution = cache.resolve(SIGNED_URL);
    const observedOldResolution = oldResolution.catch((error: unknown) => error);
    for (let index = 0; index < 10 && prepared.length === 0; index += 1) {
      await Promise.resolve();
    }
    expect(prepared).toEqual(['file:///cache/private-images/session-1']);
    cache.clear();
    const newResolution = cache.resolve(SIGNED_URL);
    await Promise.resolve();
    await Promise.resolve();
    expect(prepared).toEqual(['file:///cache/private-images/session-1']);

    firstPrepare.resolve();
    await expect(observedOldResolution).resolves.toThrow('Private image access changed.');
    await expect(newResolution).resolves.toBe(
      `file:///cache/private-images/session-2/${'a'.repeat(64)}.jpg`,
    );
    expect(prepared).toEqual([
      'file:///cache/private-images/session-1',
      'file:///cache/private-images/session-2',
    ]);
  });
});
