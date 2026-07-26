import { describe, expect, it } from '@jest/globals';
import {
  BEAUTY_MEMORY_BUDGET,
  BEAUTY_RENDER_CHILDREN,
  BEAUTY_RENDER_UNIFORMS,
  assertBeautyOutputBytes,
  assertBeautySourceBytes,
  buildBeautyRenderPlan,
  buildMaskRasterPlan,
  commitBeautyOutput,
  createBeautyResourceScope,
  createBeautyOutputUri,
  estimateBeautyWorkingBytes,
  planBeautyResize,
} from './renderBeautyImage.native';
import { BEAUTY_SHADER_CHILDREN, buildBeautyShaderUniforms } from './beautyShader';
import { referenceBeautyPixel } from './beautyShader';
import { DEFAULT_BEAUTY } from './types';

describe('beauty final render contract', () => {
  it('no-face renders retain the global color look with zero beauty masks', () => {
    expect(buildBeautyRenderPlan([])).toEqual({
      applyColorLook: true,
      skinMaskFaces: [],
      underEyeMaskFaces: [],
    });
  });

  it('binds every SkSL child and numeric uniform', () => {
    expect(BEAUTY_RENDER_CHILDREN).toBe(BEAUTY_SHADER_CHILDREN);
    expect(BEAUTY_RENDER_CHILDREN).toEqual([
      'image',
      'skinMask',
      'underEyeMask',
    ]);
    expect(BEAUTY_RENDER_UNIFORMS).toEqual([
      'smoothAmount',
      'blemishAmount',
      'shineAmount',
      'underEyeAmount',
      'lightingAmount',
      'saturation',
      'contrast',
      'brightness',
      'redGain',
      'greenGain',
      'blueGain',
      'highlightCompression',
    ]);
  });

  it('applies the color look globally when face masks are zero', () => {
    const uniforms = buildBeautyShaderUniforms(DEFAULT_BEAUTY);
    const result = referenceBeautyPixel({
      original: [0.4, 0.3, 0.2, 1],
      skinMask: 0,
      underEyeMask: 0,
      uniforms,
      neighborhood: [],
    });

    expect(result.pixel).not.toEqual([0.4, 0.3, 0.2, 1]);
    expect(result.sampledNeighbors).toBe(0);
  });

  it('creates unique JPEG paths directly in managed run-share cache', () => {
    const randomValues = [0.1, 0.2];
    const random = () => randomValues.shift() ?? 0.3;
    const first = createBeautyOutputUri('file:///cache/', 123, random);
    const second = createBeautyOutputUri('file:///cache/', 123, random);

    expect(first).toMatch(/^file:\/\/\/cache\/run-share\/beauty-123-/);
    expect(first).toMatch(/\.jpg$/);
    expect(second).not.toBe(first);
  });
});

describe('beauty memory budget', () => {
  it('documents a conservative seven-RGBA-buffer working set', () => {
    expect(BEAUTY_MEMORY_BUDGET).toEqual({
      maxPixels: 4_000_000,
      maxDimension: 2_560,
      maxSourceBytes: 20 * 1024 * 1024,
      maxOutputBytes: 10 * 1024 * 1024,
      rgbaBuffers: 7,
    });
    expect(estimateBeautyWorkingBytes(4_000_000)).toBe(112_000_000);
  });

  it.each<
    [
      { width: number; height: number },
      { width: number; height: number } | null,
    ]
  >([
    [{ width: 1200, height: 800 }, null],
    [{ width: 2000, height: 2000 }, null],
    [{ width: 8000, height: 4000 }, { width: 2560, height: 1280 }],
    [{ width: 3000, height: 3000 }, { width: 2000, height: 2000 }],
  ])('plans bounded resize for %o', (source, expected) => {
    expect(planBeautyResize(source)).toEqual(expected);
  });

  it('accepts the source byte boundary and rejects one byte over', () => {
    expect(() =>
      assertBeautySourceBytes(BEAUTY_MEMORY_BUDGET.maxSourceBytes),
    ).not.toThrow();
    expect(() =>
      assertBeautySourceBytes(BEAUTY_MEMORY_BUDGET.maxSourceBytes + 1),
    ).toThrow('too large');
  });

  it('accepts the output byte boundary and rejects one byte over', () => {
    expect(() =>
      assertBeautyOutputBytes(BEAUTY_MEMORY_BUDGET.maxOutputBytes),
    ).not.toThrow();
    expect(() =>
      assertBeautyOutputBytes(BEAUTY_MEMORY_BUDGET.maxOutputBytes + 1),
    ).toThrow('too large');
  });
});

