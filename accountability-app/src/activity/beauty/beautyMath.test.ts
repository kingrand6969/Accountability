import { describe, expect, it } from '@jest/globals';
import type {
  BeautyEngine,
  BeautyDetectionInput,
  DetectedFace,
  Point,
} from './BeautyEngine';
import {
  MAX_BEAUTY_FACES,
  sanitizeDetectedFace,
  sanitizeDetectedFaces,
} from './BeautyEngine';
import {
  MAX_MASK_REGIONS,
  buildFaceMask,
  buildFaceRenderPlans,
  buildFaceMasks,
  shaderUniforms,
} from './beautyMath';
import {
  DEFAULT_BEAUTY,
  effectiveBeautySettings,
  type BeautySettings,
} from './types';

const IMAGE = Object.freeze({ width: 400, height: 400 });

const faceFixture: DetectedFace & {
  leftCheek: Point;
  rightCheek: Point;
} = {
  bounds: { x: 100, y: 80, width: 200, height: 240 },
  leftEye: { x: 160, y: 160 },
  rightEye: { x: 240, y: 160 },
  leftEyebrow: { x: 160, y: 140 },
  rightEyebrow: { x: 240, y: 140 },
  nose: { x: 200, y: 205 },
  leftNostril: { x: 190, y: 220 },
  rightNostril: { x: 210, y: 220 },
  mouth: { x: 200, y: 260 },
  facialHair: [{ x: 165, y: 275, width: 70, height: 28 }],
  leftCheek: { x: 140, y: 220 },
  rightCheek: { x: 260, y: 220 },
};

type ForbiddenBiometricField = Extract<
  keyof DetectedFace,
  'identity' | 'identityId' | 'embedding' | 'age' | 'gender' | 'ethnicity'
>;
const detectedFaceHasNoBiometricFields: ForbiddenBiometricField extends never
  ? true
  : false = true;

describe('BeautyEngine boundary', () => {
  it('exposes only capability, face detection, and final rendering operations', () => {
    const engine: BeautyEngine = {
      capabilities: async () => ({
        livePreview: true,
        finalRender: true,
        maxFaces: MAX_BEAUTY_FACES,
      }),
      detectFaces: async () => [faceFixture],
      renderFinal: async (sourceUri) => sourceUri,
    };

    expect(engine).toEqual({
      capabilities: expect.any(Function),
      detectFaces: expect.any(Function),
      renderFinal: expect.any(Function),
    });
  });

  it('accepts explicit frame and URI detection inputs', () => {
    const inputs: BeautyDetectionInput[] = [
      {
        kind: 'frame',
        frame: { nativeHandle: 'opaque' },
        imageSize: IMAGE,
        orientation: 90,
        mirrored: true,
      },
      {
        kind: 'uri',
        uri: 'file:///private/selfie.jpg',
        imageSize: IMAGE,
        orientation: 0,
      },
    ];

    expect(inputs.map((input) => input.kind)).toEqual(['frame', 'uri']);
  });

  it('does not define identity or demographic fields on detected faces', () => {
    expect(detectedFaceHasNoBiometricFields).toBe(true);
    expect(faceFixture).not.toHaveProperty('identity');
    expect(faceFixture).not.toHaveProperty('embedding');
    expect(faceFixture).not.toHaveProperty('age');
    expect(faceFixture).not.toHaveProperty('gender');
    expect(faceFixture).not.toHaveProperty('ethnicity');
  });
});

