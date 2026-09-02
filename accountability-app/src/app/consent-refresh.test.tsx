import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { LegalConsentStatus } from '../auth/LegalConsentProvider';

let mockStatus: LegalConsentStatus = 'loading';
let mockError: string | null = null;
const mockAccept = jest.fn<() => Promise<void>>();
const mockRetry = jest.fn();
const mockSignOut = jest.fn<() => Promise<{ error: Error | null }>>();
const mockRouterPush = jest.fn();
const mockBackRemove = jest.fn();
let mockFocused = true;
let mockFocusEpoch = 0;
let mockHardwareBackHandler: (() => boolean | null | undefined) | null = null;

jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
  mockHardwareBackHandler = handler;
  return {
    remove: () => {
      mockBackRemove();
      if (mockHardwareBackHandler === handler) mockHardwareBackHandler = null;
    },
  };
});

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
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- mock factory needs runtime React
  const ReactModule = require('react') as typeof React;
  return {
    router: { push: (...args: unknown[]) => mockRouterPush(...args) },
    useFocusEffect: (effect: () => void | (() => void)) =>
      ReactModule.useEffect(
        () => mockFocused ? effect() : undefined,
        [effect, mockFocusEpoch, mockFocused],
      ),
  };
});
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('../ui/AuthShell', () => ({
  AuthShell: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../ui/Button', () => ({
  Button: ({ title, accessibilityLabel, onPress, loading }: {
    title: string;
    accessibilityLabel: string;
    onPress: () => void;
    loading?: boolean;
  }) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return ReactModule.createElement(
      Pressable,
      { accessibilityLabel, accessibilityState: { busy: !!loading }, onPress },
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
  mockSignOut.mockReset().mockResolvedValue({ error: null });
  mockRouterPush.mockReset();
  mockBackRemove.mockReset();
  mockFocused = true;
  mockFocusEpoch = 0;
  mockHardwareBackHandler = null;
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

  test('keeps the wall actionable and explains when sign-out fails', async () => {
    mockStatus = 'required';
    mockSignOut.mockRejectedValueOnce(new Error('offline'));
    const renderer = await renderScreen();

    await act(async () => {
      renderer.root.findAllByProps({ accessibilityLabel: 'Sign out instead' })[0].props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({ accessibilityRole: 'alert' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          props: expect.objectContaining({
            children: 'We could not sign you out. Check your connection and try again.',
          }),
        }),
      ]),
    );
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Sign out instead' }).length)
      .toBeGreaterThan(0);

    mockSignOut.mockResolvedValueOnce({ error: null });
    await act(async () => {
      renderer.root.findAllByProps({ accessibilityLabel: 'Sign out instead' })[0].props.onPress();
      await Promise.resolve();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(2);
    await act(async () => renderer.unmount());
  });

  test('handles a returned Supabase sign-out error and resets the pending state for retry', async () => {
    mockStatus = 'required';
    mockSignOut.mockResolvedValueOnce({ error: new Error('offline') });
    const renderer = await renderScreen();

    await act(async () => {
      renderer.root.findAllByProps({ accessibilityLabel: 'Sign out instead' })[0].props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({
      children: 'We could not sign you out. Check your connection and try again.',
    }).length).toBeGreaterThan(0);
    const signOutButtons = renderer.root.findAll(
      (node) => node.props.accessibilityLabel === 'Sign out instead',
    );
    expect(signOutButtons.some(
      (node) => node.props.accessibilityState?.busy === false,
    )).toBe(true);
    const signOutButton = signOutButtons.find((node) => typeof node.props.onPress === 'function');

    mockSignOut.mockResolvedValueOnce({ error: null });
    await act(async () => {
      signOutButton?.props.onPress();
      await Promise.resolve();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(2);
    await act(async () => renderer.unmount());
  });

  test('blocks hardware back only while the consent wall is focused', async () => {
    mockStatus = 'required';
    let renderer = await renderScreen();

    expect(mockHardwareBackHandler?.()).toBe(true);
    await act(async () => {
      renderer.root.findAllByProps({
        accessibilityLabel: 'Read updated Terms of Service',
      })[0].props.onPress();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/legal/terms');

    mockFocused = false;
    mockFocusEpoch += 1;
    await act(async () => {
      renderer.update(<ConsentRefresh />);
    });
    expect(mockHardwareBackHandler).toBeNull();
    expect(mockBackRemove).toHaveBeenCalledTimes(1);

    // The legal reader can use hardware Back, which focuses the wall again.
    mockFocused = true;
    mockFocusEpoch += 1;
    await act(async () => {
      renderer.update(<ConsentRefresh />);
    });
    expect(mockHardwareBackHandler?.()).toBe(true);
    await act(async () => renderer.unmount());
  });
});
