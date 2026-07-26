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

  const normalizedPath = `${leadingSlash ? '/' : ''}${segments.join('/')}`;
  return `${prefix}${normalizedPath}`.replace(/\/+$/, '');
}

function managedDirectoryUri(fs: RunMediaFileSystem): string {
  return `${fs.cacheDirectory.replace(/[\\/]+$/, '')}/${RUN_SHARE_DIRECTORY}`;
}

function isManagedFile(uri: string, fs: RunMediaFileSystem): boolean {
  const normalizedUri = normalizeUri(uri);
  const normalizedDirectory = normalizeUri(managedDirectoryUri(fs));
  return (
    normalizedUri !== null &&
    normalizedDirectory !== null &&
    normalizedUri.startsWith(`${normalizedDirectory}/`)
  );
}

function isMissingDirectoryError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === 'ENOENT' ||
    (typeof candidate.message === 'string' &&
      /(?:does not exist|no such file|not found)/i.test(candidate.message))
  );
}

export function createRunMediaCache(fs: RunMediaFileSystem = expoFileSystemAdapter) {
  type TrackedItem = RunMediaCacheItem & { owners: Set<MediaOwner> };

  const items = new Map<string, TrackedItem>();
  const idsByUri = new Map<string, string>();
  let nextId = 1;

  async function register(uri: string, owner: MediaOwner): Promise<RunMediaCacheItem> {
    if (!isManagedFile(uri, fs)) {
      throw new Error('Run media must be inside the managed run-share directory.');
    }

    const existingId = idsByUri.get(uri);
    if (existingId) {
      const existing = items.get(existingId);
      if (existing) {
        existing.owners.add(owner);
        return { id: existing.id, uri: existing.uri };
      }
    }

    const item: TrackedItem = {
      id: `run-media-${nextId++}`,
      uri,
      owners: new Set([owner]),
    };
    items.set(item.id, item);
    idsByUri.set(uri, item.id);
    return { id: item.id, uri: item.uri };
  }

  async function retain(id: string, owner: MediaOwner): Promise<void> {
    const item = items.get(id);
    if (!item) throw new Error(`Unknown run-media cache item: ${id}`);
    item.owners.add(owner);
  }

  async function release(id: string, owner?: MediaOwner): Promise<void> {
    const item = items.get(id);
    if (!item) return;

    if (owner) {
      item.owners.delete(owner);
    } else if (item.owners.size === 1) {
      item.owners.clear();
    } else {
      throw new Error('An owner is required when releasing shared run media.');
    }

    if (item.owners.size > 0) return;

    items.delete(id);
    idsByUri.delete(item.uri);
    if (isManagedFile(item.uri, fs)) {
      await fs.delete(item.uri);
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
    if (isMissingDirectoryError(error)) return;
    throw error;
  }

  for (const entry of entries) {
    if (
      isManagedFile(entry.uri, fs) &&
      entry.modifiedAt !== null &&
      now - entry.modifiedAt > ABANDONED_AFTER_MS
    ) {
      await fs.delete(entry.uri);
    }
  }
}
