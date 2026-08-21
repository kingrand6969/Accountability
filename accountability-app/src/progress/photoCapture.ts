import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
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
