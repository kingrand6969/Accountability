import { describe, expect, jest, test } from '@jest/globals';
import {
  PhotoPermissionDeniedError,
  type CapturedProgressPhoto,
  type ProgressPhotoSource,
} from '../progress/photoCapture';
import { captureComposerSelfie } from './composerSelfie';

type ChoosePhoto = (source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>;

function photo(): CapturedProgressPhoto {
  return {
    uri: 'file:///selfie.jpg',
    width: 1080,
    height: 1350,
    capturedAt: '2026-08-22T10:00:00.000Z',
    release: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe('captureComposerSelfie', () => {
  test('keeps cancellation as a no-op', async () => {
    const choosePhoto = jest.fn<ChoosePhoto>().mockResolvedValue(null);
    await expect(captureComposerSelfie({
      expectedOwner: 'owner-a', expectedToken: 1,
      currentOwner: () => 'owner-a', currentToken: () => 1,
      eventOpen: () => false, choosePhoto,
    })).resolves.toBeNull();
    expect(choosePhoto).toHaveBeenCalledWith('front-camera');
  });

  test('preserves a truthful permission error for the Composer explanation', async () => {
    const denied = new PhotoPermissionDeniedError('camera');
    await expect(captureComposerSelfie({
      expectedOwner: 'owner-a', expectedToken: 1,
      currentOwner: () => 'owner-a', currentToken: () => 1,
      eventOpen: () => false,
      choosePhoto: jest.fn<ChoosePhoto>().mockRejectedValue(denied),
    })).rejects.toBe(denied);
  });

  test('returns a successful current-owner selfie to the existing editor lifecycle', async () => {
    const captured = photo();
    await expect(captureComposerSelfie({
      expectedOwner: 'owner-a', expectedToken: 1,
      currentOwner: () => 'owner-a', currentToken: () => 1,
      eventOpen: () => false,
      choosePhoto: jest.fn<ChoosePhoto>().mockResolvedValue(captured),
    })).resolves.toBe(captured);
    expect(captured.release).not.toHaveBeenCalled();
  });

  test('releases a late selfie after account switch or event-mode change', async () => {
    for (const stale of ['owner', 'event'] as const) {
      const captured = photo();
      await expect(captureComposerSelfie({
        expectedOwner: 'owner-a', expectedToken: 1,
        currentOwner: () => stale === 'owner' ? 'owner-b' : 'owner-a',
        currentToken: () => 1,
        eventOpen: () => stale === 'event',
        choosePhoto: jest.fn<ChoosePhoto>().mockResolvedValue(captured),
      })).resolves.toBeNull();
      expect(captured.release).toHaveBeenCalledTimes(1);
    }
  });
});
