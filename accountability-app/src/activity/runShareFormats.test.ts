import { describe, expect, it } from '@jest/globals';
import { runShareExportSize, runShareRatio } from './runShareFormats';

describe('Run share formats', () => {
  it('uses the selected social orientation', () => {
    expect(runShareRatio('portrait')).toBeCloseTo(9 / 16);
    expect(runShareExportSize('feed')).toEqual({ width: 1080, height: 1350 });
    expect(runShareExportSize('square')).toEqual({ width: 1080, height: 1080 });
    expect(runShareExportSize('landscape')).toEqual({ width: 1920, height: 1080 });
  });

  it('preserves a safe original media ratio', () => {
    expect(runShareRatio('original', 3 / 2)).toBeCloseTo(1.5);
    expect(runShareRatio('original', 10)).toBe(2);
    expect(runShareRatio('original', 0.1)).toBe(0.5);
    expect(runShareRatio('original', null)).toBeCloseTo(4 / 5);
  });
});
