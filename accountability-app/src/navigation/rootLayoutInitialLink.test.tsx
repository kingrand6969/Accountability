/* eslint-disable @typescript-eslint/no-require-imports -- root layout loads after Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Linking } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let mockOwnerId: string | null = null;
const mockReplace = jest.fn();
const mockGetInitialURL = jest.spyOn(Linking, 'getInitialURL');

jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  const Stack = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  Stack.Screen = function MockStackScreen() {
    return null;
  };
  Stack.Protected = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  return {
    Stack,
    useGlobalSearchParams: () => ({}),
    usePathname: () => '/sign-in',
    useRouter: () => ({
      back: jest.fn(),
      canGoBack: jest.fn(() => false),
      replace: mockReplace,
    }),
  };
});

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('@expo-google-fonts/anton/400Regular', () => ({ Anton_400Regular: 'Anton' }));
jest.mock('@expo-google-fonts/inter/400Regular', () => ({ Inter_400Regular: 'Inter400' }));
jest.mock('@expo-google-fonts/inter/500Medium', () => ({ Inter_500Medium: 'Inter500' }));
jest.mock('@expo-google-fonts/inter/600SemiBold', () => ({ Inter_600SemiBold: 'Inter600' }));
jest.mock('@expo-google-fonts/inter/700Bold', () => ({ Inter_700Bold: 'Inter700' }));
jest.mock('@expo-google-fonts/inter/800ExtraBold', () => ({ Inter_800ExtraBold: 'Inter800' }));
jest.mock('@expo-google-fonts/playfair-display/700Bold', () => ({
  PlayfairDisplay_700Bold: 'Playfair',
}));
jest.mock('@expo-google-fonts/caveat/600SemiBold', () => ({
  Caveat_600SemiBold: 'Caveat',
}));

jest.mock('../auth/AuthProvider', () => {
  const ReactModule = require('react') as typeof React;
  return {
    AuthProvider: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
    useAuth: () => ({
      loading: false,
      session: mockOwnerId ? { user: { id: mockOwnerId } } : null,
    }),
  };
});

jest.mock('../activity/ActivitySyncProvider', () => {
  const ReactModule = require('react') as typeof React;
  return {
    ActivitySyncProvider: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});
jest.mock('../pro/ProProvider', () => {
  const ReactModule = require('react') as typeof React;
  return {
    ProProvider: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock('../moderation/ModerationGate', () => ({ ModerationGate: () => null }));
jest.mock('../ui/Toast', () => ({ ToastHost: () => null }));
jest.mock('../ui/ConfirmDialog', () => ({ ConfirmHost: () => null }));
jest.mock('../feed/PostMenu', () => ({ PostMenuHost: () => null }));
jest.mock('../ui/AppLaunchState', () => ({ AppLaunchState: () => null }));
jest.mock('../profiles/referrals', () => ({
  captureReferralFromLaunch: jest.fn(),
  redeemPendingReferral: jest.fn(),
}));
jest.mock('../activity/runMediaCache', () => ({
  cleanupAbandonedRunMedia: jest.fn(async () => undefined),
}));
jest.mock('../notifications/handler', () => ({}));
jest.mock('../activity/locationTask', () => ({}));

const RootLayout = require('../app/_layout').default as React.ComponentType;

async function renderOrUpdate(renderer?: TestRenderer.ReactTestRenderer) {
  await act(async () => {
    if (renderer) renderer.update(React.createElement(RootLayout));
    else renderer = TestRenderer.create(React.createElement(RootLayout));
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer!;
}

beforeEach(() => {
  mockOwnerId = null;
  mockGetInitialURL.mockReset();
  mockReplace.mockReset();
});

describe('root launch-link capture lifecycle', () => {
  test('resumes a signed-out cold link once for its sign-in and never replays it after logout', async () => {
    mockGetInitialURL.mockResolvedValue('accountabilityapp://groups');
    let renderer = await renderOrUpdate();

    mockOwnerId = 'owner-a';
    renderer = await renderOrUpdate(renderer);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/groups');

    mockOwnerId = null;
    renderer = await renderOrUpdate(renderer);
    mockOwnerId = 'owner-b';
    renderer = await renderOrUpdate(renderer);

    expect(mockGetInitialURL).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  test('does not turn an authenticated launch URL into an intent for the next account', async () => {
    mockOwnerId = 'owner-a';
    mockGetInitialURL.mockResolvedValue('accountabilityapp://journey-path');
    let renderer = await renderOrUpdate();
    const launchReadCount = mockGetInitialURL.mock.calls.length;

    mockOwnerId = null;
    renderer = await renderOrUpdate(renderer);
    mockOwnerId = 'owner-b';
    renderer = await renderOrUpdate(renderer);

    expect(mockGetInitialURL).toHaveBeenCalledTimes(launchReadCount);
    expect(mockReplace).not.toHaveBeenCalledWith('/journey-path');
    await act(async () => renderer.unmount());
  });
});
