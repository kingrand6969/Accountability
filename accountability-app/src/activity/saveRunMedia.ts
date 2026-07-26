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
};

export type RunMediaPersistenceDependencies = {
  retain(id: string, owner: MediaOwner): Promise<void>;
  release(id: string, owner: MediaOwner): Promise<void>;
  saveToMemories(uri: string): Promise<{ path: string; bytes: number }>;
  requestPhonePermission(): Promise<{ granted: boolean }>;
  saveToPhone(uri: string): Promise<unknown>;
  share(uri: string): Promise<unknown>;
  uploadToFeed(uri: string): Promise<string>;
  createFeedPost(imageUrl: string): Promise<unknown>;
};

export type RunMediaStagingDependencies = {
  copyToManagedCache(uri: string): Promise<string>;
  register(uri: string, owner: MediaOwner): Promise<RunMediaCacheItem>;
};

export type RunMediaCompletionEffects = {
  complete(
    destination: RunMediaDestination,
    isSelfie: boolean,
    distanceKm: number,
  ): Promise<void>;
};

export const runMediaCache = createRunMediaCache();

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

export async function persistRunMedia(
  destination: RunMediaDestination,
  item: RunMediaCacheItem,
  deps: RunMediaPersistenceDependencies,
): Promise<RunMediaPersistResult> {
  const owner = ownerByDestination[destination];
  await deps.retain(item.id, owner);

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
      const imageUrl = await deps.uploadToFeed(item.uri);
      await deps.createFeedPost(imageUrl);
      break;
    }
  }

  await deps.release(item.id, owner);
  return { destination, persisted: destination !== 'share' };
}
