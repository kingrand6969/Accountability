import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { DiscoverExperience } from './DiscoverExperience';

const mockPush = jest.fn();
const mockCandidates = Array.from({ length: 6 }, (_, index) => ({
  id: `person-${index + 1}`,
  display_name: `Person ${index + 1}`,
  avatar_url: null,
  area: null,
}));
const mockListDiscoveryCandidates = jest.fn(async () => ({
  candidates: mockCandidates,
  viewerArea: null,
}));
const mockGetBuddyCards = jest.fn(async (_ids: string[]) => new Map());

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'viewer-id' } } }),
}));
jest.mock('../buddy/api', () => ({
  listDiscoveryCandidates: () => mockListDiscoveryCandidates(),
  sendRequest: jest.fn(),
}));
jest.mock('../buddy/card', () => ({
  getBuddyCards: (ids: string[]) => mockGetBuddyCards(ids),
}));
jest.mock('../groups/api', () => ({ joinGroup: jest.fn(), listGroups: jest.fn(async () => []) }));
jest.mock('../compete/api', () => ({
  joinChallenge: jest.fn(),
  listChallenges: jest.fn(async () => []),
  metricMeta: jest.fn(() => ({ label: 'Metric' })),
}));
jest.mock('../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../media/useResolvedImageUrl', () => ({
  useResolvedImageUrl: (value: string | null | undefined) => value ?? null,
}));
jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark'),
  }),
}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 640, scale: 1, fontScale: 1 }),
}));

describe('Discover people expansion', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockListDiscoveryCandidates.mockClear();
    mockGetBuddyCards.mockClear();
  });

  test('shows four candidates, then expands the rest in place and removes Browse all', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<DiscoverExperience scope="people" />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const candidateLabels = () => [...new Set(renderer.root.findAll(
      (node) => typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Open public profile for '),
    ).map((node) => node.props.accessibilityLabel))];

    expect(candidateLabels()).toEqual([
      'Open public profile for Person 1',
      'Open public profile for Person 2',
      'Open public profile for Person 3',
      'Open public profile for Person 4',
    ]);
    const browseAll = renderer.root.findByProps({
      accessibilityLabel: 'Browse all: People you may connect with',
    });

    act(() => browseAll.props.onPress());

    expect(candidateLabels()).toEqual([
      'Open public profile for Person 1',
      'Open public profile for Person 2',
      'Open public profile for Person 3',
      'Open public profile for Person 4',
      'Open public profile for Person 5',
      'Open public profile for Person 6',
    ]);
    expect(renderer.root.findAllByProps({
      accessibilityLabel: 'Browse all: People you may connect with',
    })).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalledWith('/buddy');
  });
});
