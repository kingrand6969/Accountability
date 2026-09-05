import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { StoryRail } from './StoryRail';

const mockPush = jest.fn();
const mockSetItem = jest.fn(async (_key: string, _value: string) => undefined);

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: (key: string, value: string) => mockSetItem(key, value),
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
    mockSetItem.mockClear();
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
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test('dismisses and persists the suggestion without opening Discover', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<StoryRail meName="Alex" />);
    });

    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Dismiss My Day suggestion' })
        .props.onPress();
      await Promise.resolve();
    });

    expect(mockSetItem).toHaveBeenCalledWith('story-buddy-hint-dismissed', '1');
    expect(mockPush).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({
      accessibilityLabel: 'Find accountability buddies',
    })).toHaveLength(0);
  });
});
