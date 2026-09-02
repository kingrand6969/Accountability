/* eslint-disable @typescript-eslint/no-require-imports -- root layout loads after Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Linking } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let mockOwnerId: string | null = null;
let mockConsentStatus: 'signed-out' | 'loading' | 'current' | 'required' | 'error' | null = null;
let mockPathname = '/sign-in';
let mockQuery: Record<string, string | string[] | undefined> = {};
const mockReplace = jest.fn();
const mockGetInitialURL = jest.spyOn(Linking, 'getInitialURL');
const mockProtectedGuards: boolean[] = [];
const mockStorageGetItem = jest.fn<() => Promise<string | null>>();
const mockStorageSetItem = jest.fn<() => Promise<void>>();
const mockGetMyProfile = jest.fn<() => Promise<{ display_name: string | null; area: string | null } | null>>();
const mockReconcileOwner = jest.fn<(ownerId: string | null) => Promise<'running' | 'paused'>>();
let mockPostMenuHostMounts = 0;
let mockPostMenuHostUnmounts = 0;
let mockActivitySyncMounts = 0;
let mockActivitySyncUnmounts = 0;
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
    ActivitySyncProvider: ({ children }: { children?: React.ReactNode }) => {
      ReactModule.useEffect(() => {
        mockActivitySyncMounts += 1;
        return () => {
          mockActivitySyncUnmounts += 1;
        };
      }, []);
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
  };
});

jest.mock('../auth/LegalConsentProvider', () => {
  const ReactModule = require('react') as typeof React;
  return {
    LegalConsentProvider: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
    useLegalConsent: () => ({
      status: mockConsentStatus ?? (mockOwnerId ? 'current' : 'signed-out'),
      acceptedVersion: (mockConsentStatus ?? (mockOwnerId ? 'current' : 'signed-out')) === 'current'
        ? '2026-09-02'
        : null,
      accepting: false,
      error: null,
      accept: jest.fn(),
      retry: jest.fn(),
    }),
  };
});
jest.mock('../activity/LocationCollectorBootGate', () => {
  const ReactModule = require('react') as typeof React;
  return {
    LocationCollectorBootGate: ({ children }: { children?: React.ReactNode }) =>
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
jest.mock('../feed/PostMenu', () => {
  const ReactModule = require('react') as typeof React;
  return {
    PostMenuHost: function MockPostMenuHost() {
      ReactModule.useEffect(() => {
        mockPostMenuHostMounts += 1;
        return () => {
          mockPostMenuHostUnmounts += 1;
        };
      }, []);
      return null;
    },
  };
});
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
jest.mock('../activity/locationTask', () => ({
  reconcileLocationCollectorForOwner: (ownerId: string | null) => mockReconcileOwner(ownerId),
}));

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
  mockConsentStatus = null;
  mockPathname = '/sign-in';
  mockQuery = {};
  mockGetInitialURL.mockReset();
  mockReplace.mockReset();
  mockProtectedGuards.length = 0;
  mockStorageGetItem.mockReset().mockResolvedValue(null);
  mockStorageSetItem.mockReset().mockResolvedValue(undefined);
  mockGetMyProfile.mockReset().mockResolvedValue({ display_name: 'Ready Member', area: 'Perth' });
  mockReconcileOwner.mockReset().mockResolvedValue('paused');
  mockLaunchState.mockClear();
  mockPostMenuHostMounts = 0;
  mockPostMenuHostUnmounts = 0;
  mockActivitySyncMounts = 0;
  mockActivitySyncUnmounts = 0;
});

describe('root launch-link capture lifecycle', () => {
  test.each(['loading', 'required', 'error'] as const)(
    'prioritizes the blocking legal experience over the native location owner gate while consent is %s',
    async (status) => {
      mockOwnerId = 'owner-a';
      mockConsentStatus = status;
      mockPathname = '/consent-refresh';
      mockGetInitialURL.mockResolvedValue(null);

      const renderer = await renderOrUpdate();

      expect(mockReconcileOwner).not.toHaveBeenCalled();
      expect(mockActivitySyncMounts).toBe(0);
      expect(mockPostMenuHostMounts).toBe(0);
      expect(mockProtectedGuards.slice(-5)).toEqual([true, false, false, false, false]);
      expect(mockLaunchState).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Checking your agreement' }),
      );
      await act(async () => renderer.unmount());
    },
  );

  test('retains the native location owner gate after consent is confirmed current', async () => {
    mockOwnerId = 'owner-a';
    mockConsentStatus = 'current';
    mockGetInitialURL.mockResolvedValue(null);

    const renderer = await renderOrUpdate();

    expect(mockReconcileOwner).toHaveBeenCalledWith('owner-a');
    await act(async () => renderer.unmount());
  });

  test('does not capture or replace ordinary protected navigation for an onboarded owner', async () => {
    mockOwnerId = 'owner-a';
    mockConsentStatus = 'current';
    mockPathname = '/';
    mockGetInitialURL.mockResolvedValue(null);
    let renderer = await renderOrUpdate();
    mockReplace.mockClear();

    mockPathname = '/compose';
    mockQuery = { text: 'private' };
    renderer = await renderOrUpdate(renderer);

    expect(mockReplace).not.toHaveBeenCalledWith('/compose?text=private');
    await act(async () => renderer.unmount());
  });

  test.each(['loading', 'required', 'error'] as const)(
    'blocks signed-in public share routing while consent is %s',
    async (status) => {
      mockOwnerId = 'owner-a';
      mockConsentStatus = status;
      mockPathname = '/share/public-post';
      mockGetInitialURL.mockResolvedValue(null);

      const renderer = await renderOrUpdate();

      expect(mockProtectedGuards.slice(-5)).toEqual([true, false, false, false, false]);
      await act(async () => renderer.unmount());
    },
  );

  test('keeps public share routing available while signed out', async () => {
    mockConsentStatus = 'signed-out';
    mockPathname = '/share/public-post';
    mockGetInitialURL.mockResolvedValue(null);

    const renderer = await renderOrUpdate();

    expect(mockProtectedGuards.slice(-5)).toEqual([false, false, false, true, true]);
    await act(async () => renderer.unmount());
  });

  test('unmounts protected services and modal hosts when current consent becomes required', async () => {
    mockOwnerId = 'owner-a';
    mockConsentStatus = 'current';
    mockPathname = '/';
    mockGetInitialURL.mockResolvedValue(null);
    let renderer = await renderOrUpdate();

    expect(mockActivitySyncMounts).toBe(1);
    expect(mockPostMenuHostMounts).toBe(1);

    mockConsentStatus = 'required';
    mockPathname = '/consent-refresh';
    renderer = await renderOrUpdate(renderer);

    expect(mockActivitySyncUnmounts).toBe(1);
    expect(mockPostMenuHostUnmounts).toBe(1);
    expect(mockProtectedGuards.slice(-5)).toEqual([true, false, false, false, false]);
    await act(async () => renderer.unmount());
  });

  test('preserves a held protected intent while consent unlock waits for location reconciliation', async () => {
    let resolveLocation!: (status: 'running') => void;
    const locationResult = new Promise<'running'>((resolve) => {
      resolveLocation = resolve;
    });
    mockOwnerId = 'owner-a';
    mockConsentStatus = 'required';
    mockPathname = '/compose';
    mockGetInitialURL.mockResolvedValue(null);
    mockGetMyProfile.mockResolvedValue({ display_name: null, area: null });
    let renderer = await renderOrUpdate();
    expect(mockPostMenuHostMounts).toBe(0);

    mockPathname = '/consent-refresh';
    mockConsentStatus = 'current';
    mockReconcileOwner.mockReturnValueOnce(locationResult);
    renderer = await renderOrUpdate(renderer);

    expect(mockLaunchState).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Checking activity tracking' }),
    );
    expect(mockPostMenuHostUnmounts).toBe(0);
    expect(mockReplace).not.toHaveBeenCalledWith('/compose');

    await act(async () => {
      resolveLocation('running');
      await locationResult;
      await Promise.resolve();
    });
    expect(mockPostMenuHostMounts).toBe(1);
    await act(async () => {
      notifyOnboardingComplete('owner-a');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith('/compose');
    await act(async () => renderer.unmount());
  });

  test('does not replay an unmounted owner intent after sign-out and an owner switch', async () => {
    let resolveOwnerA!: (status: 'running') => void;
    const ownerAResult = new Promise<'running'>((resolve) => {
      resolveOwnerA = resolve;
    });
    mockOwnerId = 'owner-a';
    mockConsentStatus = 'required';
    mockPathname = '/compose';
    mockGetInitialURL.mockResolvedValue(null);
    mockGetMyProfile.mockResolvedValue({ display_name: null, area: null });
    let renderer = await renderOrUpdate();

    mockPathname = '/consent-refresh';
    mockConsentStatus = 'current';
    mockReconcileOwner.mockReturnValueOnce(ownerAResult);
    renderer = await renderOrUpdate(renderer);
    expect(mockPostMenuHostUnmounts).toBe(0);

    mockOwnerId = null;
    mockConsentStatus = 'signed-out';
    renderer = await renderOrUpdate(renderer);
    mockOwnerId = 'owner-b';
    mockConsentStatus = 'current';
    mockGetMyProfile.mockResolvedValue({ display_name: 'Owner B', area: 'Perth' });
    renderer = await renderOrUpdate(renderer);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockReplace).not.toHaveBeenCalledWith('/compose');
    await act(async () => {
      resolveOwnerA('running');
      await ownerAResult;
    });
    expect(mockReplace).not.toHaveBeenCalledWith('/compose');
    await act(async () => renderer.unmount());
  });

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
    expect(mockProtectedGuards.slice(-4)).toEqual([true, true, false, true]);

    await act(async () => {
      resolveProfile({ display_name: null, area: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockProtectedGuards.slice(-4)).toEqual([true, true, false, true]);
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

    expect(mockProtectedGuards.slice(-4)).toEqual([true, true, false, true]);
    expect(mockReplace).toHaveBeenCalledWith('/compose');
    await act(async () => renderer.unmount());
  });
});
