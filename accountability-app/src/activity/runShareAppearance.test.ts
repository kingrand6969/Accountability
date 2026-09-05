import { describe, expect, test } from '@jest/globals';

import {
  RUN_SHARE_FONTS,
  RUN_SHARE_LAYOUTS,
  createDefaultRunShareAppearance,
  completedRunTimestamp,
  formatRunCardTimestamp,
  runCardThemeForLocalHour,
  runCardTitle,
  routeEndpointVisibilityIntent,
} from './runShareAppearance';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const shareSheetSource = readFileSync(
  path.resolve(__dirname, 'RunShareSheet.tsx'),
  'utf8',
);

describe('approved Run share appearance', () => {
  test('offers the five approved layouts in the approved order', () => {
    expect(RUN_SHARE_LAYOUTS).toEqual([
      { id: 'center-stack', label: 'Center Stack' },
      { id: 'right-rail', label: 'Right Rail' },
      { id: 'data-horizon', label: 'Data Horizon' },
      { id: 'editorial-stack', label: 'Editorial Stack' },
      { id: 'map-focus', label: 'Map Focus' },
    ]);
  });

  test('offers the four approved Basic font choices without Smooth', () => {
    expect(RUN_SHARE_FONTS).toEqual([
      { id: 'momentum', label: 'Momentum' },
      { id: 'classic', label: 'Classic' },
      { id: 'strong', label: 'Strong' },
      { id: 'street', label: 'Street' },
    ]);
    expect(RUN_SHARE_FONTS.some((font) => String(font.label) === 'Smooth')).toBe(false);
  });

  test.each([5, 10, 18, 23])(
    'defaults to permanent dark chrome at local hour %i while retaining layout and privacy defaults',
    (localHour) => {
    expect(createDefaultRunShareAppearance('2026-08-23T10:18:00.000Z', 10)).toEqual({
      layout: 'map-focus',
      font: 'momentum',
      showTimestamp: true,
      showEndpoints: false,
      theme: 'dark',
      completedAt: '2026-08-23T10:18:00.000Z',
    });
      expect(createDefaultRunShareAppearance(
        '2026-08-23T10:18:00.000Z',
        localHour,
      ).theme).toBe('dark');
    },
  );

  test('does not select light share chrome from the recorded completion hour', () => {
    expect(runCardThemeForLocalHour(10)).toBe('dark');
    expect(runCardThemeForLocalHour(18)).toBe('dark');
    expect(runCardThemeForLocalHour(19)).toBe('dark');
    expect(runCardThemeForLocalHour(5)).toBe('dark');
  });

  test('share editor chrome uses the permanent semantic dark palette', () => {
    expect(shareSheetSource).toContain("const palette = themeColors('dark')");
    expect(shareSheetSource).toContain('backgroundColor: palette.surface.canvas');
    expect(shareSheetSource).toContain('backgroundColor: palette.surface.card');
    expect(shareSheetSource).toContain('borderColor: palette.border.subtle');
    expect(shareSheetSource).toContain('color: palette.ink.primary');
    expect(shareSheetSource).toContain('color: palette.ink.muted');
    expect(shareSheetSource).not.toContain("theme === 'day'");
  });

  test('formats the saved run timestamp without changing the duration metric', () => {
    expect(formatRunCardTimestamp('2026-08-23T10:18:00.000Z', 'en-AU', 'Australia/Perth'))
      .toBe('23 AUGUST · 6:18 PM');
  });

  test('derives a stable completion instant from the saved start and duration', () => {
    expect(completedRunTimestamp('2026-08-23T10:00:00.000Z', 1458))
      .toBe('2026-08-23T10:24:18.000Z');
  });

  test('names the card from the recorded weekday and activity', () => {
    expect(runCardTitle('run', '2026-08-23T10:18:00.000Z', 'en-AU', 'Australia/Perth'))
      .toBe('Sunday Run');
  });

  test('requires privacy confirmation only before exposing route endpoints', () => {
    expect(routeEndpointVisibilityIntent(false)).toEqual({ next: true, requiresConfirmation: true });
    expect(routeEndpointVisibilityIntent(true)).toEqual({ next: false, requiresConfirmation: false });
  });
});
