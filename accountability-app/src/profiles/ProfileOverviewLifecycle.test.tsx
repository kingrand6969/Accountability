/* eslint-disable @typescript-eslint/no-require-imports -- screen loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { Profile } from './types';

let mockOwnerId: string | null = 'owner-a';
let mockFocusEpoch = 0;
const mockRouter = { push: jest.fn() };
const mockGetMyProfile = jest.fn<() => Promise<Profile | null>>();
const mockGetMetrics = jest.fn<() => Promise<Record<string, number>>>();
const mockGetRank = jest.fn<() => Promise<{ name: string; points: number; earned: number; medalList: [] }>>();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    session: mockOwnerId
      ? { user: { id: mockOwnerId, email: `${mockOwnerId}@example.com` } }
      : null,
  }),
}));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect, mockFocusEpoch]);
    },
  };
});
jest.mock('./api', () => ({ getMyProfile: () => mockGetMyProfile() }));
jest.mock('../achievements/api', () => ({
  getMetrics: () => mockGetMetrics(),
  getRank: () => mockGetRank(),
}));
jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return {
    useAppTheme: () => ({
      mode: 'light',
      colors: themeColors('light'),
      setMode: jest.fn(),
    }),
  };
});
jest.mock('../media/useResolvedImageUrl', () => ({
  useResolvedImageUrl: (value: string | null) => value,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const ProfileOverview = require('../app/(app)/profile').default as React.ComponentType;

const emptyMetrics = {
  streak: 0,
  totalKm: 0,
  workouts: 0,
  challenges: 0,
  buddies: 0,
  activities: 0,
  longestKm: 0,
  activeDays: 0,
  challengeWins: 0,
  memories: 0,
  totalHours: 0,
  places: 0,
  invitesAccepted: 0,
  postsShared: 0,
  likesGiven: 0,
  groupsJoined: 0,
  buddyMessages: 0,
  profileFields: 0,
};

function profileFixture(displayName: string, id = mockOwnerId ?? 'owner-a'): Profile {
  return {
    id,
    display_name: displayName,
    avatar_url: null,
    cover_url: null,
    bio: null,
    birthday: null,
    birthday_private: true,
    relationship_status: null,
    gender: null,
    gender_private: true,
    sexual_orientation: null,
    sexual_orientation_private: true,
    area: null,
    show_last_active: false,
    last_active_at: null,
    created_at: '2026-08-20T00:00:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function visibleText(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .flatMap((node) =>
      Array.isArray(node.props.children) ? node.props.children : [node.props.children],
    )
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

const activeRenderers: TestRenderer.ReactTestRenderer[] = [];

function renderProfile() {
  const renderer = TestRenderer.create(React.createElement(ProfileOverview));
  activeRenderers.push(renderer);
  return renderer;
}

describe('Profile overview truthful load lifecycle', () => {
  afterEach(() => {
    for (const renderer of activeRenderers.splice(0)) {
      act(() => renderer.unmount());
    }
  });

  beforeEach(() => {
    mockOwnerId = 'owner-a';
    mockFocusEpoch = 0;
    mockRouter.push.mockReset();
    mockGetMyProfile.mockReset();
    mockGetMetrics.mockReset().mockResolvedValue(emptyMetrics);
    mockGetRank.mockReset().mockResolvedValue({
      name: 'Rookie',
      points: 0,
      earned: 0,
      medalList: [],
    });
  });

  test('shows an accessible truthful initial failure and retries the profile load', async () => {
    mockGetMyProfile
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(profileFixture('Recovered Runner'));

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderProfile();
    });
    await flush();

    expect(visibleText(renderer)).toContain('We couldn’t load your profile');
    expect(visibleText(renderer)).not.toContain('AccountAbility member');
    const retry = renderer.root.findByProps({ accessibilityLabel: 'Retry loading profile' });
    expect(retry.props.accessibilityRole).toBe('button');

    act(() => retry.props.onPress());
    await flush();

    expect(visibleText(renderer)).toContain('Recovered Runner');
    expect(visibleText(renderer)).not.toContain('We couldn’t load your profile');
    expect(mockGetMyProfile).toHaveBeenCalledTimes(2);
  });

  test('treats a missing profile row as unavailable instead of inventing identity', async () => {
    mockGetMyProfile.mockResolvedValueOnce(null);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderProfile();
    });
    await flush();

    expect(visibleText(renderer)).toContain('We couldn’t load your profile');
    expect(visibleText(renderer)).not.toContain('owner-a');
    expect(visibleText(renderer)).not.toContain('Discipline is my compass.');
    expect(
      renderer.root.findByProps({ accessibilityLabel: 'Retry loading profile' }),
    ).toBeTruthy();
  });

  test('keeps same-owner profile data visible with a non-blocking refresh notice', async () => {
    mockGetMyProfile
      .mockResolvedValueOnce(profileFixture('Cached Runner'))
      .mockRejectedValueOnce(new Error('offline'));

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderProfile();
    });
    await flush();
    expect(visibleText(renderer)).toContain('Cached Runner');

    mockFocusEpoch += 1;
    await act(async () => renderer.update(React.createElement(ProfileOverview)));
    await flush();

    expect(visibleText(renderer)).toContain('Cached Runner');
    expect(visibleText(renderer)).toContain('Couldn’t refresh your profile');
    const notice = renderer.root.findByProps({ accessibilityLabel: 'Profile refresh failed' });
    expect(notice.props.accessibilityRole).toBe('alert');
    const retry = renderer.root.findByProps({ accessibilityLabel: 'Retry refreshing profile' });
    expect(retry.props.accessibilityRole).toBe('button');
  });

  test('drops a stale failure when the signed-in account changes', async () => {
    const accountA = deferred<Profile | null>();
    mockGetMyProfile
      .mockReturnValueOnce(accountA.promise)
      .mockResolvedValueOnce(profileFixture('Account B', 'owner-b'));

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderProfile();
    });

    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(ProfileOverview)));
    await flush();
    accountA.reject(new Error('stale offline failure'));
    await flush();

    expect(visibleText(renderer)).toContain('Account B');
    expect(visibleText(renderer)).not.toContain('We couldn’t load your profile');
    expect(visibleText(renderer)).not.toContain('Couldn’t refresh your profile');
  });
});
