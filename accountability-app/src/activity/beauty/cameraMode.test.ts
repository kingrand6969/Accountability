import { describe, expect, it } from '@jest/globals';
import {
  beautyCameraModeAllowsCapture,
  createSingleFlightCapture,
  isFaceSnapshotFresh,
  mapFacesToImage,
  resolveBeautyCameraMode,
  sanitizeFaceDetectorResults,
  type FaceSnapshot,
} from './cameraMode';

describe('resolveBeautyCameraMode', () => {
  it.each<
    [boolean, boolean, ReturnType<typeof resolveBeautyCameraMode>]
  >([
    [false, true, 'plain-live-beauty-after'],
    [false, false, 'plain-camera'],
    [true, true, 'beauty-live'],
  ])(
    'maps live=%s final=%s to %s',
    (livePreview, finalRender, expected) => {
      expect(resolveBeautyCameraMode({ livePreview, finalRender })).toBe(expected);
    },
  );

  it.each([
    'plain-camera',
    'plain-live-beauty-after',
    'beauty-live',
  ] as const)('keeps capture available in %s mode', (mode) => {
    expect(beautyCameraModeAllowsCapture(mode)).toBe(true);
  });
});

describe('sanitizeFaceDetectorResults', () => {
  it('copies only approved geometry, maps detector landmarks, and caps faces', () => {
    const raw = Array.from({ length: 10 }, (_, index) => ({
      bounds: { x: index, y: 2, width: 20, height: 30 },
      landmarks: {
        LEFT_EYE: { x: 5, y: 8 },
        RIGHT_EYE: { x: 15, y: 8 },
        NOSE_BASE: { x: 10, y: 15 },
        MOUTH_BOTTOM: { x: 10, y: 24 },
      },
      trackingId: 99,
      smilingProbability: 1,
    }));

    const faces = sanitizeFaceDetectorResults(raw);

    expect(faces).toHaveLength(8);
    expect(faces[0]).toEqual({
      bounds: { x: 0, y: 2, width: 20, height: 30 },
      leftEye: { x: 5, y: 8 },
      rightEye: { x: 15, y: 8 },
      nose: { x: 10, y: 15 },
      mouth: { x: 10, y: 24 },
    });
    expect(faces[0]).not.toHaveProperty('trackingId');
    expect(faces[0]).not.toHaveProperty('smilingProbability');
  });
});

describe('face snapshot mapping', () => {
  const snapshot: FaceSnapshot = {
    capturedAt: 1_000,
    imageSize: { width: 100, height: 200 },
    orientation: 90,
    mirrored: true,
    faces: [
      {
        bounds: { x: 10, y: 20, width: 20, height: 40 },
        leftEye: { x: 15, y: 30 },
      },
    ],
  };

  it('rejects stale snapshots', () => {
    expect(isFaceSnapshotFresh(snapshot, 1_499)).toBe(true);
    expect(isFaceSnapshotFresh(snapshot, 1_501)).toBe(false);
  });

  it('unmirrors, rotates, and scales into the captured image', () => {
    expect(mapFacesToImage(snapshot, { width: 400, height: 200 })).toEqual([
      {
        bounds: { x: 280, y: 140, width: 80, height: 40 },
        leftEye: { x: 340, y: 170 },
      },
    ]);
  });

  it.each<
    [
      0 | 180 | 270,
      { x: number; y: number; width: number; height: number },
    ]
  >([
    [0, { x: 10, y: 20, width: 20, height: 40 }],
    [180, { x: 70, y: 140, width: 20, height: 40 }],
    [270, { x: 20, y: 70, width: 40, height: 20 }],
  ])('maps %s-degree orientation', (orientation, expectedBounds) => {
    const mapped = mapFacesToImage(
      {
        ...snapshot,
        mirrored: false,
        orientation,
      },
      orientation === 0 || orientation === 180
        ? { width: 100, height: 200 }
        : { width: 200, height: 100 },
    );
    expect(mapped[0]?.bounds).toEqual(expectedBounds);
  });
});

describe('createSingleFlightCapture', () => {
  it('shares one in-flight capture and permits the next capture afterwards', async () => {
    let calls = 0;
    let resolveFirst!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const capture = createSingleFlightCapture(async () => {
      calls += 1;
      return calls === 1 ? first : 'second';
    });

    const a = capture();
    const b = capture();
    expect(a).toBe(b);
    expect(calls).toBe(1);

    resolveFirst('first');
    await expect(a).resolves.toBe('first');
    await expect(capture()).resolves.toBe('second');
    expect(calls).toBe(2);
  });
});