describe('detected-face privacy sanitizer', () => {
  it('returns a fresh plain allow-listed face and strips private extras', () => {
    const nativeFace = {
      ...faceFixture,
      bounds: { ...faceFixture.bounds },
      trackingId: 'track-42',
      identity: 'person-7',
      embedding: [0.1, 0.2],
      age: 29,
      gender: 'female',
      ethnicity: 'unknown',
      geometry: { jaw: 1 },
    };

    const sanitized = sanitizeDetectedFace(nativeFace);

    expect(sanitized).toEqual({
      bounds: faceFixture.bounds,
      leftEye: faceFixture.leftEye,
      rightEye: faceFixture.rightEye,
      leftEyebrow: faceFixture.leftEyebrow,
      rightEyebrow: faceFixture.rightEyebrow,
      nose: faceFixture.nose,
      leftNostril: faceFixture.leftNostril,
      rightNostril: faceFixture.rightNostril,
      mouth: faceFixture.mouth,
      facialHair: faceFixture.facialHair,
    });
    expect(sanitized).not.toBe(nativeFace);
    expect(sanitized?.bounds).not.toBe(nativeFace.bounds);
    expect(Object.getPrototypeOf(sanitized!)).toBe(Object.prototype);
    expect(Object.keys(sanitized!)).toEqual([
      'bounds',
      'leftEye',
      'rightEye',
      'leftEyebrow',
      'rightEyebrow',
      'nose',
      'leftNostril',
      'rightNostril',
      'mouth',
      'facialHair',
    ]);
    expect(sanitized).not.toHaveProperty('trackingId');
    expect(sanitized).not.toHaveProperty('identity');
    expect(sanitized).not.toHaveProperty('embedding');
    expect(sanitized).not.toHaveProperty('age');
    expect(sanitized).not.toHaveProperty('gender');
    expect(sanitized).not.toHaveProperty('ethnicity');
    expect(sanitized).not.toHaveProperty('geometry');
  });

  it('never invokes face, point, bounds, or list accessors', () => {
    let getterCalls = 0;
    const accessorPoint = Object.defineProperty({}, 'x', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 160;
      },
    });
    const accessorFace = Object.defineProperties(
      {},
      {
        bounds: {
          enumerable: true,
          value: { x: 100, y: 80, width: 200, height: 240 },
        },
        leftEye: {
          enumerable: true,
          value: accessorPoint,
        },
        identity: {
          enumerable: true,
          get() {
            getterCalls += 1;
            return 'secret';
          },
        },
        mouth: {
          enumerable: true,
          get() {
            getterCalls += 1;
            return { x: 200, y: 260 };
          },
        },
        facialHair: {
          enumerable: true,
          value: Object.defineProperty([], '0', {
            get() {
              getterCalls += 1;
              return { x: 160, y: 270, width: 80, height: 20 };
            },
          }),
        },
      },
    );

    expect(sanitizeDetectedFace(accessorFace)).toEqual({
      bounds: { x: 100, y: 80, width: 200, height: 240 },
      facialHair: [],
    });
    expect(getterCalls).toBe(0);
  });

  it('fails closed for hostile proxies and caps native face lists', () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('hostile descriptor trap');
        },
      },
    );
    const manyFaces = Array.from(
      { length: MAX_BEAUTY_FACES + 20 },
      () => faceFixture,
    );

    expect(() => sanitizeDetectedFace(hostile)).not.toThrow();
    expect(sanitizeDetectedFace(hostile)).toBeNull();
    expect(sanitizeDetectedFaces(manyFaces)).toHaveLength(MAX_BEAUTY_FACES);
    expect(sanitizeDetectedFaces(hostile)).toEqual([]);
  });

  it('sanitizes unknown native inputs before mask and plan construction', () => {
    const nativeFace = {
      ...faceFixture,
      identity: 'must-not-survive',
      embedding: [1, 2, 3],
    };

    const mask = buildFaceMask(nativeFace, IMAGE);
    const plans = buildFaceRenderPlans(
      [nativeFace],
      IMAGE,
      DEFAULT_BEAUTY,
    );

    expect(mask?.faceBounds).toEqual(faceFixture.bounds);
    expect(mask).not.toHaveProperty('identity');
    expect(mask).not.toHaveProperty('embedding');
    expect(plans).toHaveLength(1);
  });
});

