/* eslint-disable @typescript-eslint/no-require-imports -- root layout loads after Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Linking } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let mockOwnerId: string | null = null;
let mockPathname = '/sign-in';
let mockQuery: Record<string, string | string[] | undefined> = {};
const mockReplace = jest.fn();
const mockGetInitialURL = jest.spyOn(Linking, 'getInitialURL');
const mockProtectedGuards: boolean[] = [];
const mockStorageGetItem = jest.fn<() => Promise<string | null>>();
const mockStorageSetItem = jest.fn<() => Promise<void>>();
const mockGetMyProfile = jest.fn<() => Promise<{ display_name: string | null; area: string | null } | null>>();
const mockLaunchState = jest.fn((_props: {
  message: string;
  error?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) => null);

jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  const Stack = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  Stack.Screen = function MockStackScreen() {
    return null;
  };
  Stack.Protected = ({ children, guard }: { children?: React.ReactNode; guard: boolean }) => {
    mockProtectedGuards.push(guard);
    return ReactModule.createElement(ReactModule.Fragment, null, children);
  };
  return {
    Stack,
    useGlobalSearchParams: () => mockQuery,
    usePathname: () => mockPathname,
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
jest.mock('../ui/AppLaunchState', () => ({
  AppLaunchState: (props: {
    message: string;
    error?: boolean;
    actionLabel?: string;
    onAction?: () => void;
  }) => mockLaunchState(props),
}));
jest.mock('../profiles/referrals', () => ({
  captureReferralFromLaunch: jest.fn(),
  redeemPendingReferral: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: () => mockStorageGetItem(),
    setItem: () => mockStorageSetItem(),
  },
}));
jest.mock('../profiles/api', () => ({
  getMyProfile: () => mockGetMyProfile(),
}));
jest.mock('../activity/runMediaCache', () => ({
  cleanupAbandonedRunMedia: jest.fn(async () => undefined),
}));
jest.mock('../notifications/handler', () => ({}));
jest.mock('../activity/locationTask', () => ({}));

const RootLayout = require('../app/_layout').default as React.ComponentType;
const { notifyOnboardingComplete } = require('./authRouteIntent') as {
  notifyOnboardingComplete: (ownerId: string) => void;
};

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
  mockPathname = '/sign-in';
  mockQuery = {};
  mockGetInitialURL.mockReset();
  mockReplace.mockReset();
  mockProtectedGuards.length = 0;
  mockStorageGetItem.mockReset().mockResolvedValue(null);
  mockStorageSetItem.mockReset().mockResolvedValue(undefined);
  mockGetMyProfile.mockReset().mockResolvedValue({ display_name: 'Ready Member', area: 'Perth' });
  mockLaunchState.mockClear();
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

  test('holds a signed-out Post comment link until onboarding completes, then resumes it once', async () => {
    const destination = '/post/11111111-1111-4111-8111-111111111111?comment=1';
    mockGetInitialURL.mockResolvedValue(
      'accountabilityapp://post/11111111-1111-4111-8111-111111111111?comment=1',
    );
    mockGetMyProfile.mockResolvedValue({ display_name: null, area: null });
    let renderer = await renderOrUpdate();

    mockOwnerId = 'owner-a';
    mockPathname = '/onboarding';
    renderer = await renderOrUpdate(renderer);
    expect(mockReplace).not.toHaveBeenCalledWith(destination);

    await act(async () => {
      notifyOnboardingComplete('owner-a');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(destination);

    await act(async () => {
      notifyOnboardingComplete('owner-a');
      await Promise.resolve();
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  test('holds a direct signed-in Compose link for its incomplete owner only', async () => {
    mockOwnerId = 'owner-a';
    mockPathname = '/compose';
    mockQuery = { photo: '1' };
    mockGetInitialURL.mockResolvedValue(null);
    mockGetMyProfile.mockResolvedValue({ display_name: null, area: null });
    const renderer = await renderOrUpdate();

    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => {
      notifyOnboardingComplete('owner-b');
      await Promise.resolve();
    });
    expect(mockReplace).not.toHaveBeenCalled();

    mockPathname = '/onboarding';
    await act(async () => {
      notifyOnboardingComplete('owner-a');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/compose?photo=1');
    await act(async () => renderer.unmount());
  });

  test('does not let stale profile hydration undo a successful onboarding signal', async () => {
    let resolveProfile!: (profile: { display_name: null; area: null }) => void;
    mockOwnerId = 'owner-a';
    mockPathname = '/compose';
    mockQuery = { photo: '1' };
    mockGetInitialURL.mockResolvedValue(null);
    mockGetMyProfile.mockImplementation(() => new Promise((resolve) => {
      resolveProfile = resolve;
    }));
    const renderer = await renderOrUpdate();

    await act(async () => {
      notifyOnboardingComplete('owner-a');
      await Promise.resolve();
    });
    expect(mockProtectedGuards.slice(-3)).toEqual([true, true, false]);

    await act(async () => {
      resolveProfile({ display_name: null, area: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockProtectedGuards.slice(-3)).toEqual([true, true, false]);
    await act(async () => renderer.unmount());
  });

  test('fails closed with a retry when onboarding status cannot be loaded', async () => {
    mockOwnerId = 'owner-a';
    mockPathname = '/compose';
    mockGetInitialURL.mockResolvedValue(null);
    mockGetMyProfile.mockRejectedValueOnce(new Error('network unavailable'));
    const renderer = await renderOrUpdate();

    const failure = mockLaunchState.mock.calls.at(-1)?.[0];
    expect(failure).toEqual(expect.objectContaining({
      message: 'We could not check your account setup',
      error: true,
      actionLabel: 'Try again',
    }));
    expect(failure?.onAction).toEqual(expect.any(Function));
    expect(mockProtectedGuards).toHaveLength(0);
    expect(mockReplace).not.toHaveBeenCalled();

    mockGetMyProfile.mockResolvedValue({ display_name: 'Ready Member', area: 'Perth' });
    await act(async () => {
      failure?.onAction?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockProtectedGuards.slice(-3)).toEqual([true, true, false]);
    expect(mockReplace).toHaveBeenCalledWith('/compose');
    await act(async () => renderer.unmount());
  });
});
