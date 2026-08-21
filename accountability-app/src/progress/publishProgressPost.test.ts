import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { ShareStudioResult } from '../share/shareStudioDraft';
import type { ProgressShareSnapshot } from './ProgressShareCard';
import {
  buildProgressShareData,
  assertProgressPhotoRowsCurrent,
  assertProgressShareSourcesCurrent,
  prepareProgressShareSnapshot,
  publishProgressPost,
  progressShareSnapshotForDraft,
  clearProgressPublishArtifacts,
  type ProgressPostDependencies,
} from './publishProgressPost';

jest.mock('../feed/api', () => ({ createPost: jest.fn() }));
jest.mock('../feed/feedPublishSignal', () => ({ markFeedPostPublished: jest.fn() }));
jest.mock('../feed/uploadPostImage', () => ({ uploadPostImageWithDigest: jest.fn() }));
jest.mock('../lib/supabase', () => ({ supabase: { auth: { getUser: jest.fn() } } }));
jest.mock('./api', () => ({ listProgressPhotos: jest.fn() }));
jest.mock('./photoCapture', () => ({ resolvePrivateProgressPhoto: jest.fn() }));

const ownerId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const postId = '33333333-3333-4333-8333-333333333333';
const digest = 'a'.repeat(64);

const snapshot: ProgressShareSnapshot = Object.freeze({
  ownerId,
  period: 'week',
  openedAt: '2026-08-22T08:00:00.000Z',
  workouts: 4,
  activeDays: 3,
  tasksDone: 8,
  weightKg: 72.4,
  bmi: 22.3,
  bodyMeasurement: Object.freeze({ id: 'measurement-1', recordedAt: '2026-08-22T07:00:00.000Z', weightKg: 72.4, heightCm: 180 }),
  context: Object.freeze({
    title: 'My weekly progress',
    date: '22 Aug 2026',
    metrics: Object.freeze([
      Object.freeze({ label: 'Workouts', value: '4', sensitivity: 'standard' as const }),
      Object.freeze({ label: 'Active days', value: '3', sensitivity: 'standard' as const }),
      Object.freeze({ label: 'Tasks done', value: '8', sensitivity: 'standard' as const }),
      Object.freeze({ label: 'Current weight', value: '72.4 kg', sensitivity: 'body' as const }),
      Object.freeze({ label: 'BMI', value: '22.3', sensitivity: 'body' as const }),
    ]),
  }),
  privatePhotos: Object.freeze([
    Object.freeze({ id: 'before', storagePath: `${ownerId}/44444444-4444-4444-8444-444444444444.jpg`, capturedAt: '2026-07-01T08:00:00.000Z', localUri: 'file:///private-before.jpg' }),
    Object.freeze({ id: 'latest', storagePath: `${ownerId}/55555555-5555-4555-8555-555555555555.jpg`, capturedAt: '2026-08-22T08:00:00.000Z', localUri: 'file:///private-latest.jpg' }),
  ]),
});

function draft(overrides: Partial<ShareStudioResult> = {}): ShareStudioResult {
  return {
    ownerId,
    operationId,
    context: { ...snapshot.context, metrics: snapshot.context.metrics.slice(0, 3) },
    caption: 'Small steps, repeated.',
    showPublicly: false,
    includeBodyStats: false,
    visibility: { audience: 'buddies', showOnCard: false },
    media: { kind: 'card' },
    ...overrides,
  };
}

function bodyDraft(overrides: Partial<ShareStudioResult> = {}): ShareStudioResult {
  return draft({
    includeBodyStats: true,
    context: {
      title: snapshot.context.title,
      date: snapshot.context.date,
      metrics: [
        { label: 'Current weight', value: '72.4 kg', sensitivity: 'body' },
        { label: 'BMI', value: '22.3', sensitivity: 'body' },
        { label: 'Workouts', value: '4', sensitivity: 'standard' },
      ],
    },
    ...overrides,
  });
}

function dependencies(events: string[] = []): ProgressPostDependencies {
  return {
    assertOwner: jest.fn(async () => { events.push('owner'); }),
    revalidateSources: jest.fn(async () => { events.push('validate'); }),
    captureCard: jest.fn<ProgressPostDependencies['captureCard']>(async (_model, options) => {
      events.push(`capture:${options.width}x${options.height}:${options.format}`);
      return 'jpeg-base64';
    }),
    uploadDerivedImage: jest.fn(async (_base64, ext, op, owner) => {
      events.push(`upload:${ext}:${op}:${owner}`);
      return { mediaRef: 'https://feed.example/derived.jpg', sha256: digest };
    }),
    createPost: jest.fn(async () => { events.push('post'); return postId; }) as ProgressPostDependencies['createPost'],
    markFeedPostPublished: jest.fn((_owner, _post) => { events.push('mark'); }),
  };
}

