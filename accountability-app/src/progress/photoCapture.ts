import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import type { File as ExpoFile, FileMode as ExpoFileMode } from 'expo-file-system';
import { Platform } from 'react-native';

export type ProgressPhotoSource = 'front-camera' | 'rear-camera' | 'gallery';

export type CapturedProgressPhoto = Readonly<{
  uri: string;
  capturedAt: string;
  width: number;
  height: number;
}>;

type PickerAssetLike = Readonly<{
  uri?: unknown;
  width?: unknown;
  height?: unknown;
  type?: unknown;
  mimeType?: unknown;
  exif?: unknown;
}>;

type PickerResultLike = Readonly<{
  canceled: boolean;
  assets: readonly PickerAssetLike[] | null;
}>;

type PickerOptions = Readonly<{
  mediaTypes: readonly ['images'];
  allowsEditing: false;
  quality: number;
  exif: true;
  cameraType?: 'front' | 'back';
}>;

export type ProgressPhotoCaptureDependencies = Readonly<{
  platform: string;
  now: () => Date;
  requestCameraPermission: () => Promise<boolean>;
  requestLibraryPermission: () => Promise<boolean>;
  launchCamera: (options: PickerOptions) => Promise<PickerResultLike>;
  launchLibrary: (options: PickerOptions) => Promise<PickerResultLike>;
  normalizeToJpeg: (uri: string) => Promise<Readonly<{ uri: string; width: number; height: number }>>;
}>;

export class PhotoPermissionDeniedError extends Error {
  readonly permissionKind: 'camera' | 'gallery';

  constructor(permissionKind: 'camera' | 'gallery') {
    super(`${permissionKind === 'camera' ? 'Camera' : 'Photo library'} permission denied.`);
    this.name = 'PhotoPermissionDeniedError';
    this.permissionKind = permissionKind;
  }
}

export type ResolvedProgressPhoto = Readonly<{ localUri: string }>;

export type ProgressPhotoImageDependencies = Readonly<{
  currentOwnerId: () => Promise<string>;
  createSignedUrl: (storagePath: string, expiresInSeconds: number) => Promise<string>;
  cachePrivateImage: (signedUrl: string, expectedOwnerId: string) => Promise<string>;
}>;

const progressPhotoImageDependencies: ProgressPhotoImageDependencies = {
  async currentOwnerId() {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const ownerId = data.user?.id;
    if (!ownerId) throw new Error('Not signed in.');
    return ownerId;
  },
  async createSignedUrl(storagePath, expiresInSeconds) {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase.storage.from('progress-photos').createSignedUrl(storagePath, expiresInSeconds);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Private photo could not be opened.');
    return data.signedUrl;
  },
  cachePrivateImage: cacheProgressPhotoImage,
};

export async function resolvePrivateProgressPhoto(
  storagePath: string,
  expectedOwnerId: string,
  dependencies: ProgressPhotoImageDependencies = progressPhotoImageDependencies,
): Promise<ResolvedProgressPhoto> {
  assertPrivateProgressPath(storagePath, expectedOwnerId);
  await assertImageOwner(expectedOwnerId, dependencies);
  const signedUrl = await dependencies.createSignedUrl(storagePath, 300);
  await assertImageOwner(expectedOwnerId, dependencies);
  const localUri = await dependencies.cachePrivateImage(signedUrl, expectedOwnerId);
  await assertImageOwner(expectedOwnerId, dependencies);
  if (typeof localUri !== 'string' || !/^(?:file|content):\/\//i.test(localUri)) {
    throw new Error('Private photo could not be opened.');
  }
  return { localUri };
}

const defaultDependencies: ProgressPhotoCaptureDependencies = {
  platform: Platform.OS,
  now: () => new Date(),
  async requestCameraPermission() {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    return result.granted;
  },
  async requestLibraryPermission() {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return result.granted;
  },
  launchCamera: ({ cameraType, ...options }) => ImagePicker.launchCameraAsync({
    ...options,
    cameraType: cameraType === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    mediaTypes: ['images'],
  }) as Promise<PickerResultLike>,
  launchLibrary: ({ cameraType: _cameraType, ...options }) => ImagePicker.launchImageLibraryAsync({ ...options, mediaTypes: ['images'] }) as Promise<PickerResultLike>,
  async normalizeToJpeg(uri) {
    const normalized = await ImageManipulator.manipulateAsync(
      uri,
      [],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    );
    return { uri: normalized.uri, width: normalized.width, height: normalized.height };
  },
};