describe('managed output transaction', () => {
  it('rejects over-cap output before write or registration', async () => {
    const writes: number[] = [];
    const registrations: string[] = [];
    await expect(
      commitBeautyOutput({
        outputUri: 'file:///cache/run-share/output.jpg',
        encodedBytes: new Uint8Array(
          BEAUTY_MEMORY_BUDGET.maxOutputBytes + 1,
        ),
        write: async (bytes) => {
          writes.push(bytes.length);
        },
        register: async (uri) => {
          registrations.push(uri);
          return { id: 'x', uri };
        },
        releaseRegistered: async () => {},
        deleteOutput: async () => {},
      }),
    ).rejects.toThrow('too large');
    expect(writes).toEqual([]);
    expect(registrations).toEqual([]);
  });

  it('deletes only the operation output when registration fails', async () => {
    const deleted: string[] = [];
    const sourceUri = 'file:///user/source.jpg';
    await expect(
      commitBeautyOutput({
        outputUri: 'file:///cache/run-share/output.jpg',
        encodedBytes: new Uint8Array([1, 2, 3]),
        write: async () => {},
        register: async () => {
          throw new Error('register failed');
        },
        releaseRegistered: async () => {},
        deleteOutput: async (uri) => {
          deleted.push(uri);
        },
      }),
    ).rejects.toThrow('register failed');
    expect(deleted).toEqual(['file:///cache/run-share/output.jpg']);
    expect(deleted).not.toContain(sourceUri);
  });

  it('deletes a partially written operation output when writing fails', async () => {
    const deleted: string[] = [];
    await expect(
      commitBeautyOutput({
        outputUri: 'file:///cache/run-share/output.jpg',
        encodedBytes: new Uint8Array([1, 2, 3]),
        write: async () => {
          throw new Error('disk full');
        },
        register: async (uri) => ({ id: 'x', uri }),
        releaseRegistered: async () => {},
        deleteOutput: async (uri) => {
          deleted.push(uri);
        },
      }),
    ).rejects.toThrow('disk full');
    expect(deleted).toEqual(['file:///cache/run-share/output.jpg']);
  });

  it('cleans a written output when aborted before registration', async () => {
    const controller = new AbortController();
    const deleted: string[] = [];
    await expect(
      commitBeautyOutput({
        outputUri: 'file:///cache/run-share/output.jpg',
        encodedBytes: new Uint8Array([1]),
        signal: controller.signal,
        write: async () => {
          controller.abort();
        },
        register: async (uri) => ({ id: 'x', uri }),
        releaseRegistered: async () => {},
        deleteOutput: async (uri) => {
          deleted.push(uri);
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(deleted).toEqual(['file:///cache/run-share/output.jpg']);
  });

  it('releases a registered lease when aborted during registration', async () => {
    const controller = new AbortController();
    const released: string[] = [];
    const deleted: string[] = [];
    await expect(
      commitBeautyOutput({
        outputUri: 'file:///cache/run-share/output.jpg',
        encodedBytes: new Uint8Array([1]),
        signal: controller.signal,
        write: async () => {},
        register: async (uri) => {
          controller.abort();
          return { id: 'lease-1', uri };
        },
        releaseRegistered: async (id) => {
          released.push(id);
        },
        deleteOutput: async (uri) => {
          deleted.push(uri);
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(released).toEqual(['lease-1']);
    expect(deleted).toEqual([]);
  });
});

describe('renderer resources and masks', () => {
  it('disposes tracked resources in reverse order after failure', () => {
    const disposed: string[] = [];
    const scope = createBeautyResourceScope();
    scope.track({ dispose: () => disposed.push('first') });
    scope.track({ dispose: () => disposed.push('second') });
    scope.dispose();
    expect(disposed).toEqual(['second', 'first']);
  });

  it('plans face, exclusion, and under-eye mask rasters', () => {
    const plan = buildMaskRasterPlan([
      {
        bounds: { x: 10, y: 20, width: 100, height: 120 },
        leftEye: { x: 40, y: 60 },
        rightEye: { x: 80, y: 60 },
        mouth: { x: 60, y: 110 },
        facialHair: [{ x: 40, y: 100, width: 40, height: 20 }],
      },
    ]);

    expect(plan.skin).toHaveLength(1);
    expect(plan.exclusions).toHaveLength(4);
    expect(plan.underEyes).toHaveLength(2);
  });
});
