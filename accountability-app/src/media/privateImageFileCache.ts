import * as Crypto from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

export const PRIVATE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const PRIVATE_IMAGE_CACHE_MAX_BYTES = 128 * 1024 * 1024;
export const PRIVATE_IMAGE_CACHE_MAX_FILES = 64;

type FileInspection = {
  bytes: number;
  header: Uint8Array;
};

type CacheFileEntry = {
  uri: string;
  bytes: number;
  modifiedAt: number | null;
};

type PrivateImageCacheLimits = {
  maxBytes?: number;
  maxFiles?: number;
};

export interface PrivateImageFileSystem {
  readonly cacheRootUri: string;
  createSessionId(): string;
  createPartId(): string;
  hashResourceIdentity(value: string): Promise<string>;
  prepareSession(sessionUri: string): Promise<void>;
  purgeSessions(): Promise<void>;
  listSessionFiles(sessionUri: string): Promise<readonly CacheFileEntry[]>;
  download(url: string, destinationUri: string, maxBytes: number): Promise<void>;
  inspect(uri: string): Promise<FileInspection>;
  move(fromUri: string, toUri: string): Promise<void>;
  deleteFile(uri: string): Promise<void>;
  deleteSession(uri: string): Promise<void>;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function canonicalPrivateImageIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.searchParams.has('X-Amz-Algorithm')) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function isAwsSignedImageUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && canonicalPrivateImageIdentity(value) !== null;
}

function extensionForImageHeader(header: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'jpg';
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

function isValidPrivateImage({ bytes, header }: FileInspection): boolean {
  return (
    bytes > 0 &&
    bytes <= PRIVATE_IMAGE_MAX_BYTES &&
    extensionForImageHeader(header) !== null
  );
}

const expoFileSystem: PrivateImageFileSystem = {
  get cacheRootUri() {
    return `${withoutTrailingSlash(Paths.cache.uri)}/private-images`;
  },
  createSessionId: () => Crypto.randomUUID(),
  createPartId: () => Crypto.randomUUID(),
  hashResourceIdentity: (value) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  async prepareSession(sessionUri) {
    const root = new Directory(this.cacheRootUri);
    root.create({ idempotent: true, intermediates: true });
    new Directory(sessionUri).create({ idempotent: true, intermediates: true });
  },
  async purgeSessions() {
    const root = new Directory(this.cacheRootUri);
    root.create({ idempotent: true, intermediates: true });
    for (const entry of root.list()) {
      try {
        entry.delete();
      } catch {
        // A concurrent operating-system eviction may already have removed it.
      }
    }
  },
  async listSessionFiles(sessionUri) {
    const directory = new Directory(sessionUri);
    if (!directory.exists) return [];
    return directory
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => ({ uri: file.uri, bytes: file.size, modifiedAt: file.modificationTime }));
  },
  async download(url, destinationUri, maxBytes) {
    const controller = new AbortController();
    await File.downloadFileAsync(url, new File(destinationUri), {
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (bytesWritten > maxBytes || totalBytes > maxBytes) controller.abort();
      },
    });
  },
  async inspect(uri) {
    const file = new File(uri);
    if (!file.exists) return { bytes: 0, header: new Uint8Array() };
    const handle = file.open(FileMode.ReadOnly);
    try {
      return { bytes: file.size, header: handle.readBytes(12) };
    } finally {
      handle.close();
    }
  },
  async move(fromUri, toUri) {
    await new File(fromUri).move(new File(toUri));
  },
  async deleteFile(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  async deleteSession(uri) {
    const directory = new Directory(uri);
    if (directory.exists) directory.delete();
  },
};