describe('face mask geometry', () => {
  it('keeps eye, eyebrow, nose, nostril, mouth, and facial-hair regions out', () => {
    const mask = buildFaceMask(faceFixture, IMAGE);

    expect(mask).not.toBeNull();
    expect(mask?.contains(faceFixture.leftEye!)).toBe(false);
    expect(mask?.contains(faceFixture.rightEye!)).toBe(false);
    expect(mask?.contains(faceFixture.leftEyebrow!)).toBe(false);
    expect(mask?.contains(faceFixture.rightEyebrow!)).toBe(false);
    expect(mask?.contains(faceFixture.nose!)).toBe(false);
    expect(mask?.contains(faceFixture.leftNostril!)).toBe(false);
    expect(mask?.contains(faceFixture.rightNostril!)).toBe(false);
    expect(mask?.contains(faceFixture.mouth!)).toBe(false);
    expect(mask?.contains({ x: 200, y: 285 })).toBe(false);
  });

  it('keeps both cheeks inside the inset feathered oval', () => {
    const mask = buildFaceMask(faceFixture, IMAGE);

    expect(mask).not.toBeNull();
    if (!mask) throw new Error('expected a valid face mask');
    expect(mask.contains(faceFixture.leftCheek)).toBe(true);
    expect(mask.contains(faceFixture.rightCheek)).toBe(true);
    expect(mask.coverage.kind).toBe('ellipse');
    expect(mask.coverage.feather).toBeGreaterThan(0);
    expect(mask.coverage.center.x - mask.coverage.radiusX).toBeGreaterThan(
      faceFixture.bounds.x,
    );
    expect(mask.coverage.center.x + mask.coverage.radiusX).toBeLessThan(
      faceFixture.bounds.x + faceFixture.bounds.width,
    );
  });

  it('uses inward outer feather coverage with a documented half threshold', () => {
    const mask = buildFaceMask(
      { bounds: { x: 100, y: 80, width: 200, height: 240 } },
      IMAGE,
    );

    expect(mask).not.toBeNull();
    if (!mask) throw new Error('expected a valid face mask');
    const boundaryX = mask.coverage.center.x + mask.coverage.radiusX;
    const halfwayX = boundaryX - mask.coverage.feather / 2;
    const interiorX = boundaryX - mask.coverage.feather;

    expect(mask.coverageAt({ x: boundaryX, y: mask.coverage.center.y })).toBe(0);
    expect(
      mask.coverageAt({ x: halfwayX, y: mask.coverage.center.y }),
    ).toBeCloseTo(0.5);
    expect(
      mask.coverageAt({ x: interiorX, y: mask.coverage.center.y }),
    ).toBe(1);
    expect(mask.contains({ x: halfwayX, y: mask.coverage.center.y })).toBe(
      false,
    );
  });

  it('feathers feature exclusions from protected center to boundary', () => {
    const mask = buildFaceMask(
      {
        bounds: faceFixture.bounds,
        leftEye: faceFixture.leftEye,
      },
      IMAGE,
    );

    expect(mask).not.toBeNull();
    if (!mask) throw new Error('expected a valid face mask');
    const eye = mask.exclusions[0];
    const boundaryX = eye.center.x + eye.radiusX;
    const halfwayX = boundaryX - eye.feather / 2;

    expect(mask.coverageAt(eye.center)).toBe(0);
    expect(mask.coverageAt({ x: halfwayX, y: eye.center.y })).toBeCloseTo(0.5);
    expect(mask.coverageAt({ x: boundaryX, y: eye.center.y })).toBe(1);
  });

  it('uses canonical unmirrored image pixels and leaves mirroring to adapters', () => {
    const mask = buildFaceMask(faceFixture, IMAGE);

    expect(mask?.coordinateSpace).toBe(
      'canonical-unmirrored-image-pixels',
    );
    expect(mask?.faceBounds).toEqual(faceFixture.bounds);
    expect(mask?.contains({ x: 140, y: 220 })).toBe(true);
  });

  it('omits unavailable landmark exclusions while retaining the face oval', () => {
    const mask = buildFaceMask(
      { bounds: { x: 100, y: 80, width: 200, height: 240 } },
      IMAGE,
    );

    expect(mask?.exclusions).toEqual([]);
    expect(mask?.contains({ x: 200, y: 200 })).toBe(true);
  });

  it('clamps partly off-image face bounds but rejects outlier landmarks', () => {
    const face: DetectedFace = {
      bounds: { x: -30, y: 350, width: 100, height: 100 },
      leftEye: { x: -20, y: 370 },
      mouth: { x: 999, y: 999 },
    };

    const mask = buildFaceMask(face, IMAGE);

    expect(mask?.faceBounds).toEqual({
      x: 0,
      y: 350,
      width: 70,
      height: 50,
    });
    expect(mask?.exclusions).toEqual([]);
  });

  it.each([
    { x: 20, y: 20, width: -1, height: 30 },
    { x: 20, y: 20, width: 30, height: -1 },
    { x: Number.NaN, y: 20, width: 30, height: 30 },
    { x: 20, y: 20, width: Number.NaN, height: 30 },
    { x: 500, y: 500, width: 30, height: 30 },
  ])('ignores an invalid face bounds value %#', (bounds) => {
    expect(buildFaceMask({ bounds }, IMAGE)).toBeNull();
  });

  it('ignores malformed landmarks instead of emitting invalid regions', () => {
    const mask = buildFaceMask(
      {
        bounds: { x: 100, y: 80, width: 200, height: 240 },
        leftEye: { x: Number.NaN, y: 100 },
        rightEye: { x: 240, y: Number.POSITIVE_INFINITY },
        mouth: { x: -100, y: 900 },
        facialHair: [
          { x: 100, y: 100, width: -1, height: 20 },
          { x: Number.NaN, y: 100, width: 20, height: 20 },
        ],
      },
      IMAGE,
    );

    expect(mask?.exclusions).toEqual([]);
  });

  it('does not turn a far edge-face mouth outlier into an exclusion', () => {
    const mask = buildFaceMask(
      {
        bounds: { x: -15, y: 120, width: 95, height: 130 },
        leftEye: { x: 30, y: 165 },
        mouth: { x: 390, y: 390 },
      },
      IMAGE,
    );

    expect(mask?.exclusions).toHaveLength(1);
    expect(mask?.exclusions[0].center).toEqual({ x: 30, y: 165 });
  });

  it('caps face and region counts to bound untrusted detector work', () => {
    const manyFaces = Array.from(
      { length: MAX_BEAUTY_FACES + 50 },
      (_, index): DetectedFace => ({
        ...faceFixture,
        bounds: {
          x: 100 + (index % 2),
          y: 80,
          width: 200,
          height: 240,
        },
        facialHair: Array.from(
          { length: MAX_MASK_REGIONS + 50 },
          () => ({ x: 170, y: 270, width: 60, height: 20 }),
        ),
      }),
    );

    const masks = buildFaceMasks(manyFaces, IMAGE);

    expect(masks).toHaveLength(MAX_BEAUTY_FACES);
    expect(
      masks.every((mask) => mask.exclusions.length <= MAX_MASK_REGIONS - 1),
    ).toBe(true);
  });

  it('returns no masks for no faces or an invalid image size', () => {
    expect(buildFaceMasks([], IMAGE)).toEqual([]);
    expect(buildFaceMasks([faceFixture], { width: 0, height: 400 })).toEqual([]);
    expect(
      buildFaceMasks([faceFixture], {
        width: Number.NaN,
        height: 400,
      }),
    ).toEqual([]);
  });

  it('is deterministic, fresh, and never aliases mutable detector input', () => {
    const input: DetectedFace = {
      ...faceFixture,
      bounds: { ...faceFixture.bounds },
      facialHair: faceFixture.facialHair?.map((region) => ({ ...region })),
    };
    const snapshot = JSON.parse(JSON.stringify(input)) as DetectedFace;

    const first = buildFaceMask(input, IMAGE);
    const second = buildFaceMask(input, IMAGE);

    expect(input).toEqual(snapshot);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first?.coverage).not.toBe(second?.coverage);
    expect(first?.exclusions).not.toBe(second?.exclusions);
    expect(first?.faceBounds).not.toBe(input.bounds);
  });
});

