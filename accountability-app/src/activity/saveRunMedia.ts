import { Directory, File, Paths } from 'expo-file-system';
import {
  createRunMediaCache,
  type MediaOwner,
  type RunMediaCacheItem,
} from './runMediaCache';

export type RunMediaDestination = 'memories' | 'phone' | 'share' | 'feed';

export type RunMediaPersistResult = {
  destination: RunMediaDestination;
  persisted: boolean;
  newlyPersisted: boolean;
};

export type RunMediaPersistenceDependencies = {
  retain(id: string, owner: MediaOwner): Promise<void>;
  release(id: string, owner: MediaOwner): Promise<void>;
  saveToMemories(uri: string): Promise<{ path: string; bytes: number }>;
  requestPhonePermission(): Promise<{ granted: boolean }>;
  saveToPhone(uri: string): Promise<unknown>;
  share(uri: string): Promise<unknown>;
  findExistingFeedPost(): Promise<string | null>;
  uploadToFeed(uri: string): Promise<string>;
  createFeedPost(imageUrl: string): Promise<{ postId: string; created: boolean }>;
};

export type RunMediaStagingDependencies = {
  copyToManagedCache(uri: string): Promise<string>;
  register(uri: string, owner: MediaOwner): Promise<RunMediaCacheItem>;
};

export type RunMediaGenerationStageDependencies = {
  capture(): Promise<string | null>;
  currentGeneration(): number;
  stage(uri: string): Promise<RunMediaCacheItem>;
  release(id: string, owner: MediaOwner): Promise<void>;
};

export type RunMediaGenerationStageResult =
  | { status: 'ready'; item: RunMediaCacheItem }
  | { status: 'stale' };

export type RunMediaCompletionEffects = {
  complete(
    destination: RunMediaDestination,
    isSelfie: boolean,
    distanceKm: number,
  ): Promise<void>;
};

export const runMediaCache = createRunMediaCache();

export function createRunMediaOperationId(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const value = Math.floor(random() * 16);
    const nibble = token === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

const ownerByDestination: Record<RunMediaDestination, MediaOwner> = {
  memories: 'memories',
  phone: 'gallery',
  share: 'share',
  feed: 'feed',
};

async function copyToManagedCache(uri: string): Promise<string> {
  const directory = new Directory(Paths.cache, 'run-share');
  directory.create({ idempotent: true, intermediates: true });

  const source = new File(uri);
  const extension = ['.jpg', '.jpeg', '.png'].includes(source.extension.toLowerCase())
    ? source.extension.toLowerCase()
    : '.jpg';
  const destination = new File(
    directory,
    `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`,
  );
  await source.copy(destination);
  return destination.uri;
}

const stagingDependencies: RunMediaStagingDependencies = {
  copyToManagedCache,
  register: runMediaCache.register,
};

export function runMediaRenderSizeKey(
  size: {
    viewportWidth: number;
    viewportHeight: number;
    previewWidth: number;
    exportWidth: number;
    exportHeight: number;
  },
): string {
  return [
    `${size.viewportWidth}x${size.viewportHeight}`,
    size.previewWidth,
    `${size.exportWidth}x${size.exportHeight}`,
  ].join(':');
}

export function createRunMediaCompletionEffects(
  recordSelfie: (distanceKm: number) => Promise<void>,
): RunMediaCompletionEffects {
  let selfieRecorded = false;
  let selfieRecording: Promise<void> | null = null;

  return {
    complete(destination, isSelfie, distanceKm) {
      if (
        !isSelfie ||
        (destination !== 'memories' && destination !== 'feed') ||
        selfieRecorded
      ) {
        return Promise.resolve();
      }
      if (selfieRecording) return selfieRecording;

      selfieRecording = recordSelfie(distanceKm)
        .then(() => {
          selfieRecorded = true;
        })
        .finally(() => {
          selfieRecording = null;
        });
      return selfieRecording;
    },
  };
}

export async function stageRunMedia(
  uri: string,
  deps: RunMediaStagingDependencies = stagingDependencies,
): Promise<RunMediaCacheItem> {
  const managedUri = await deps.copyToManagedCache(uri);
  return deps.register(managedUri, 'editor');
}

export async function stageRunMediaForGeneration(
  generation: number,
  deps: RunMediaGenerationStageDependencies,
): Promise<RunMediaGenerationStageResult> {
  const uri = await deps.capture();
  if (deps.currentGeneration() !== generation) return { status: 'stale' };
  if (!uri) throw new Error('Could not render the run image.');

  const item = await deps.stage(uri);
  if (deps.currentGeneration() !== generation) {
    await deps.release(item.id, 'editor');
    return { status: 'stale' };
  }
  return { status: 'ready', item };
}

export async function persistRunMedia(
  destination: RunMediaDestination,
  item: RunMediaCacheItem,
  deps: RunMediaPersistenceDependencies,
): Promise<RunMediaPersistResult> {
  const owner = ownerByDestination[destination];
  await deps.retain(item.id, owner);
  let newlyPersisted = destination !== 'share';

  try {
    switch (destination) {
      case 'memories':
        await deps.saveToMemories(item.uri);
        break;
      case 'phone': {
        const permission = await deps.requestPhonePermission();
        if (!permission.granted) {
          throw new Error('Photo library permission is required to save this run image.');
        }
        await deps.saveToPhone(item.uri);
        break;
      }
      case 'share':
        await deps.share(item.uri);
        break;
      case 'feed': {
        const existingPostId = await deps.findExistingFeedPost();
        if (existingPostId) {
          newlyPersisted = false;
          break;
        }
        const imageUrl = await deps.uploadToFeed(item.uri);
        const post = await deps.createFeedPost(imageUrl);
        newlyPersisted = post.created;
        break;
      }
    }
  } catch (operationError) {
    try {
      await deps.release(item.id, owner);
    } catch (releaseError) {
      throw new AggregateError(
        [operationError, releaseError],
        `The ${destination} action failed and its temporary lease could not be released.`,
      );
    }
    throw operationError;
  }

  await deps.release(item.id, owner);
  return {
    destination,
    persisted: destination !== 'share',
    newlyPersisted,
  };
}
