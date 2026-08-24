import { describe, expect, test } from '@jest/globals';

import { openMapRunLayout } from './runTrackerLayout';

const VIEWPORTS = [
  { width: 320, height: 568, expectedGutter: 16 },
  { width: 390, height: 844, expectedGutter: 24 },
  { width: 430, height: 932, expectedGutter: 24 },
] as const;

const FONT_SCALES = [1, 1.3, 2] as const;

const CASES = VIEWPORTS.flatMap((viewport) =>
  FONT_SCALES.map((fontScale) => ({
    ...viewport,
    fontScale,
    safeTop: 24,
    safeBottom: 20,
  })),
);

describe('openMapRunLayout', () => {
  test.each(CASES)(
    'keeps $width×$height at $fontScale× text ordered and inside the safe viewport',
    ({ width, height, fontScale, safeTop, safeBottom, expectedGutter }) => {
      const layout = openMapRunLayout({ width, height, fontScale, safeTop, safeBottom });

      expect(layout.gutter).toBe(expectedGutter);
      expect(layout.contentWidth).toBeGreaterThan(0);
      expect(layout.contentWidth).toBeLessThanOrEqual(width - layout.gutter * 2);
      expect(layout.contentWidth).toBeLessThanOrEqual(560);
      expect(layout.controlSize).toBeGreaterThanOrEqual(48);
      expect(layout.ctaHeight).toBeGreaterThanOrEqual(58);
      expect(layout.bottomDockBottom).toBe(Math.max(safeBottom, 12) + 16);
      expect(layout.metricFontSize).toBeGreaterThan(0);
      expect(layout.metricLineHeight).toBeGreaterThan(layout.metricFontSize);
      expect(layout.metricGap).toBeGreaterThan(0);
      expect(layout.metricGap).toBeLessThan(layout.contentWidth);
      expect(layout.largeText).toBe(fontScale >= 1.3);

      expect(layout.statusTop).toBeGreaterThanOrEqual(safeTop);
      expect(layout.statusHeight).toBeGreaterThan(0);
      expect(layout.metricBandTop).toBeGreaterThan(layout.statusTop + layout.statusHeight);
      expect(layout.secondaryRailBottom).toBeGreaterThanOrEqual(
        layout.metricBandTop + layout.metricLineHeight,
      );
      expect(layout.ctaTop).toBeGreaterThan(layout.secondaryRailBottom);
      expect(layout.ctaTop + layout.ctaHeight + layout.bottomDockBottom).toBeLessThanOrEqual(
        height,
      );
    },
  );

  test('uses the approved 390×844 baseline geometry', () => {
    const layout = openMapRunLayout({
      width: 390,
      height: 844,
      fontScale: 1,
      safeTop: 24,
      safeBottom: 20,
    });

    expect(layout.gutter).toBe(24);
    expect(layout.contentWidth).toBe(342);
    expect(layout.controlSize).toBe(48);
    expect(layout.metricFontSize).toBe(54);
    expect(layout.metricLineHeight).toBe(60);
    expect(layout.statusTop).toBe(532);
    expect(layout.statusHeight).toBe(48);
    expect(layout.metricBandTop).toBe(592);
    expect(layout.secondaryRailBottom).toBe(736);
    expect(layout.ctaTop).toBe(750);
    expect(layout.ctaHeight).toBe(58);
    expect(layout.bottomDockBottom).toBe(36);
  });

  test('uses compact metrics at 320 points without shrinking controls', () => {
    const normal = openMapRunLayout({
      width: 320,
      height: 568,
      fontScale: 1,
      safeTop: 24,
      safeBottom: 20,
    });
    const largeText = openMapRunLayout({
      width: 320,
      height: 568,
      fontScale: 2,
      safeTop: 24,
      safeBottom: 20,
    });

    expect(normal.metricFontSize).toBe(48);
    expect(normal.metricLineHeight).toBe(54);
    expect(largeText.metricFontSize).toBeLessThanOrEqual(normal.metricFontSize);
    expect(largeText.controlSize).toBeGreaterThanOrEqual(normal.controlSize);
    expect(largeText.ctaHeight).toBeGreaterThanOrEqual(normal.ctaHeight);
  });

  test('caps wide-screen content at 560 points', () => {
    const layout = openMapRunLayout({
      width: 800,
      height: 932,
      fontScale: 1,
      safeTop: 24,
      safeBottom: 20,
    });

    expect(layout.contentWidth).toBe(560);
  });

  test('moves the lower overlay below an unusually tall top safe area when space permits', () => {
    const safeTop = 280;
    const layout = openMapRunLayout({
      width: 320,
      height: 568,
      fontScale: 1,
      safeTop,
      safeBottom: 20,
    });

    expect(layout.statusTop).toBeGreaterThanOrEqual(safeTop + 8 + layout.controlSize);
    expect(layout.metricBandTop).toBeGreaterThan(layout.statusTop + layout.statusHeight);
    expect(layout.secondaryRailBottom).toBeGreaterThanOrEqual(
      layout.metricBandTop + layout.metricLineHeight,
    );
  });
});
