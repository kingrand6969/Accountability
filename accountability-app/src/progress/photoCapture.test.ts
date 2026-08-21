import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  chooseProgressPhoto,
  resolvePrivateProgressPhoto,
  type ProgressPhotoCaptureDependencies,
  type ProgressPhotoImageDependencies,
} from './photoCapture';

const NOW = new Date(2026, 7, 22, 9, 15, 0, 0);

function dependencies(overrides: Partial<ProgressPhotoCaptureDependencies> = {}): ProgressPhotoCaptureDependencies {
  return {
    platform: 'ios',
    now: () => NOW,
    requestCameraPermission: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    requestLibraryPermission: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    launchCamera: jest.fn<ProgressPhotoCaptureDependencies['launchCamera']>().mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'file:///original.heic',
        width: 3024,
        height: 4032,
        type: 'image',
        mimeType: 'image/heic',
        exif: { DateTimeOriginal: '2026:08:19 14:32:11' },
      }],
    }),
    launchLibrary: jest.fn<ProgressPhotoCaptureDependencies['launchLibrary']>().mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///gallery.png', width: 1200, height: 1600, type: 'image' }],
    }),
    normalizeToJpeg: jest.fn<ProgressPhotoCaptureDependencies['normalizeToJpeg']>().mockResolvedValue({
      uri: 'file:///normalized.jpg', width: 1200, height: 1600,
    }),
    ...overrides,
  };
}

describe('chooseProgressPhoto', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('uses the front camera for a selfie and normalizes HEIC to JPEG before returning', async () => {
    const deps = dependencies();
    const result = await chooseProgressPhoto('front-camera', deps);

    expect(deps.requestCameraPermission).toHaveBeenCalledTimes(1);
    expect(deps.launchCamera).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'front' }));
    expect(deps.normalizeToJpeg).toHaveBeenCalledWith('file:///original.heic');
    expect(result).toEqual({
      uri: 'file:///normalized.jpg',
      width: 1200,
      height: 1600,
      capturedAt: new Date(2026, 7, 19, 14, 32, 11).toISOString(),
    });
    expect(result).not.toHaveProperty('storagePath');
    expect(result).not.toHaveProperty('publicUrl');
  });

  test('uses the rear camera for a regular photo', async () => {
    const deps = dependencies();
    await chooseProgressPhoto('rear-camera', deps);
    expect(deps.launchCamera).toHaveBeenCalledWith(expect.objectContaining({ cameraType: 'back' }));
    expect(deps.launchLibrary).not.toHaveBeenCalled();
  });

  test('requests gallery permission and opens the image library', async () => {
    const deps = dependencies();
    await chooseProgressPhoto('gallery', deps);
    expect(deps.requestLibraryPermission).toHaveBeenCalledTimes(1);
    expect(deps.launchLibrary).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'] }));
    expect(deps.launchCamera).not.toHaveBeenCalled();
  });

  test('preserves picker cancellation as null and never processes a file', async () => {
    const deps = dependencies({
      launchCamera: jest.fn<ProgressPhotoCaptureDependencies['launchCamera']>().mockResolvedValue({ canceled: true, assets: null }),
    });
    await expect(chooseProgressPhoto('front-camera', deps)).resolves.toBeNull();
    expect(deps.normalizeToJpeg).not.toHaveBeenCalled();
  });

  test.each([
    ['front-camera' as const, 'camera'],
    ['gallery' as const, 'gallery'],
  ])('reports denied %s permission without opening a picker', async (source, permissionKind) => {
    const deps = dependencies({
      requestCameraPermission: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
      requestLibraryPermission: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
    });
    await expect(chooseProgressPhoto(source, deps)).rejects.toEqual(
      expect.objectContaining({ permissionKind }),
    );
    expect(deps.launchCamera).not.toHaveBeenCalled();
    expect(deps.launchLibrary).not.toHaveBeenCalled();
  });

  test.each([
    undefined,
    { DateTimeOriginal: 'not-a-date' },
    { DateTimeOriginal: Number.POSITIVE_INFINITY },
  ])('falls back to the injected local clock when EXIF date is absent or invalid', async (exif) => {
    const deps = dependencies({
      launchLibrary: jest.fn<ProgressPhotoCaptureDependencies['launchLibrary']>().mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///gallery.jpg', width: 100, height: 200, type: 'image', exif }],
      }),
    });
    await expect(chooseProgressPhoto('gallery', deps)).resolves.toEqual(expect.objectContaining({ capturedAt: NOW.toISOString() }));
  });

  test('uses the library without requesting native media permission on web', async () => {
    const deps = dependencies({ platform: 'web' });
    await chooseProgressPhoto('gallery', deps);
    expect(deps.requestLibraryPermission).not.toHaveBeenCalled();
    expect(deps.launchLibrary).toHaveBeenCalledTimes(1);
  });

  test('rejects a malformed or non-image picker result before processing', async () => {
    const deps = dependencies({
      launchLibrary: jest.fn<ProgressPhotoCaptureDependencies['launchLibrary']>().mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///movie.mov', width: 100, height: 200, type: 'video' }],
      }),
    });
    await expect(chooseProgressPhoto('gallery', deps)).rejects.toThrow('valid photo');
    expect(deps.normalizeToJpeg).not.toHaveBeenCalled();
  });
});