describe('beauty shader strength mapping', () => {
  it('maps the approved 20 percent smooth default to about 0.12', () => {
    expect(shaderUniforms(DEFAULT_BEAUTY).smoothAmount).toBeCloseTo(0.12);
  });

  it('maps zero and disabled settings to zero beauty amounts', () => {
    const zero: BeautySettings = {
      ...DEFAULT_BEAUTY,
      overall: 0,
    };
    const disabled: BeautySettings = {
      ...DEFAULT_BEAUTY,
      enabled: false,
      overall: 100,
    };

    expect(shaderUniforms(zero)).toEqual({
      smoothAmount: 0,
      blemishAmount: 0,
      shineAmount: 0,
      underEyeAmount: 0,
      lightingAmount: 0,
    });
    expect(shaderUniforms(disabled)).toEqual(shaderUniforms(zero));
  });

  it('keeps all maximum mappings conservative and bounded', () => {
    const maximums: BeautySettings = {
      ...DEFAULT_BEAUTY,
      overall: 100,
      smooth: 60,
      blemish: 60,
      shine: 50,
      underEye: 40,
      lighting: 40,
    };

    expect(shaderUniforms(maximums)).toEqual({
      smoothAmount: 0.36,
      blemishAmount: 0.24,
      shineAmount: 0.2,
      underEyeAmount: 0.15,
      lightingAmount: 0.12,
    });
    expect(
      Object.values(shaderUniforms(maximums)).every(
        (value) => value >= 0 && value <= 0.36,
      ),
    ).toBe(true);
  });

  it('returns only appearance uniforms and no coordinate warp controls', () => {
    const uniforms = shaderUniforms(DEFAULT_BEAUTY);

    expect(Object.keys(uniforms)).toEqual([
      'smoothAmount',
      'blemishAmount',
      'shineAmount',
      'underEyeAmount',
      'lightingAmount',
    ]);
    expect(uniforms).not.toHaveProperty('faceSlim');
    expect(uniforms).not.toHaveProperty('eyeSize');
    expect(uniforms).not.toHaveProperty('geometry');
    expect(uniforms).not.toHaveProperty('warp');
  });

  it('returns fresh deterministic uniforms without mutating settings', () => {
    const settings = { ...DEFAULT_BEAUTY };
    const snapshot = { ...settings };

    const first = shaderUniforms(settings);
    const second = shaderUniforms(settings);

    expect(settings).toEqual(snapshot);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it('maps already-effective settings to exactly the same uniforms', () => {
    const settings: BeautySettings = {
      ...DEFAULT_BEAUTY,
      overall: 40,
      smooth: 18,
      blemish: 12,
    };

    expect(shaderUniforms(effectiveBeautySettings(settings))).toEqual(
      shaderUniforms(settings),
    );
  });
});

describe('multi-face render plans', () => {
  it('applies identical settings to every valid detected face', () => {
    const settings: BeautySettings = {
      ...DEFAULT_BEAUTY,
      smooth: 30,
      blemish: 10,
    };
    const faces: DetectedFace[] = [
      faceFixture,
      {
        bounds: { x: 20, y: 30, width: 80, height: 100 },
        mouth: { x: 60, y: 100 },
      },
    ];

    const plans = buildFaceRenderPlans(faces, IMAGE, settings);

    expect(plans).toHaveLength(2);
    expect(plans[0].uniforms).toEqual(plans[1].uniforms);
    expect(plans[0].uniforms).not.toBe(plans[1].uniforms);
    expect(plans[0].mask).not.toBe(plans[1].mask);
  });

  it('returns no render plans when no faces are detected', () => {
    expect(buildFaceRenderPlans([], IMAGE, DEFAULT_BEAUTY)).toEqual([]);
  });
});