export async function chooseProgressPhoto(
  source: ProgressPhotoSource,
  dependencies: ProgressPhotoCaptureDependencies = defaultDependencies,
): Promise<CapturedProgressPhoto | null> {
  const usesNativeCamera = source !== 'gallery' && dependencies.platform !== 'web';
  if (usesNativeCamera) {
    if (!await dependencies.requestCameraPermission()) throw new PhotoPermissionDeniedError('camera');
  } else if (source === 'gallery' && dependencies.platform !== 'web') {
    if (!await dependencies.requestLibraryPermission()) throw new PhotoPermissionDeniedError('gallery');
  }

  const options: PickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    exif: true,
    ...(source === 'front-camera' ? { cameraType: 'front' as const } : {}),
    ...(source === 'rear-camera' ? { cameraType: 'back' as const } : {}),
  };
  const result = usesNativeCamera
    ? await dependencies.launchCamera(options)
    : await dependencies.launchLibrary(options);
  if (result.canceled) return null;

  const asset = result.assets?.[0];
  if (
    !asset ||
    asset.type !== 'image' ||
    typeof asset.uri !== 'string' ||
    asset.uri.trim().length === 0 ||
    !isPositiveDimension(asset.width) ||
    !isPositiveDimension(asset.height)
  ) {
    throw new Error('Choose a valid photo and try again.');
  }

  const fallback = dependencies.now();
  if (!Number.isFinite(fallback.getTime())) throw new Error('The current date could not be read.');
  const capturedAt = originalCaptureDate(asset.exif) ?? fallback;
  const normalized = await dependencies.normalizeToJpeg(asset.uri);
  if (
    typeof normalized.uri !== 'string' ||
    normalized.uri.trim().length === 0 ||
    !isPositiveDimension(normalized.width) ||
    !isPositiveDimension(normalized.height)
  ) {
    throw new Error('Choose a valid photo and try again.');
  }
  return {
    uri: normalized.uri,
    width: normalized.width,
    height: normalized.height,
    capturedAt: capturedAt.toISOString(),
  };
}

function originalCaptureDate(exif: unknown): Date | null {
  if (!isRecord(exif)) return null;
  for (const key of ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime', 'dateTimeOriginal', 'dateTime']) {
    const parsed = parseExifDate(exif[key]);
    if (parsed) return parsed;
  }
  return null;
}

function parseExifDate(value: unknown): Date | null {
  let milliseconds: number;
  if (typeof value === 'number') {
    milliseconds = value > 10_000_000_000 ? value : value * 1000;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    const localExif = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
    if (localExif) {
      const [, year, month, day, hour, minute, second] = localExif;
      const candidate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
      if (
        candidate.getFullYear() !== Number(year) ||
        candidate.getMonth() !== Number(month) - 1 ||
        candidate.getDate() !== Number(day) ||
        candidate.getHours() !== Number(hour) ||
        candidate.getMinutes() !== Number(minute) ||
        candidate.getSeconds() !== Number(second)
      ) return null;
      return candidate;
    }
    milliseconds = Date.parse(trimmed);
  } else {
    return null;
  }
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isPositiveDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function assertImageOwner(expectedOwnerId: string, dependencies: ProgressPhotoImageDependencies) {
  const ownerId = await dependencies.currentOwnerId();
  if (ownerId !== expectedOwnerId) throw new Error('Account changed.');
}

function assertPrivateProgressPath(storagePath: string, expectedOwnerId: string) {
  const escapedOwner = expectedOwnerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uuidV4 = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
  if (!new RegExp(`^${escapedOwner}/${uuidV4}\\.jpg$`, 'i').test(storagePath)) {
    throw new Error('Private progress photo could not be verified.');
  }
}

const MAX_PRIVATE_PHOTO_BYTES = 20 * 1024 * 1024;
let cachedProgressOwner: string | null = null;
let progressCacheEpoch = 0;
let progressCacheSession: string | null = null;

async function cacheProgressPhotoImage(signedUrl: string, expectedOwnerId: string): Promise<string> {
  const { Directory, File, FileMode, Paths } = await import('expo-file-system');
  const root = new Directory(Paths.cache, 'journey-progress-private');
  if (cachedProgressOwner !== expectedOwnerId) {
    progressCacheEpoch += 1;
    if (root.exists) root.delete();
    root.create({ idempotent: true, intermediates: true });
    cachedProgressOwner = expectedOwnerId;
    progressCacheSession = Crypto.randomUUID();
  }
  root.create({ idempotent: true, intermediates: true });
  const session = new Directory(root, progressCacheSession ?? (progressCacheSession = Crypto.randomUUID()));
  session.create({ idempotent: true, intermediates: true });
  const requestEpoch = progressCacheEpoch;
  const identity = signedImageIdentity(signedUrl);
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, identity);
  if (requestEpoch !== progressCacheEpoch || cachedProgressOwner !== expectedOwnerId) throw new Error('Account changed.');
  const destination = new File(session, `${hash}.image`);
  if (destination.exists && validCachedImage(destination, FileMode.ReadOnly)) return destination.uri;

  const controller = new AbortController();
  let oversized = false;
  try {
    await File.downloadFileAsync(signedUrl, destination, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (bytesWritten > MAX_PRIVATE_PHOTO_BYTES || totalBytes > MAX_PRIVATE_PHOTO_BYTES) {
          oversized = true;
          controller.abort();
        }
      },
    });
  } catch (error) {
    if (destination.exists) destination.delete();
    if (oversized) throw new Error('Private photo is too large.');
    throw error;
  }
  if (requestEpoch !== progressCacheEpoch || cachedProgressOwner !== expectedOwnerId) {
    if (destination.exists) destination.delete();
    throw new Error('Account changed.');
  }
  if (!validCachedImage(destination, FileMode.ReadOnly)) {
    if (destination.exists) destination.delete();
    throw new Error('Private photo could not be opened.');
  }
  return destination.uri;
}

function signedImageIdentity(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Invalid private photo URL.');
    return `${url.origin}${url.pathname}`;
  } catch {
    throw new Error('Private photo could not be opened.');
  }
}

function validCachedImage(file: ExpoFile, readOnlyMode: ExpoFileMode) {
  if (!file.exists || file.size < 8 || file.size > MAX_PRIVATE_PHOTO_BYTES) return false;
  const handle = file.open(readOnlyMode);
  try {
    const header = handle.readBytes(8);
    const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => header[index] === byte);
    return jpeg || png;
  } finally {
    handle.close();
  }
}