describe('resolvePrivateProgressPhoto', () => {
  const path = 'owner-a/11111111-1111-4111-8111-111111111111.jpg';

  function imageDependencies(overrides: Partial<ProgressPhotoImageDependencies> = {}): ProgressPhotoImageDependencies {
    return {
      currentOwnerId: jest.fn<() => Promise<string>>().mockResolvedValue('owner-a'),
      createSignedUrl: jest.fn<ProgressPhotoImageDependencies['createSignedUrl']>().mockResolvedValue('https://private.example/signed-secret'),
      cachePrivateImage: jest.fn<ProgressPhotoImageDependencies['cachePrivateImage']>().mockResolvedValue('file:///private-cache/opaque.jpg'),
      ...overrides,
    };
  }

  test('resolves an owner path through a short-lived signed URL into an opaque local cache URI', async () => {
    const deps = imageDependencies();
    await expect(resolvePrivateProgressPhoto(path, 'owner-a', deps)).resolves.toEqual({ localUri: 'file:///private-cache/opaque.jpg' });
    expect(deps.createSignedUrl).toHaveBeenCalledWith(path, 300);
    expect(deps.cachePrivateImage).toHaveBeenCalledWith('https://private.example/signed-secret', 'owner-a');
    expect(deps.currentOwnerId).toHaveBeenCalledTimes(3);
  });

  test('rejects another owner path before minting access', async () => {
    const deps = imageDependencies();
    await expect(resolvePrivateProgressPhoto(
      'owner-b/11111111-1111-4111-8111-111111111111.jpg',
      'owner-a',
      deps,
    )).rejects.toThrow('verified');
    expect(deps.createSignedUrl).not.toHaveBeenCalled();
  });

  test('rejects an account switch after signing or caching without returning the image', async () => {
    const deps = imageDependencies({
      currentOwnerId: jest.fn<() => Promise<string>>()
        .mockResolvedValueOnce('owner-a')
        .mockResolvedValueOnce('owner-b'),
    });
    await expect(resolvePrivateProgressPhoto(path, 'owner-a', deps)).rejects.toThrow('Account changed.');
    expect(deps.cachePrivateImage).not.toHaveBeenCalled();
  });

  test('never returns the storage path or signed URL in its public result model', async () => {
    const result = await resolvePrivateProgressPhoto(path, 'owner-a', imageDependencies());
    expect(result).toEqual({ localUri: 'file:///private-cache/opaque.jpg' });
    expect(result).not.toHaveProperty('storagePath');
    expect(result).not.toHaveProperty('signedUrl');
    expect(JSON.stringify(result)).not.toContain('signed-secret');
    expect(JSON.stringify(result)).not.toContain(path);
  });
});
