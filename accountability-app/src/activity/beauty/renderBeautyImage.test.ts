import { describe, expect, it } from '@jest/globals';
import {
  BEAUTY_RENDER_CHILDREN,
  BEAUTY_RENDER_UNIFORMS,
  buildBeautyRenderPlan,
  createBeautyOutputUri,
} from './renderBeautyImage.native';

describe('beauty final render contract', () => {
  it('no-face renders retain the global color look with zero beauty masks', () => {
    expect(buildBeautyRenderPlan([])).toEqual({
      applyColorLook: true,
      skinMaskFaces: [],
      underEyeMaskFaces: [],
    });
  });

  it('binds every SkSL child and numeric uniform', () => {
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