export function createPrivateImageFileCache(
  fs: PrivateImageFileSystem = expoFileSystem,
  limits: PrivateImageCacheLimits = {},
) {
  const maxBytes = limits.maxBytes ?? PRIVATE_IMAGE_CACHE_MAX_BYTES;
  const maxFiles = limits.maxFiles ?? PRIVATE_IMAGE_CACHE_MAX_FILES;
  let epoch = 0;
  let sessionId: string | null = null;
  const resolved = new Map<string, string>();
  const inFlight = new Map<string, Promise<string>>();
  const activeParts = new Set<string>();
  let maintenanceTail = Promise.resolve();
  let latestPurge: Promise<void> | null = null;

  const sessionUri = () => {
    sessionId ??= fs.createSessionId();
    return `${withoutTrailingSlash(fs.cacheRootUri)}/${sessionId}`;
  };

  const enqueueMaintenance = (operation: () => Promise<void>) => {
    const pending = maintenanceTail.catch(() => undefined).then(operation);
    maintenanceTail = pending.catch(() => undefined);
    return pending;
  };

  const schedulePurge = (sessionToDelete: string | null = null) => {
    const pending = enqueueMaintenance(async () => {
      if (sessionToDelete) {
        await fs.deleteSession(sessionToDelete).catch(() => undefined);
      }
      await fs.purgeSessions();
    });
    latestPurge = pending;
    return pending;
  };

  const ensureSessionBeforeDownload = async (uri: string, requestEpoch: number) => {
    const purge = latestPurge ?? schedulePurge();
    await purge;
    if (requestEpoch !== epoch) throw new Error('Private image access changed.');
    await enqueueMaintenance(() => fs.prepareSession(uri));
    if (requestEpoch !== epoch) throw new Error('Private image access changed.');
  };

  async function enforceLimits(
    targetSessionUri: string,
    winnerUri: string,
    requestEpoch: number,
  ): Promise<void> {
    await enqueueMaintenance(async () => {
      if (requestEpoch !== epoch) return;
      const entries = [...(await fs.listSessionFiles(targetSessionUri))];
      if (requestEpoch !== epoch) return;
      const protectedUris = new Set(activeParts);
      protectedUris.add(winnerUri);
      const protectedKeys = new Set(inFlight.keys());

      for (const entry of entries.filter((candidate) => candidate.uri.endsWith('.part'))) {
        if (!protectedUris.has(entry.uri)) {
          await fs.deleteFile(entry.uri).catch(() => undefined);
        }
      }

      const finalEntries = entries.filter((entry) => !entry.uri.endsWith('.part'));
      let totalBytes = finalEntries.reduce((total, entry) => total + entry.bytes, 0);
      let totalFiles = finalEntries.length;
      const candidates = finalEntries
        .filter((entry) => {
          if (protectedUris.has(entry.uri)) return false;
          const name = entry.uri.slice(entry.uri.lastIndexOf('/') + 1);
          return ![...protectedKeys].some((key) => name.startsWith(`${key}.`));
        })
        .sort(
          (left, right) =>
            (left.modifiedAt ?? 0) - (right.modifiedAt ?? 0) ||
            left.uri.localeCompare(right.uri),
        );

      for (const entry of candidates) {
        if (totalFiles <= maxFiles && totalBytes <= maxBytes) break;
        await fs.deleteFile(entry.uri).catch(() => undefined);
        totalFiles -= 1;
        totalBytes -= entry.bytes;
        for (const [key, uri] of resolved) {
          if (uri === entry.uri) resolved.delete(key);
        }
      }
    });
  }

  async function attempt(
    url: string,
    key: string,
    targetSessionUri: string,
    requestEpoch: number,
  ): Promise<string> {
    const partUri = `${targetSessionUri}/${key}-${fs.createPartId()}.part`;
    activeParts.add(partUri);
    let finalUri: string | null = null;
    try {
      await ensureSessionBeforeDownload(targetSessionUri, requestEpoch);
      await fs.download(url, partUri, PRIVATE_IMAGE_MAX_BYTES);
      if (requestEpoch !== epoch) throw new Error('Private image access changed.');

      const { bytes, header } = await fs.inspect(partUri);
      const extension = extensionForImageHeader(header);
      if (!isValidPrivateImage({ bytes, header }) || !extension) {
        throw new Error('Could not open this private image.');
      }

      finalUri = `${targetSessionUri}/${key}.${extension}`;
      await fs.move(partUri, finalUri);
      if (requestEpoch !== epoch) {
        await fs.deleteFile(finalUri).catch(() => undefined);
        throw new Error('Private image access changed.');
      }
      return finalUri;
    } catch (error) {
      await fs.deleteFile(partUri).catch(() => undefined);
      if (requestEpoch !== epoch) {
        if (finalUri) await fs.deleteFile(finalUri).catch(() => undefined);
        throw new Error('Private image access changed.');
      }
      throw error;
    } finally {
      activeParts.delete(partUri);
    }
  }

  async function resolve(url: string): Promise<string> {
    const requestEpoch = epoch;
    const identity = canonicalPrivateImageIdentity(url);
    if (!identity) throw new Error('Expected an AWS-signed private image URL.');
    const key = await fs.hashResourceIdentity(identity);
    if (requestEpoch !== epoch) throw new Error('Private image access changed.');
    const cached = resolved.get(key);
    if (cached) {
      try {
        const inspection = await fs.inspect(cached);
        if (requestEpoch !== epoch) throw new Error('Private image access changed.');
        if (isValidPrivateImage(inspection)) {
          const cachedSessionUri = cached.slice(0, cached.lastIndexOf('/'));
          await enforceLimits(cachedSessionUri, cached, requestEpoch).catch(() => undefined);
          if (requestEpoch !== epoch) throw new Error('Private image access changed.');
          return cached;
        }
      } catch (error) {
        if (requestEpoch !== epoch) throw error;
      }
      resolved.delete(key);
      await fs.deleteFile(cached).catch(() => undefined);
    }
    const existingRequest = inFlight.get(key);
    if (existingRequest) return existingRequest;

    const targetSessionUri = sessionUri();
    const request = (async () => {
      let lastError: unknown;
      for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
        try {
          const fileUri = await attempt(url, key, targetSessionUri, requestEpoch);
          if (requestEpoch !== epoch) {
            await fs.deleteFile(fileUri).catch(() => undefined);
            throw new Error('Private image access changed.');
          }
          resolved.set(key, fileUri);
          await enforceLimits(targetSessionUri, fileUri, requestEpoch).catch(() => undefined);
          return fileUri;
        } catch (error) {
          if (requestEpoch !== epoch) throw error;
          lastError = error;
        }
      }
      throw new Error('Could not open this private image.', { cause: lastError });
    })();
    inFlight.set(key, request);
    try {
      return await request;
    } finally {
      if (inFlight.get(key) === request) inFlight.delete(key);
    }
  }

  function clear(): void {
    const oldSessionUri = sessionId ? sessionUri() : null;
    epoch += 1;
    sessionId = null;
    resolved.clear();
    inFlight.clear();
    activeParts.clear();
    schedulePurge(oldSessionUri);
  }

  return { clear, resolve };
}

const privateImageFileCache = createPrivateImageFileCache();

export const cachePrivateImageUrl = privateImageFileCache.resolve;
export const clearPrivateImageFileCache = privateImageFileCache.clear;
