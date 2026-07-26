import { Directory, File, Paths } from 'expo-file-system';

export type MediaOwner = 'editor' | 'share' | 'memories' | 'gallery' | 'feed';

export type RunMediaFileEntry = {
  uri: string;
  modifiedAt: number | null;
};

export interface RunMediaFileSystem {
  readonly cacheDirectory: string;
  list(directoryUri: string): Promise<readonly RunMediaFileEntry[]>;
  delete(uri: string): Promise<void>;
}

export type RunMediaCacheItem = {
  id: string;
  uri: string;
};

const RUN_SHARE_DIRECTORY = 'run-share';
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

const expoFileSystemAdapter: RunMediaFileSystem = {
  get cacheDirectory() {
    return Paths.cache.uri;
  },
  async list(directoryUri) {
    const directory = new Directory(directoryUri);
    if (!directory.exists) return [];

    return directory
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => ({ uri: file.uri, modifiedAt: file.modificationTime }));
  },
  async delete(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
};

function normalizeUri(uri: string): string | null {
  const slashUri = uri.replace(/\\/g, '/');
  const schemeMatch = slashUri.match(/^([a-z][a-z0-9+.-]*:\/\/)(.*)$/i);
  const prefix = schemeMatch?.[1].toLowerCase() ?? '';
  const path = schemeMatch?.[2] ?? slashUri;
  const leadingSlash = path.startsWith('/');
  const segments: string[] = [];

  for (const rawSegment of path.split('/')) {
    if (!rawSegment) continue;

    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }

    if (segment.includes('/') || segment.includes('\\')) return null;
    if (segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  if (/^[a-z]:$/i.test(segments[0] ?? '')) {
    for (let index = 0; index < segments.length; index += 1) {
      segments[index] = segments[index].toLowerCase();
    }
  }

  const normalizedPath = `${leadingSlash ? '/' : ''}${segments.join('/')}`;
  return `${prefix}${normalizedPath}`.replace(/\/+$/, '');
}

function managedDirectoryUri(fs: RunMediaFileSystem): string {
  return `${fs.cacheDirectory.replace(/[\\/]+$/, '')}/${RUN_SHARE_DIRECTORY}`;
}

function managedFileKey(uri: string, fs: RunMediaFileSystem): string | null {
  const normalizedUri = normalizeUri(uri);
  const normalizedDirectory = normalizeUri(managedDirectoryUri(fs));
  if (normalizedUri === null || normalizedDirectory === null) return null;

  const separatorIndex = normalizedUri.lastIndexOf('/');
  if (separatorIndex < 0 || normalizedUri.slice(separatorIndex + 1).length === 0) return null;
  return normalizedUri.slice(0, separatorIndex) === normalizedDirectory ? normalizedUri : null;
}

function isManagedFile(uri: string, fs: RunMediaFileSystem): boolean {
  return managedFileKey(uri, fs) !== null;
}

function isMissingPathError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === 'ENOENT' ||
    (typeof candidate.message === 'string' &&
      /(?:does not exist|no such file|not found)/i.test(candidate.message))
  );
}

export function createRunMediaCache(fs: RunMediaFileSystem = expoFileSystemAdapter) {
  type TrackedItem = RunMediaCacheItem & {
    canonicalUri: string;
    deleting?: Promise<void>;
    owners: Set<MediaOwner>;
  };

  const items = new Map<string, TrackedItem>();
  const idsByUri = new Map<string, string>();
  let nextId = 1;

  async function register(uri: string, owner: MediaOwner): Promise<RunMediaCacheItem> {
    const canonicalUri = managedFileKey(uri, fs);
    if (!canonicalUri) {
      throw new Error('Run media must be inside the managed run-share directory.');
    }

    const existingId = idsByUri.get(canonicalUri);
    if (existingId) {
      const existing = items.get(existingId);
      if (existing) {
        if (existing.deleting) {
          throw new Error('Run media is being deleted; register it again after deletion completes.');
        }
        existing.owners.add(owner);
        return { id: existing.id, uri: existing.uri };
      }
    }

    const item: TrackedItem = {
      id: `run-media-${nextId++}`,
      uri,
      canonicalUri,
      owners: new Set([owner]),
    };
    items.set(item.id, item);
    idsByUri.set(canonicalUri, item.id);
    return { id: item.id, uri: item.uri };
  }

  async function retain(id: string, owner: MediaOwner): Promise<void> {
    const item = items.get(id);
    if (!item) throw new Error(`Unknown run-media cache item: ${id}`);
    if (item.deleting) throw new Error('Run media is being deleted.');
    item.owners.add(owner);
  }

  async function release(id: string, owner?: MediaOwner): Promise<void> {
    const item = items.get(id);
    if (!item) return;
    if (item.deleting) return item.deleting;

    if (owner) {
      item.owners.delete(owner);
    } else if (item.owners.size === 1) {
      item.owners.clear();
    } else if (item.owners.size > 1) {
      throw new Error('An owner is required when releasing shared run media.');
    }

    if (item.owners.size > 0) return;

    const deletion = (async () => {
      try {
        if (isManagedFile(item.uri, fs)) {
          await fs.delete(item.uri);
        }
      } catch (error) {
        if (!isMissingPathError(error)) throw error;
      }

      items.delete(id);
      if (idsByUri.get(item.canonicalUri) === id) {
        idsByUri.delete(item.canonicalUri);
      }
    })();
    item.deleting = deletion;
    try {
      await deletion;
    } finally {
      if (item.deleting === deletion) item.deleting = undefined;
    }
  }

  async function discardEditorSession(): Promise<void> {
    const editorOwnedIds = [...items.values()]
      .filter((item) => item.owners.has('editor'))
      .map((item) => item.id);
    await Promise.all(editorOwnedIds.map((id) => release(id, 'editor')));
  }

  return { register, retain, release, discardEditorSession };
}

export async function cleanupAbandonedRunMedia(
  now = Date.now(),
  fs: RunMediaFileSystem = expoFileSystemAdapter,
): Promise<void> {
  let entries: readonly RunMediaFileEntry[];
  try {
    entries = await fs.list(managedDirectoryUri(fs));
  } catch (error) {
    if (isMissingPathError(error)) return;
    throw error;
  }

  const failures: { uri: string; error: unknown }[] = [];
  for (const entry of entries) {
    if (
      isManagedFile(entry.uri, fs) &&
      entry.modifiedAt !== null &&
      now - entry.modifiedAt > ABANDONED_AFTER_MS
    ) {
      try {
        await fs.delete(entry.uri);
      } catch (error) {
        if (!isMissingPathError(error)) failures.push({ uri: entry.uri, error });
      }
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Unable to delete ${failures.length} abandoned run-media file${
        failures.length === 1 ? '' : 's'
      }.`,
    );
  }
}