describe('Journey progress Feed publishing', () => {
  beforeEach(() => clearProgressPublishArtifacts());

  test('revalidates only the exact sources used by the reviewed renderer and sensitive opt-in', () => {
    const rows = snapshot.privatePhotos.map((photo) => ({ id: photo.id, storagePath: photo.storagePath, capturedAt: photo.capturedAt, weightKg: null }));
    const measurementRows = [{ id: 'measurement-1', recordedAt: '2026-08-22T07:00:00.000Z', weightKg: 72.4, heightCm: 180 }];
    expect(() => assertProgressShareSourcesCurrent(snapshot, draft(), { measurements: [], photos: rows })).not.toThrow();
    expect(() => assertProgressShareSourcesCurrent(snapshot, bodyDraft(), { measurements: measurementRows, photos: rows })).not.toThrow();
    expect(() => assertProgressShareSourcesCurrent(snapshot, { ...draft(), media: {
      kind: 'photo', source: 'selfie', uri: 'file:///new.jpg', width: 100, height: 125,
      capturedAt: '2026-08-22T08:00:00.000Z', release: jest.fn(async () => {}),
    } }, { measurements: [], photos: [] })).not.toThrow();
    expect(() => assertProgressShareSourcesCurrent(snapshot, bodyDraft(), { measurements: [{ ...measurementRows[0], weightKg: 71 }], photos: rows })).toThrow('changed');
    expect(() => assertProgressShareSourcesCurrent(snapshot, draft(), { measurements: [], photos: rows.slice(1) })).toThrow('changed');
  });

  test('reduces the publishing snapshot to only private sources actually used by that draft', () => {
    const selectedPhotoDraft = { ...draft(), media: {
      kind: 'photo' as const, source: 'gallery' as const, uri: 'file:///selected.jpg', width: 100, height: 125,
      capturedAt: '2026-08-22T08:00:00.000Z', release: jest.fn(async () => {}),
    } };
    expect(progressShareSnapshotForDraft(snapshot, selectedPhotoDraft)).toMatchObject({
      privatePhotos: [], bodyMeasurement: null, weightKg: null, bmi: null,
    });
    expect(progressShareSnapshotForDraft(snapshot, bodyDraft())).toMatchObject({
      privatePhotos: snapshot.privatePhotos,
      bodyMeasurement: snapshot.bodyMeasurement,
      weightKg: 72.4,
      bmi: 22.3,
    });
  });

  test('revalidates every frozen private photo identity without accepting replacement rows', () => {
    const rows = snapshot.privatePhotos.map((photo) => ({
      id: photo.id, storagePath: photo.storagePath, capturedAt: photo.capturedAt, weightKg: null,
    }));
    expect(() => assertProgressPhotoRowsCurrent(snapshot, rows)).not.toThrow();
    expect(() => assertProgressPhotoRowsCurrent(snapshot, [{ ...rows[0], storagePath: `${ownerId}/77777777-7777-4777-8777-777777777777.jpg` }, rows[1]])).toThrow('changed');
    expect(() => assertProgressPhotoRowsCurrent(snapshot, rows.slice(0, 1))).toThrow('changed');
  });

  test('prepares an owner-bound snapshot from only Before and Latest private rows', async () => {
    const assertOwner = jest.fn(async () => {});
    const resolvePrivatePhoto = jest.fn<(path: string, owner: string) => Promise<{ localUri: string }>>(async (path) => ({ localUri: `file:///cache/${path.split('/').at(-1)}` }));
    const photos = [
      { id: 'middle', storagePath: `${ownerId}/66666666-6666-4666-8666-666666666666.jpg`, capturedAt: '2026-08-01T00:00:00.000Z', weightKg: null },
      { id: 'latest', storagePath: `${ownerId}/55555555-5555-4555-8555-555555555555.jpg`, capturedAt: '2026-08-22T00:00:00.000Z', weightKg: 72.4 },
      { id: 'before', storagePath: `${ownerId}/44444444-4444-4444-8444-444444444444.jpg`, capturedAt: '2026-07-01T00:00:00.000Z', weightKg: 75 },
    ];
    const result = await prepareProgressShareSnapshot({
      ownerId,
      period: 'month',
      openedAt: new Date('2026-08-22T08:00:00.000Z'),
      workouts: 4,
      activeDays: 3,
      tasksDone: 8,
      weightKg: 72.4,
      bmi: 22.3,
      bodyMeasurement: { id: 'measurement-1', recordedAt: '2026-08-22T07:00:00.000Z', weightKg: 72.4, heightCm: 180 },
      photos,
    }, { assertOwner, resolvePrivatePhoto });

    expect(assertOwner).toHaveBeenCalledTimes(4);
    expect(resolvePrivatePhoto.mock.calls.map(([path, owner]) => [path, owner])).toEqual([
      [photos[2].storagePath, ownerId],
      [photos[1].storagePath, ownerId],
    ]);
    expect(result.privatePhotos.map((photo) => photo.id)).toEqual(['before', 'latest']);
    expect(result.context.metrics.filter((metric) => metric.sensitivity === 'body')).toEqual([
      { label: 'Current weight', value: '72.4 kg', sensitivity: 'body' },
      { label: 'BMI', value: '22.3', sensitivity: 'body' },
    ]);
    await expect(prepareProgressShareSnapshot({
      ownerId, period: 'week', openedAt: new Date('2026-08-22T08:00:00.000Z'),
      workouts: 1, activeDays: 1, tasksDone: 1, weightKg: 72.4, bmi: 22.3,
      bodyMeasurement: { id: 'measurement-1', recordedAt: '2026-08-22T07:00:00.000Z', weightKg: 71, heightCm: 180 },
      photos: [],
    }, { assertOwner, resolvePrivatePhoto })).rejects.toThrow('measurement');
  });

  test('keeps hidden weight, BMI, private refs, and signed URLs out of typed share data', () => {
    const hidden = buildProgressShareData(snapshot, draft(), digest);
    expect(hidden).toEqual({
      kind: 'journey_progress', period: 'week', workouts: 4, active_days: 3, tasks_done: 8,
      client_media_sha256: digest,
    });
    const serialized = JSON.stringify(hidden);
    expect(serialized).not.toMatch(/72\.4|22\.3|weight|bmi|storage|private|signed/i);

    const visible = buildProgressShareData(snapshot, bodyDraft(), digest);
    expect(visible).toMatchObject({ weight_kg: 72.4, bmi: 22.3 });
  });

  test('captures exactly 1080x1350 JPEG, uploads only the derived composite, and creates one reviewed milestone', async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    await expect(publishProgressPost({ snapshot, draft: draft() }, deps)).resolves.toBe(postId);

    expect(events).toEqual([
      'owner', 'validate', 'owner', 'capture:1080x1350:jpg', 'owner',
      'validate', 'owner', `upload:jpg:${operationId}:${ownerId}`, 'owner',
      'validate', 'owner', 'post', 'owner', 'mark',
    ]);
    expect(deps.uploadDerivedImage).toHaveBeenCalledWith('jpeg-base64', 'jpg', operationId, ownerId);
    expect(deps.createPost).toHaveBeenCalledWith(
      'Small steps, repeated.',
      'https://feed.example/derived.jpg',
      null, null, null, false,
      expect.objectContaining({
        showPublicly: false,
        postType: 'milestone',
        operationId,
        expectedOwnerId: ownerId,
        shareData: expect.objectContaining({ client_media_sha256: digest }),
      }),
    );
    expect(JSON.stringify(jest.mocked(deps.createPost).mock.calls[0])).not.toMatch(/private-before|private-latest|progress-photos|signed/i);
    expect(deps.markFeedPostPublished).toHaveBeenCalledWith(ownerId, postId);
  });

  test('passes the reviewed visibility without an independent Buddy Card state', async () => {
    const deps = dependencies();
    await publishProgressPost({ snapshot, draft: draft({ showPublicly: true, visibility: { audience: 'public', showOnCard: true } }) }, deps);
    expect(jest.mocked(deps.createPost).mock.calls[0]?.[5]).toBe(true);
    expect(jest.mocked(deps.createPost).mock.calls[0]?.[6]).toMatchObject({ showPublicly: true });
  });

  test('rejects owner changes before capture, upload, create, or completion signaling', async () => {
    for (const failAt of [1, 3, 4, 5]) {
      let calls = 0;
      const deps = dependencies();
      deps.assertOwner = jest.fn(async () => {
        calls += 1;
        if (calls === failAt) throw new Error('Account changed.');
      });
      await expect(publishProgressPost({ snapshot: { ...snapshot, ownerId: `${ownerId}-${failAt}` }, draft: { ...draft(), ownerId: `${ownerId}-${failAt}`, operationId: `22222222-2222-4222-8222-22222222222${failAt}` } }, deps)).rejects.toThrow('Account changed.');
      if (failAt <= 2) expect(deps.captureCard).not.toHaveBeenCalled();
      if (failAt <= 4) expect(deps.uploadDerivedImage).not.toHaveBeenCalled();
      if (failAt <= 6) expect(deps.createPost).not.toHaveBeenCalled();
      expect(deps.markFeedPostPublished).not.toHaveBeenCalled();
    }
  });

  test('coalesces concurrent taps and reuses the exact frozen draft on retry without duplicate posts', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const deps = dependencies();
    (deps.captureCard as jest.MockedFunction<ProgressPostDependencies['captureCard']>).mockImplementationOnce(async () => {
      await pending;
      return 'jpeg-base64';
    });
    const first = publishProgressPost({ snapshot, draft: draft() }, deps);
    const second = publishProgressPost({ snapshot, draft: draft() }, deps);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([postId, postId]);
    expect(deps.captureCard).toHaveBeenCalledTimes(1);
    expect(deps.createPost).toHaveBeenCalledTimes(1);

    const retryDeps = dependencies();
    (retryDeps.createPost as jest.MockedFunction<ProgressPostDependencies['createPost']>)
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce(postId);
    await expect(publishProgressPost({ snapshot, draft: draft() }, retryDeps)).rejects.toThrow('lost response');
    await expect(publishProgressPost({ snapshot, draft: draft() }, retryDeps)).resolves.toBe(postId);
    expect(retryDeps.uploadDerivedImage).toHaveBeenNthCalledWith(1, 'jpeg-base64', 'jpg', operationId, ownerId);
    expect(retryDeps.uploadDerivedImage).toHaveBeenCalledTimes(1);
    expect(jest.mocked(retryDeps.createPost).mock.calls[0]).toEqual(jest.mocked(retryDeps.createPost).mock.calls[1]);
  });

  test('reuses the exact captured and uploaded artifact after an ambiguous create failure', async () => {
    const deps = dependencies();
    const upload = jest.mocked(deps.uploadDerivedImage)
      .mockResolvedValueOnce({ mediaRef: 'https://feed.example/original.jpg', sha256: 'a'.repeat(64) })
      .mockResolvedValueOnce({ mediaRef: 'https://feed.example/changed.jpg', sha256: 'b'.repeat(64) });
    jest.mocked(deps.captureCard)
      .mockResolvedValueOnce('first-capture')
      .mockResolvedValueOnce('changed-capture');
    jest.mocked(deps.createPost).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(postId);

    await expect(publishProgressPost({ snapshot, draft: draft() }, deps)).rejects.toThrow('lost response');
    await expect(publishProgressPost({ snapshot, draft: draft() }, deps)).resolves.toBe(postId);

    expect(deps.captureCard).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(jest.mocked(deps.createPost).mock.calls[1]?.[1]).toBe('https://feed.example/original.jpg');
    expect(jest.mocked(deps.createPost).mock.calls[1]?.[6]?.shareData).toMatchObject({ client_media_sha256: 'a'.repeat(64) });
  });

  test('rejects a mutated or foreign draft before any side effect', async () => {
    const deps = dependencies();
    await expect(publishProgressPost({ snapshot, draft: { ...draft(), ownerId: 'foreign-owner' } }, deps)).rejects.toThrow('Account changed.');
    expect(deps.assertOwner).not.toHaveBeenCalled();
    expect(deps.captureCard).not.toHaveBeenCalled();
  });

  test('rejects context, visibility, or operation reuse that differs from the reviewed frozen draft', async () => {
    for (const changed of [
      draft({ context: { ...draft().context, title: 'Injected title' } }),
      draft({ showPublicly: true, visibility: { audience: 'buddies', showOnCard: false } }),
    ]) {
      const deps = dependencies();
      await expect(publishProgressPost({ snapshot, draft: changed }, deps)).rejects.toThrow(/reviewed|visibility/i);
      expect(deps.assertOwner).not.toHaveBeenCalled();
      expect(deps.captureCard).not.toHaveBeenCalled();
    }

    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const deps = dependencies();
    jest.mocked(deps.captureCard).mockImplementationOnce(async () => { await pending; return 'jpeg-base64'; });
    const first = publishProgressPost({ snapshot, draft: draft() }, deps);
    const changedRetry = publishProgressPost({ snapshot, draft: draft({ caption: 'Changed after review' }) }, deps);
    await expect(changedRetry).rejects.toThrow('changed');
    release();
    await expect(first).resolves.toBe(postId);
    expect(deps.captureCard).toHaveBeenCalledTimes(1);
  });
});
