import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import { downloadPrivateImageRef, isPrivateImageRef } from './privateImageByteProxy';

export const PRIVATE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const PRIVATE_IMAGE_CACHE_MAX_BYTES = 128 * 1024 * 1024;
export const PRIVATE_IMAGE_CACHE_MAX_FILES = 64;
export const PRIVATE_IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;
const PRIVATE_IMAGE_DOWNLOAD_DRAIN_MS = 1_000;

class PrivateImageDownloadTimeoutError extends Error {}
class PrivateImageTooLargeError extends Error {
  readonly privateImageFailure = 'too-large' as const;
}

function isPrivateImageTooLargeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'privateImageFailure' in error &&
    error.privateImageFailure === 'too-large'
  );
}

export function privateImageDownloadExceedsLimit(
  written: number,
  expected: number,
  maxBytes: number,
): boolean {
  return written > maxBytes || (expected >= 0 && expected > maxBytes);
}

type LegacyDownloadProgress = {
  totalBytesExpectedToWrite: number;
  totalBytesWritten: number;
};

type LegacyDownloadTask = {
  cancelAsync(): Promise<void>;
  downloadAsync(): Promise<{ status: number } | null | undefined>;
};

export async function runPrivateImageLegacyDownload(
  createTask: (progress: (value: LegacyDownloadProgress) => void) => LegacyDownloadTask,
  signal: AbortSignal,
  maxBytes: number,
): Promise<void> {
  let oversized = false;
  let cancelled = signal.aborted;
  let task!: LegacyDownloadTask;
  const progress = ({ totalBytesExpectedToWrite, totalBytesWritten }: LegacyDownloadProgress) => {
    if (
      !oversized &&
      privateImageDownloadExceedsLimit(
        totalBytesWritten,
        totalBytesExpectedToWrite,
        maxBytes,
      )
    ) {
      oversized = true;
      void task.cancelAsync().catch(() => undefined);
    }
  };
  task = createTask(progress);
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    void task.cancelAsync().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  let result: { status: number } | null | undefined;
  try {
    if (cancelled) void task.cancelAsync().catch(() => undefined);
    result = await task.downloadAsync();
  } finally {
    signal.removeEventListener('abort', cancel);
  }
  if (oversized) throw new PrivateImageTooLargeError();
  if (cancelled) throw new PrivateImageDownloadTimeoutError();
  if (!result) throw new Error('Private image download was cancelled.');
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Private image download failed with status ${result.status}.`);
  }
}

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

type PrivateImageDiagnosticStage =
  | 'prepare'
  | 'primary-download'
  | 'proxy-download'
  | 'legacy-download'
  | 'inspect'
  | 'move'
  | 'publish'
  | 'final';

type PrivateImageDiagnosticEvent = {
  stage: PrivateImageDiagnosticStage;
  attempt: 1 | 2;
  outcome: 'success' | 'failure';
  category?: 'timeout' | 'too-large' | 'http' | 'network' | 'filesystem' | 'invalid-bytes' | 'auth-epoch' | 'unknown';
  httpStatus?: number;
  duration?: 'under-100ms' | 'under-1s' | 'under-5s' | 'under-15s' | '15s-or-more';
  bytes?: 'empty' | 'under-64k' | 'under-1m' | 'under-5m' | 'under-20m' | 'over-limit';
  magic?: 'jpeg' | 'png' | 'webp' | 'unknown';
};

type PrivateImageDiagnosticReporter = (event: PrivateImageDiagnosticEvent) => void;

export function createPrivateImageDiagnosticReporter(
  preview: boolean,
  warn: (label: string, event: PrivateImageDiagnosticEvent) => void = console.warn,
): PrivateImageDiagnosticReporter {
  if (!preview) return () => undefined;
  return (event) => warn('[private-image-cache]', event);
}

const previewDiagnosticReporter = createPrivateImageDiagnosticReporter(
  Constants.expoConfig?.extra?.appVariant === 'preview',
);

function durationBucket(startedAt: number): NonNullable<PrivateImageDiagnosticEvent['duration']> {
  const duration = Date.now() - startedAt;
  if (duration < 100) return 'under-100ms';
  if (duration < 1_000) return 'under-1s';
  if (duration < 5_000) return 'under-5s';
  if (duration < 15_000) return 'under-15s';
  return '15s-or-more';
}

function byteBucket(bytes: number): NonNullable<PrivateImageDiagnosticEvent['bytes']> {
  if (bytes <= 0) return 'empty';
  if (bytes < 64 * 1024) return 'under-64k';
  if (bytes < 1024 * 1024) return 'under-1m';
  if (bytes < 5 * 1024 * 1024) return 'under-5m';
  if (bytes <= PRIVATE_IMAGE_MAX_BYTES) return 'under-20m';
  return 'over-limit';
}

function httpStatusFromError(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const match = error.message.match(/\bstatus(?:\s+code)?\s*:?\s*([1-5]\d{2})\b/i);
  const status = match ? Number(match[1]) : undefined;
  return status && status >= 100 && status <= 599 ? status : undefined;
}

function downloadFailureDiagnostic(
  error: unknown,
  timedOut = false,
): Pick<PrivateImageDiagnosticEvent, 'category' | 'httpStatus'> {
  if (timedOut) return { category: 'timeout' };
  if (isPrivateImageTooLargeError(error)) return { category: 'too-large' };
  const httpStatus = httpStatusFromError(error);
  return httpStatus ? { category: 'http', httpStatus } : { category: 'network' };
}

export interface PrivateImageFileSystem {
  readonly cacheRootUri: string;
  createSessionId(): string;
  createPartId(): string;
  hashResourceIdentity(value: string): Promise<string>;
  prepareSession(sessionUri: string): Promise<void>;
  purgeSessions(): Promise<void>;
  listSessionFiles(sessionUri: string): Promise<readonly CacheFileEntry[]>;
  download(url: string, destinationUri: string, maxBytes: number, signal: AbortSignal): Promise<void>;
  downloadLegacy(
    url: string,
    destinationUri: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<void>;
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
  async download(url, destinationUri, maxBytes, signal) {
    const controller = new AbortController();
    let oversized = false;
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      await File.downloadFileAsync(url, new File(destinationUri), {
        signal: controller.signal,
        onProgress: ({ bytesWritten, totalBytes }) => {
          if (privateImageDownloadExceedsLimit(bytesWritten, totalBytes, maxBytes)) {
            oversized = true;
            controller.abort();
          }
        },
      });
    } catch (error) {
      if (oversized) throw new PrivateImageTooLargeError();
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  },
  async downloadLegacy(url, destinationUri, maxBytes, signal) {
    await runPrivateImageLegacyDownload(
      (progress) => LegacyFileSystem.createDownloadResumable(url, destinationUri, {}, progress),
      signal,
      maxBytes,
    );
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
  report: PrivateImageDiagnosticReporter = previewDiagnosticReporter,
  proxyDownload: (
    ref: string,
    destinationUri: string,
    maxBytes: number,
    signal: AbortSignal,
  ) => Promise<void> = downloadPrivateImageRef,
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

  async function runDownloadWithTimeout(
    operation: (signal: AbortSignal) => Promise<void>,
    cleanupLateWrite: () => Promise<void>,
  ): Promise<void> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timedOut = new Promise<'timeout'>((resolveTimeout) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolveTimeout('timeout');
      }, PRIVATE_IMAGE_DOWNLOAD_TIMEOUT_MS);
    });
    const pending = Promise.resolve().then(() => operation(controller.signal));
    const observed = pending.then(
      () => ({ outcome: 'success' as const }),
      (error: unknown) => ({ outcome: 'failure' as const, error }),
    );
    const first = await Promise.race([observed, timedOut]);
    if (timeout) clearTimeout(timeout);
    if (first !== 'timeout') {
      if (first.outcome === 'failure') throw first.error;
      return;
    }

    let drainTimer: ReturnType<typeof setTimeout> | null = null;
    const drained = await Promise.race([
      observed.then(() => true),
      new Promise<false>((resolveDrain) => {
        drainTimer = setTimeout(() => resolveDrain(false), PRIVATE_IMAGE_DOWNLOAD_DRAIN_MS);
      }),
    ]);
    if (drainTimer) clearTimeout(drainTimer);
    if (!drained) {
      void pending.then(cleanupLateWrite, cleanupLateWrite).catch(() => undefined);
    }
    throw new PrivateImageDownloadTimeoutError();
  }

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
    source: string,
    key: string,
    targetSessionUri: string,
    requestEpoch: number,
    transport: 'signed' | 'proxy',
  ): Promise<string> {
    let attemptNumber: 1 | 2 = 1;
    let partUri = `${targetSessionUri}/${key}-${fs.createPartId()}.part`;
    const partUris = new Set([partUri]);
    activeParts.add(partUri);
    let finalUri: string | null = null;
    try {
      const prepareStartedAt = Date.now();
      try {
        await ensureSessionBeforeDownload(targetSessionUri, requestEpoch);
        report({
          stage: 'prepare',
          attempt: attemptNumber,
          outcome: 'success',
          duration: durationBucket(prepareStartedAt),
        });
      } catch (error) {
        report({
          stage: 'prepare',
          attempt: attemptNumber,
          outcome: 'failure',
          category: requestEpoch !== epoch ? 'auth-epoch' : 'filesystem',
          duration: durationBucket(prepareStartedAt),
        });
        throw error;
      }
      const primaryStartedAt = Date.now();
      const primaryPartUri = partUri;
      const primaryStage = transport === 'proxy' ? 'proxy-download' : 'primary-download';
      try {
        await runDownloadWithTimeout(
          (signal) => transport === 'proxy'
            ? proxyDownload(source, primaryPartUri, PRIVATE_IMAGE_MAX_BYTES, signal)
            : fs.download(source, primaryPartUri, PRIVATE_IMAGE_MAX_BYTES, signal),
          () => fs.deleteFile(primaryPartUri),
        );
        report({
          stage: primaryStage,
          attempt: attemptNumber,
          outcome: 'success',
          duration: durationBucket(primaryStartedAt),
        });
      } catch (error) {
        report({
          stage: primaryStage,
          attempt: attemptNumber,
          outcome: 'failure',
          ...downloadFailureDiagnostic(
            error,
            error instanceof PrivateImageDownloadTimeoutError,
          ),
          duration: durationBucket(primaryStartedAt),
        });
        await fs.deleteFile(partUri).catch(() => undefined);
        activeParts.delete(partUri);
        if (requestEpoch !== epoch) throw new Error('Private image access changed.');
        if (transport === 'proxy') throw error;
        if (isPrivateImageTooLargeError(error)) throw error;
        attemptNumber = 2;
        partUri = `${targetSessionUri}/${key}-${fs.createPartId()}.part`;
        partUris.add(partUri);
        activeParts.add(partUri);
        const legacyStartedAt = Date.now();
        const legacyPartUri = partUri;
        try {
          await runDownloadWithTimeout(
            (signal) => fs.downloadLegacy(source, legacyPartUri, PRIVATE_IMAGE_MAX_BYTES, signal),
            () => fs.deleteFile(legacyPartUri),
          );
          report({
            stage: 'legacy-download',
            attempt: attemptNumber,
            outcome: 'success',
            duration: durationBucket(legacyStartedAt),
          });
        } catch (legacyError) {
          report({
            stage: 'legacy-download',
            attempt: attemptNumber,
            outcome: 'failure',
            ...downloadFailureDiagnostic(
              legacyError,
              legacyError instanceof PrivateImageDownloadTimeoutError,
            ),
            duration: durationBucket(legacyStartedAt),
          });
          throw legacyError;
        }
      }
      if (requestEpoch !== epoch) throw new Error('Private image access changed.');

      const inspectStartedAt = Date.now();
      const { bytes, header } = await fs.inspect(partUri);
      const extension = extensionForImageHeader(header);
      if (!isValidPrivateImage({ bytes, header }) || !extension) {
        report({
          stage: 'inspect',
          attempt: attemptNumber,
          outcome: 'failure',
          category: 'invalid-bytes',
          duration: durationBucket(inspectStartedAt),
          bytes: byteBucket(bytes),
          magic: 'unknown',
        });
        throw new Error('Could not open this private image.');
      }
      report({
        stage: 'inspect',
        attempt: attemptNumber,
        outcome: 'success',
        duration: durationBucket(inspectStartedAt),
        bytes: byteBucket(bytes),
        magic: extension === 'jpg' ? 'jpeg' : extension,
      });

      finalUri = `${targetSessionUri}/${key}.${extension}`;
      const moveStartedAt = Date.now();
      try {
        await fs.move(partUri, finalUri);
        report({
          stage: 'move',
          attempt: attemptNumber,
          outcome: 'success',
          duration: durationBucket(moveStartedAt),
        });
      } catch (error) {
        report({
          stage: 'move',
          attempt: attemptNumber,
          outcome: 'failure',
          category: 'filesystem',
          duration: durationBucket(moveStartedAt),
        });
        throw error;
      }
      if (requestEpoch !== epoch) {
        report({
          stage: 'publish',
          attempt: attemptNumber,
          outcome: 'failure',
          category: 'auth-epoch',
        });
        await fs.deleteFile(finalUri).catch(() => undefined);
        throw new Error('Private image access changed.');
      }
      report({ stage: 'publish', attempt: attemptNumber, outcome: 'success' });
      return finalUri;
    } catch (error) {
      await fs.deleteFile(partUri).catch(() => undefined);
      if (requestEpoch !== epoch) {
        if (finalUri) await fs.deleteFile(finalUri).catch(() => undefined);
        throw new Error('Private image access changed.');
      }
      throw error;
    } finally {
      for (const uri of partUris) activeParts.delete(uri);
    }
  }

  async function resolveResource(
    identity: string,
    source: string,
    transport: 'signed' | 'proxy',
  ): Promise<string> {
    const requestEpoch = epoch;
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
      try {
        const fileUri = await attempt(source, key, targetSessionUri, requestEpoch, transport);
        if (requestEpoch !== epoch) {
          await fs.deleteFile(fileUri).catch(() => undefined);
          throw new Error('Private image access changed.');
        }
        resolved.set(key, fileUri);
        await enforceLimits(targetSessionUri, fileUri, requestEpoch).catch(() => undefined);
        return fileUri;
      } catch (error) {
        if (requestEpoch !== epoch) throw error;
        report({
          stage: 'final',
          attempt: transport === 'proxy' ? 1 : 2,
          outcome: 'failure',
          category: 'unknown',
        });
        throw new Error('Could not open this private image.', { cause: error });
      }
    })();
    inFlight.set(key, request);
    try {
      return await request;
    } finally {
      if (inFlight.get(key) === request) inFlight.delete(key);
    }
  }

  async function resolve(url: string): Promise<string> {
    const identity = canonicalPrivateImageIdentity(url);
    if (!identity) throw new Error('Expected an AWS-signed private image URL.');
    return resolveResource(identity, url, 'signed');
  }

  async function resolvePrivateRef(ref: string): Promise<string> {
    if (!isPrivateImageRef(ref)) throw new Error('Expected a private image reference.');
    return resolveResource(ref, ref, 'proxy');
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

  return { clear, resolve, resolvePrivateRef };
}

const privateImageFileCache = createPrivateImageFileCache();

export const cachePrivateImageUrl = privateImageFileCache.resolve;
export const cachePrivateImageRef = privateImageFileCache.resolvePrivateRef;
export const clearPrivateImageFileCache = privateImageFileCache.clear;
