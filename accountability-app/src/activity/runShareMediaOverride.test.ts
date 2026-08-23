import { describe, expect, jest, test } from '@jest/globals';

import {
  createRunShareMediaOverrideController,
  freezeRunShareRenderInputs,
  runShareRenderModel,
  uploadRunFeedImage,
  type RunSharePresentation,
} from './runShareMediaOverride';
import { persistRunMedia, type RunMediaPersistenceDependencies } from './saveRunMedia';

const mapPresentation: RunSharePresentation = {
  mode: 'map',
  photoUri: null,
  photoKind: null,
  originalRatio: null,
};

const editedPresentation: RunSharePresentation = {
  mode: 'photo',
  photoUri: 'file:///edited.jpg',
  photoKind: 'selfie',
  originalRatio: 0.8,
};

const studioDraft = {
  operationId: 'draft-1',
  uri: 'file:///studio.jpg',
  source: 'gallery' as const,
  width: 1200,
  height: 1600,
};

const appearance = {
  layout: 'map-focus' as const,
  font: 'momentum' as const,
  showTimestamp: true,
  theme: 'night' as const,
  completedAt: '2026-08-23T10:18:00.000Z',
};

describe('Run Share Studio media override', () => {
  test('Card only previews the existing selfie with exact private route and format inputs', () => {
    const frozen = freezeRunShareRenderInputs({
      presentation: editedPresentation,
      format: 'feed',
      mediaFit: 'contain',
      showEnds: false,
      appearance,
      points: [{ lat: -31.95, lon: 115.86 }],
      distanceM: 5200,
      durationS: 1800,
    });

    expect(runShareRenderModel(frozen, { kind: 'card' })).toEqual({
      ...frozen,
      presentation: editedPresentation,
    });
    expect(frozen.showEnds).toBe(false);
    expect(frozen.appearance).toEqual(appearance);
    expect(Object.isFrozen(frozen.appearance)).toBe(true);
    expect(frozen.points).toHaveLength(1);
  });

  test('Card only previews the existing map card without inventing a photo', () => {
    const frozen = freezeRunShareRenderInputs({
      presentation: mapPresentation,
      format: 'square',
      mediaFit: 'cover',
      showEnds: true,
      appearance: { ...appearance, layout: 'right-rail', font: 'strong' },
      points: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
      distanceM: 1000,
      durationS: 400,
    });

    expect(runShareRenderModel(frozen, { kind: 'card' }).presentation).toEqual(mapPresentation);
  });

  test('Studio photo changes only the frozen media used by preview and capture', () => {
    const frozen = freezeRunShareRenderInputs({
      presentation: mapPresentation,
      format: 'portrait',
      mediaFit: 'cover',
      showEnds: false,
      appearance: { ...appearance, layout: 'center-stack', showTimestamp: false },
      points: [{ lat: 1, lon: 2 }],
      distanceM: 10000,
      durationS: 3600,
    });
    const media = {
      kind: 'photo' as const,
      source: 'selfie' as const,
      uri: 'file:///studio-selfie.jpg',
      width: 900,
      height: 1200,
    };
    const previewModel = runShareRenderModel(frozen, media);
    const captureModel = runShareRenderModel(frozen, media);

    expect(previewModel).toEqual(captureModel);
    expect(previewModel).toEqual({
      ...frozen,
      presentation: {
        mode: 'photo',
        photoUri: 'file:///studio-selfie.jpg',
        photoKind: 'selfie',
        originalRatio: 0.75,
      },
    });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.points)).toBe(true);
  });

  test('failed publish then cancel restores the existing edited photo without releasing it', () => {
    const controller = createRunShareMediaOverrideController();
    const edited = { id: 'edited-cache', uri: 'file:///edited.jpg' };

    expect(controller.stage(editedPresentation, edited, studioDraft)).toEqual({
      mode: 'photo',
      photoUri: 'file:///studio.jpg',
      photoKind: 'gallery',
      originalRatio: 0.75,
    });

    // A rejected destination does not commit anything. Cancelling the retained
    // Share Studio draft restores the exact editor state and owner lease.
    expect(controller.cancel()).toEqual({
      presentation: editedPresentation,
      processedPhoto: edited,
    });
    expect(controller.commit()).toBeNull();
  });

  test('cancel restores the map card when there was no previous photo', () => {
    const controller = createRunShareMediaOverrideController();
    controller.stage(mapPresentation, null, studioDraft);

    expect(controller.cancel()).toEqual({
      presentation: mapPresentation,
      processedPhoto: null,
    });
  });

  test('retry keeps the original rollback point and successful commit transfers once', () => {
    const controller = createRunShareMediaOverrideController();
    const edited = { id: 'edited-cache', uri: 'file:///edited.jpg' };
    const first = controller.stage(editedPresentation, edited, studioDraft);

    expect(controller.stage(mapPresentation, null, { ...studioDraft })).toEqual(first);
    expect(controller.commit()).toEqual({
      presentation: first,
      releasePrevious: edited,
    });
    expect(controller.commit()).toBeNull();
    expect(controller.cancel()).toBeNull();
  });

  test('account switch drops the override without transferring either account media', () => {
    const controller = createRunShareMediaOverrideController();
    controller.stage(editedPresentation, { id: 'owner-a-photo', uri: 'file:///a.jpg' }, studioDraft);

    controller.clear();

    expect(controller.cancel()).toBeNull();
    expect(controller.commit()).toBeNull();
  });
});

describe('owner-bound Run Feed upload', () => {
  test('account switch during upload cannot upload or create a post under account B', async () => {
    let currentOwner = 'owner-a';
    const uploadedOwners: string[] = [];
    const createFeedPost = jest.fn(async () => ({ postId: 'post-b', created: true }));
    const upload = jest.fn(async (
      _base64: string,
      _ext: string,
      _operationId: string | undefined,
      expectedOwnerId: string,
    ) => {
      currentOwner = 'owner-b';
      if (currentOwner !== expectedOwnerId) throw new Error('Account changed.');
      uploadedOwners.push(currentOwner);
      return 'https://images.example/run.jpg';
    });
    const deps: RunMediaPersistenceDependencies = {
      retain: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
      saveToMemories: jest.fn(async () => ({ path: '', bytes: 0 })),
      requestPhonePermission: jest.fn(async () => ({ granted: true })),
      saveToPhone: jest.fn(async () => undefined),
      share: jest.fn(async () => undefined),
      findExistingFeedPost: jest.fn(async () => null),
      uploadToFeed: (uri) => uploadRunFeedImage({
        uri,
        operationId: 'operation-a',
        expectedOwnerId: 'owner-a',
      }, {
        readBase64: jest.fn(async () => 'base64'),
        uploadPostImage: upload,
        assertOwned: () => {
          if (currentOwner !== 'owner-a') throw new Error('Account changed.');
        },
      }),
      createFeedPost,
    };

    await expect(persistRunMedia('feed', { id: 'run-card', uri: 'file:///run.jpg' }, deps))
      .rejects.toThrow('Account changed.');
    expect(upload).toHaveBeenCalledWith('base64', 'jpg', 'operation-a', 'owner-a');
    expect(uploadedOwners).toEqual([]);
    expect(createFeedPost).not.toHaveBeenCalled();
  });
});
