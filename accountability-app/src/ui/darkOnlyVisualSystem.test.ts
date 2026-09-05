import { describe, expect, test } from '@jest/globals';

import {
  resolveAppThemeMode,
  themeColors,
  type AppThemeColors,
} from './theme';

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => (
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  ));
  const linear = channels.map((channel) => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(foreground: string, background: string, opacity: number) {
  const channel = (hex: string, offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
  const blended = [1, 3, 5].map((offset) => Math.round(
    (channel(foreground, offset) * opacity) + (channel(background, offset) * (1 - opacity)),
  ));
  return `#${blended.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

const expectedDarkFoundation = {
  surface: {
    canvas: '#0B0D0B',
    card: '#121512',
    raised: '#181C18',
    muted: '#202520',
    inverse: '#0B0D0B',
  },
  ink: {
    primary: '#F7F8F4',
    secondary: '#CED4CB',
    muted: '#9DA59D',
    inverse: '#0B0D0B',
    action: '#B9FF3D',
  },
  border: {
    subtle: '#272D27',
    strong: '#465046',
    action: '#B9FF3D',
    danger: '#dc2626',
  },
} as const;

const legacyThemeInputs: Array<[label: string, value: unknown]> = [
  ['undefined', undefined],
  ['null', null],
  ['light', 'light'],
  ['dark', 'dark'],
  ['system', 'system'],
  ['legacy object', { mode: 'light', source: 'legacy' }],
];

describe('permanent dark visual system public boundary', () => {
  test.each(legacyThemeInputs)('normalizes %s input to the same dark palette', (_label, value) => {
    const mode = resolveAppThemeMode(value);
    const palette = (themeColors as (candidate: unknown) => AppThemeColors)(value);

    expect(mode).toBe('dark');
    expect(palette).toBe(themeColors('dark'));
    expect(palette).toMatchObject(expectedDarkFoundation);
  });

  test('meets text, action, meaningful border, and status contrast requirements', () => {
    const palette = themeColors('dark');

    for (const surface of [palette.surface.canvas, palette.surface.card, palette.surface.raised]) {
      expect(contrastRatio(palette.ink.primary, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.ink.secondary, surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(palette.ink.inverse, palette.ink.action)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.border.action, palette.surface.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.border.danger, palette.surface.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.status.success, palette.status.successSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.status.danger, palette.status.dangerSoft)).toBeGreaterThanOrEqual(4.5);
    expect(palette.status).toMatchObject({ attentionSoft: '#3B2B08' });
    expect(contrastRatio(palette.status.attention, palette.status.attentionSoft)).toBeGreaterThanOrEqual(4.5);
  });

  test('keeps disabled text and actions distinguishable on the canvas', () => {
    const palette = themeColors('dark');
    const { disabledOpacity } = palette.interaction;

    expect(disabledOpacity).toBeGreaterThanOrEqual(0.4);
    expect(disabledOpacity).toBeLessThanOrEqual(0.5);
    expect(contrastRatio(
      composite(palette.ink.primary, palette.surface.canvas, disabledOpacity),
      palette.surface.canvas,
    )).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(
      composite(palette.ink.action, palette.surface.canvas, disabledOpacity),
      palette.surface.canvas,
    )).toBeGreaterThanOrEqual(3);
  });
});
