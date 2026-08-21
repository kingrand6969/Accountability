import { describe, expect, it, jest } from '@jest/globals';

import {
  createPrivateImageFileCache,
  createPrivateImageDiagnosticReporter,
  isAwsSignedImageUrl,
  type PrivateImageFileSystem,
  privateImageDownloadExceedsLimit,
  runPrivateImageLegacyDownload,
} from './privateImageFileCache';

const SIGNED_URL =
  'https://media.example/avatars/member/dog.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret';
const PRIVATE_REF = 'r2://avatars/00000000-0000-4000-8000-000000000000/dog.jpg';
const SUPABASE_SIGNED_URL = 'https://project.supabase.co/storage/v1/object/sign/progress-photos/member/photo.jpg?token=secret';

it('accepts canonical Supabase Storage signed image URLs without accepting arbitrary HTTPS', () => {
  expect(isAwsSignedImageUrl(SUPABASE_SIGNED_URL)).toBe(true);
  expect(isAwsSignedImageUrl('https://project.supabase.co/storage/v1/object/public/progress-photos/photo.jpg')).toBe(false);
});

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
    downloadLegacy: async function (url, destination) {
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
  it('emits sanitized diagnostics only for preview builds', () => {
    const warn = jest.fn();
    const event = {
      stage: 'prepare',
      attempt: 1,
      outcome: 'success',
      duration: 'under-100ms',
    } as const;

    createPrivateImageDiagnosticReporter(false, warn)(event);
    expect(warn).not.toHaveBeenCalled();

    createPrivateImageDiagnosticReporter(true, warn)(event);
    expect(warn).toHaveBeenCalledWith('[private-image-cache]', event);
  });

  it('does not treat an unknown expected length as oversized', () => {
    expect(privateImageDownloadExceedsLimit(25_639, -1, 1024 * 1024)).toBe(false);
    expect(privateImageDownloadExceedsLimit(1024 * 1024 + 1, -1, 1024 * 1024)).toBe(true);
    expect(privateImageDownloadExceedsLimit(0, 1024 * 1024 + 1, 1024 * 1024)).toBe(true);
  });

  it('rejects a non-2xx result from the real legacy adapter helper', async () => {
    const controller = new AbortController();
    const task = {
      cancelAsync: jest.fn(async () => undefined),
      downloadAsync: jest.fn(async () => ({ status: 503 })),
    };

    await expect(runPrivateImageLegacyDownload(() => task, controller.signal, 1024)).rejects.toThrow();
    expect(task.cancelAsync).not.toHaveBeenCalled();
  });

  it('allows unknown legacy length and cancels oversized legacy progress fail-closed', async () => {
    const controller = new AbortController();
    let progress!: (value: { totalBytesExpectedToWrite: number; totalBytesWritten: number }) => void;
    const task = {
      cancelAsync: jest.fn(async () => undefined),
      downloadAsync: jest.fn(async () => {
        progress({ totalBytesExpectedToWrite: -1, totalBytesWritten: 100 });
        progress({ totalBytesExpectedToWrite: -1, totalBytesWritten: 1025 });
        return { status: 200 };
      }),
    };

    await expect(runPrivateImageLegacyDownload(
      (callback) => {
        progress = callback;
        return task;
      },
      controller.signal,
      1024,
    )).rejects.toThrow();
    expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  });

  it('fails a legacy adapter result closed after external abort even if 2xx arrives', async () => {
    const controller = new AbortController();
    const task = {
      cancelAsync: jest.fn(async () => undefined),
      downloadAsync: jest.fn(async () => {
        controller.abort();
        return { status: 200 };
      }),
    };

    await expect(runPrivateImageLegacyDownload(() => task, controller.signal, 1024)).rejects.toThrow();
    expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  });

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

  it('downloads a raw image ref through the proxy once and publishes it through the same cache pipeline', async () => {
    const fs = createFakeFileSystem();
    const proxyDownload = jest.fn(async (_ref: string, destination: string) => {
      fs.files.set(destination, { bytes: 25_639, header: jpegHeader() });
    });
    const cache = createPrivateImageFileCache(fs, {}, undefined, proxyDownload);

    const first = cache.resolvePrivateRef(PRIVATE_REF);
    const second = cache.resolvePrivateRef(PRIVATE_REF);

    await expect(Promise.all([first, second])).resolves.toEqual([
      `file:///cache/private-images/session-1/${'a'.repeat(64)}.jpg`,
      `file:///cache/private-images/session-1/${'a'.repeat(64)}.jpg`,
    ]);
    expect(proxyDownload).toHaveBeenCalledTimes(1);
    expect(fs.downloads).toEqual([]);
  });

  it('does not publish late proxy bytes after the auth epoch changes', async () => {
    const fs = createFakeFileSystem();
    const pending = deferred<void>();
    const started = deferred<void>();
    const proxyDownload = jest.fn(async (_ref: string, destination: string) => {
      started.resolve();
      await pending.promise;
      fs.files.set(destination, { bytes: 25_639, header: jpegHeader() });
    });
    const cache = createPrivateImageFileCache(fs, {}, undefined, proxyDownload);
    const request = cache.resolvePrivateRef(PRIVATE_REF);
    await started.promise;

    cache.clear();
    pending.resolve();

    await expect(request).rejects.toThrow('Private image access changed.');
    expect([...fs.files.keys()]).toEqual([]);
    expect(proxyDownload).toHaveBeenCalledTimes(1);
  });

  it('uses the legacy downloader on a fresh unique part after the primary downloader fails', async () => {
    const fs = createFakeFileSystem();
    let primaryDestination = '';
    fs.download = jest.fn(async (_url: string, destination: string) => {
      primaryDestination = destination;
      throw new Error('primary transport unavailable');
    });
    const legacyDestinations: string[] = [];
    (fs as any).downloadLegacy = jest.fn(async (_url: string, destination: string) => {
      legacyDestinations.push(destination);
      fs.files.set(destination, { bytes: 25_639, header: jpegHeader() });
    });
    const cache = createPrivateImageFileCache(fs);

    const winner = await cache.resolve(SIGNED_URL);

    expect(fs.download).toHaveBeenCalledTimes(1);
    expect((fs as any).downloadLegacy).toHaveBeenCalledTimes(1);
    expect(primaryDestination).toMatch(/\.part$/);
    expect(legacyDestinations[0]).toMatch(/\.part$/);
    expect(legacyDestinations[0]).not.toBe(primaryDestination);
    expect(winner).toMatch(/\.jpg$/);
  });

  it('aborts a stalled primary download after 15 seconds before starting legacy fallback', async () => {
    jest.useFakeTimers();
    try {
      const fs = createFakeFileSystem();
      let primarySignal: AbortSignal | undefined;
      fs.download = jest.fn((...args: any[]) => {
        primarySignal = args[3] as AbortSignal | undefined;
        return new Promise<void>((_resolve, reject) => {
          primarySignal?.addEventListener('abort', () => reject(new Error('primary aborted')));
        });
      });
      fs.downloadLegacy = jest.fn(async (_url: string, destination: string) => {
        fs.files.set(destination, { bytes: 25_639, header: jpegHeader() });
      });
      const cache = createPrivateImageFileCache(fs);

      const resolution = cache.resolve(SIGNED_URL);
      for (let index = 0; index < 20 && !primarySignal; index += 1) await Promise.resolve();

      expect(primarySignal).toBeDefined();
      expect(primarySignal?.aborted).toBe(false);
      expect(fs.downloadLegacy).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(14_999);
      expect(primarySignal?.aborted).toBe(false);
      expect(fs.downloadLegacy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      await expect(resolution).resolves.toMatch(/\.jpg$/);
      expect(primarySignal?.aborted).toBe(true);
      expect(fs.downloadLegacy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports both downloader failures without exposing signed URLs, paths, or raw errors', async () => {
    const fs = createFakeFileSystem();
    fs.download = jest.fn(async () => {
      throw new Error(`TLS failed for ${SIGNED_URL} at file:///cache/private-images/leak.part`);
    });
    fs.downloadLegacy = jest.fn(async () => {
      throw new Error(`legacy secret X-Amz-Signature=raw-error-message status 503`);
    });
    const events: unknown[] = [];
    const cache = (createPrivateImageFileCache as any)(
      fs,
      {},
      (event: unknown) => events.push(event),
    );

    await expect(cache.resolve(SIGNED_URL)).rejects.toThrow('Could not open this private image.');

    expect(fs.download).toHaveBeenCalledTimes(1);
    expect(fs.downloadLegacy).toHaveBeenCalledTimes(1);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'primary-download', outcome: 'failure' }),
      expect.objectContaining({ stage: 'legacy-download', outcome: 'failure', httpStatus: 503 }),
      expect.objectContaining({ stage: 'final', outcome: 'failure' }),
    ]));
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('media.example');
    expect(serialized).not.toContain('X-Amz');
    expect(serialized).not.toContain('file:///');
    expect(serialized).not.toContain('raw-error-message');
    expect(serialized).not.toContain('TLS failed');
  });

  it('abandons a legacy part after bounded cancellation and removes a late write when it settles', async () => {
    jest.useFakeTimers();
    try {
      const fs = createFakeFileSystem();
      fs.download = jest.fn(async () => {
        throw new Error('primary unavailable');
      });
      const lateLegacy = deferred<void>();
      let firstLegacySignal: AbortSignal | undefined;
      let firstLegacyDestination = '';
      let legacyCalls = 0;
      fs.downloadLegacy = jest.fn((...args: any[]) => {
        legacyCalls += 1;
        const destination = args[1] as string;
        const signal = args[3] as AbortSignal | undefined;
        if (legacyCalls > 1) return Promise.reject(new Error('legacy retry unavailable'));
        firstLegacySignal = signal;
        firstLegacyDestination = destination;
        return lateLegacy.promise.then(() => {
          fs.files.set(destination, { bytes: 25_639, header: jpegHeader() });
        });
      });
      const cache = createPrivateImageFileCache(fs);

      const resolution = cache.resolve(SIGNED_URL);
      const observed = resolution.catch((error: unknown) => error);
      for (let index = 0; index < 30 && !firstLegacyDestination; index += 1) await Promise.resolve();

      expect(firstLegacySignal).toBeDefined();
      await jest.advanceTimersByTimeAsync(15_000);
      expect(firstLegacySignal?.aborted).toBe(true);
      await jest.advanceTimersByTimeAsync(1_000);
      await expect(observed).resolves.toThrow('Could not open this private image.');

      lateLegacy.resolve();
      for (let index = 0; index < 20 && fs.files.has(firstLegacyDestination); index += 1) {
        await Promise.resolve();
      }
      expect(fs.files.has(firstLegacyDestination)).toBe(false);
      expect(fs.deletedFiles).toContain(firstLegacyDestination);
    } finally {
      jest.useRealTimers();
    }
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

  it('rejects oversized and non-image downloads without retrying invalid bytes', async () => {
    const fs = createFakeFileSystem();
    fs.download = jest.fn(async (_url: string, destination: string) => {
      fs.files.set(destination, {
        bytes: 21 * 1024 * 1024,
        header: Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c]),
      });
    });
    fs.downloadLegacy = jest.fn(fs.downloadLegacy);
    const cache = createPrivateImageFileCache(fs);

    await expect(cache.resolve(SIGNED_URL)).rejects.toThrow('Could not open this private image.');
    expect(fs.download).toHaveBeenCalledTimes(1);
    expect(fs.downloadLegacy).not.toHaveBeenCalled();
    expect(fs.deletedFiles).toHaveLength(1);
    expect(fs.files).toEqual(new Map());
  });

  it('does not retry a primary oversize policy failure through the legacy downloader', async () => {
    const fs = createFakeFileSystem();
    fs.download = jest.fn(async (_url: string, destination: string) => {
      fs.files.set(destination, { bytes: 21 * 1024 * 1024, header: jpegHeader() });
      throw { privateImageFailure: 'too-large' };
    });
    fs.downloadLegacy = jest.fn(fs.downloadLegacy);
    const cache = createPrivateImageFileCache(fs);

    await expect(cache.resolve(SIGNED_URL)).rejects.toThrow('Could not open this private image.');
    expect(fs.download).toHaveBeenCalledTimes(1);
    expect(fs.downloadLegacy).not.toHaveBeenCalled();
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
    const events: any[] = [];
    const cache = createPrivateImageFileCache(fs, {}, (event) => events.push(event));
    fs.move = async (from, to) => {
      await originalMove(from, to);
      cache.clear();
    };

    await expect(cache.resolve(SIGNED_URL)).rejects.toThrow('Private image access changed.');
    expect(fs.files).toEqual(new Map());
    expect(events).toContainEqual(expect.objectContaining({
      stage: 'publish',
      outcome: 'failure',
      category: 'auth-epoch',
    }));
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
