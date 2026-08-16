import { describe, expect, test } from '@jest/globals';

import { BUDDY_CARD_PALETTES, resolveBuddyCardPalette } from './palette';

const EXPECTED_PALETTES = {
  polar_blue: {
    light: {
      accent: '#1768EF',
      accentSecondary: '#45C9ED',
      surface: '#FFFFFF',
      surfaceTint: '#EDF5FF',
      canvas: '#EDF2F7',
      text: '#13253E',
      textMuted: '#6B7B91',
      border: '#DCE6F0',
    },
    dark: {
      accent: '#6EA8FF',
      accentSecondary: '#63D7EE',
      surface: '#101B2B',
      surfaceTint: '#142946',
      canvas: '#09111D',
      text: '#F4F8FF',
      textMuted: '#A8B8CC',
      border: '#2B3B50',
    },
  },
  victory_ember: {
    light: {
      accent: '#E14D36',
      accentSecondary: '#FF9D4D',
      surface: '#FFFFFF',
      surfaceTint: '#FFF1EC',
      canvas: '#F4EFEC',
      text: '#2E1A18',
      textMuted: '#806761',
      border: '#EADDD8',
    },
    dark: {
      accent: '#FF826C',
      accentSecondary: '#FFB368',
      surface: '#241714',
      surfaceTint: '#38201B',
      canvas: '#160E0C',
      text: '#FFF6F2',
      textMuted: '#D0AFA7',
      border: '#55332C',
    },
  },
  momentum_teal: {
    light: {
      accent: '#0D9276',
      accentSecondary: '#55D6B3',
      surface: '#FFFFFF',
      surfaceTint: '#EAFAF5',
      canvas: '#EDF5F2',
      text: '#12352E',
      textMuted: '#607C75',
      border: '#D5E8E2',
    },
    dark: {
      accent: '#4DD6B4',
      accentSecondary: '#78E5C9',
      surface: '#10211D',
      surfaceTint: '#15352D',
      canvas: '#091511',
      text: '#F1FFF9',
      textMuted: '#A3C5BB',
      border: '#285046',
    },
  },
  power_violet: {
    light: {
      accent: '#7357D8',
      accentSecondary: '#B78CFF',
      surface: '#FFFFFF',
      surfaceTint: '#F2EFFF',
      canvas: '#F0EEF5',
      text: '#241D3B',
      textMuted: '#756D8B',
      border: '#E1DDEC',
    },
    dark: {
      accent: '#A993FF',
      accentSecondary: '#C8AAFF',
      surface: '#1C172B',
      surfaceTint: '#2C2345',
      canvas: '#100D19',
      text: '#FAF7FF',
      textMuted: '#BEB3D5',
      border: '#44385E',
    },
  },
} as const;

describe('Buddy Card palettes', () => {
  test('defines exactly the four approved palette keys', () => {
    expect(Object.keys(BUDDY_CARD_PALETTES)).toEqual([
      'polar_blue',
      'victory_ember',
      'momentum_teal',
      'power_violet',
    ]);
  });

  test.each(Object.entries(EXPECTED_PALETTES))(
    'resolves every light and dark token for %s',
    (key, expected) => {
      expect(resolveBuddyCardPalette(key, 'light')).toEqual(expected.light);
      expect(resolveBuddyCardPalette(key, 'dark')).toEqual(expected.dark);
    },
  );

  test.each([undefined, null, 'unknown', 42, {}, []])(
    'falls back to polar blue for an unsupported value (%p)',
    (value) => {
      expect(resolveBuddyCardPalette(value, 'light')).toEqual(
        EXPECTED_PALETTES.polar_blue.light,
      );
    },
  );
});
