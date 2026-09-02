import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { LegalConsentStatus } from '../auth/LegalConsentProvider';

let mockStatus: LegalConsentStatus = 'loading';
let mockError: string | null = null;
const mockAccept = jest.fn<() => Promise<void>>();
const mockRetry = jest.fn();
const mockSignOut = jest.fn<() => Promise<void>>();

jest.mock('../auth/LegalConsentProvider', () => ({
  useLegalConsent: () => ({
    status: mockStatus,
    acceptedVersion: null,
    accepting: false,
    error: mockError,
    accept: mockAccept,
    retry: mockRetry,
  }),
}));
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: () => mockSignOut() } },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('../ui/AuthShell', () => ({
  AuthShell: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../ui/Button', () => ({
  Button: ({ title, accessibilityLabel, onPress }: {
    title: string;
    accessibilityLabel: string;
    onPress: () => void;
  }) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return ReactModule.createElement(
      Pressable,
      { accessibilityLabel, onPress },
      ReactModule.createElement(Text, null, title),
    );
  },
}));
jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: {
      surface: { muted: '#111111' },
      ink: {
        primary: '#ffffff',
        secondary: '#dddddd',
        action: '#99ccff',
      },
      border: { strong: '#777777' },
      status: { danger: '#ff7777' },
    },
  }),
}));

// eslint-disable-next-line import/first -- screen loads after mutable dependency mocks
import ConsentRefresh from './consent-refresh';

async function renderScreen() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<ConsentRefresh />);
  });
  return renderer;
}

beforeEach(() => {
  mockStatus = 'loading';
  mockError = null;
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockRetry.mockReset();
  mockSignOut.mockReset().mockResolvedValue(undefined);
});

describe('consent refresh wall', () => {
  test('keeps loading signed-in members blocked with sign-out but no acceptance action', async () => {
    const renderer = await renderScreen();

    expect(renderer.root.findAllByProps({
      accessibilityLabel: 'Checking legal agreement status',
    }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({
      accessibilityLabel: 'Accept updated Terms and Privacy Policy',
    })).toHaveLength(0);
    expect(renderer.root.findAllByProps({
      accessibilityLabel: 'Retry legal agreement check',
    })).toHaveLength(0);

    await act(async () => {
      renderer.root.findAllByProps({ accessibilityLabel: 'Sign out instead' })[0].props.onPress();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockAccept).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  test('offers retry and sign-out after an offline agreement check', async () => {
    mockStatus = 'error';
    mockError = 'We could not check your legal agreement status. Check your connection and try again.';
    const renderer = await renderScreen();

    expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' }).length).toBeGreaterThan(0);
    await act(async () => {
      renderer.root.findAllByProps({
        accessibilityLabel: 'Retry legal agreement check',
      })[0].props.onPress();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({
      accessibilityLabel: 'Sign out instead',
    }).length).toBeGreaterThan(0);
    expect(mockAccept).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
