import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';

import { StoryRail } from './StoryRail';

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => '1'),
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

describe('StoryRail My Day add target', () => {
  test('resolves to 44 by 44 while retaining a compact plus visual', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<StoryRail meName="Alex" />);
    });

    const target = renderer.root.findByProps({ testID: 'story-create-plus-target' });
    const visual = renderer.root.findByProps({ testID: 'story-create-plus-visual' });
    const targetStyle = StyleSheet.flatten(target.props.style);
    const visualStyle = StyleSheet.flatten(visual.props.style);

    expect(target.props.accessibilityLabel).toBe('Add to My Day');
    expect(targetStyle.width ?? targetStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(targetStyle.height ?? targetStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(visualStyle).toEqual(expect.objectContaining({ width: 22, height: 22 }));
  });
});
