import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { StoryRail } from './StoryRail';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../ui/CachedImage', () => ({ CachedImage: () => null }));
jest.mock('../media/PhotoEditor', () => ({ PhotoEditor: () => null }));
jest.mock('./api', () => ({
  listStoryGroups: jest.fn(async () => []),
  addStory: jest.fn(async () => undefined),
}));
jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark'),
  }),
}));

describe('StoryRail buddy discovery', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  test('opens the unified Discover experience from the empty My Day suggestion', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<StoryRail meName="Alex" />);
    });

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Find accountability buddies' })
        .props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/discover');
  });
});
