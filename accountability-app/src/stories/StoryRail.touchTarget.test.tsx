import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';

import { StoryRail } from './StoryRail';

const mockWindowDimensions = jest.fn(() => ({
  width: 360,
  height: 640,
  scale: 1,
  fontScale: 1,
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions(),
}));

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
  test.each([
    [1, 64],
    [2, 104],
  ])('at font scale %s resolves inside its %ipx item while retaining the upper-right visual', (fontScale, expectedItemWidth) => {
    mockWindowDimensions.mockReturnValue({
      width: 360,
      height: 640,
      scale: 1,
      fontScale,
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<StoryRail meName="Alex" />);
    });

    const target = renderer.root.findByProps({ testID: 'story-create-plus-target' });
    const visual = renderer.root.findByProps({ testID: 'story-create-plus-visual' });
    const itemStyle = StyleSheet.flatten(target.parent?.props.style);
    const targetStyle = StyleSheet.flatten(target.props.style);
    const visualStyle = StyleSheet.flatten(visual.props.style);
    const itemWidth = itemStyle.width as number;
    const targetLeft = targetStyle.left as number;
    const targetWidth = (targetStyle.width ?? targetStyle.minWidth) as number;
    const visualLeft = visualStyle.left as number;

    expect(target.props.accessibilityLabel).toBe('Add to My Day');
    expect(itemWidth).toBe(expectedItemWidth);
    expect(targetStyle.width ?? targetStyle.minWidth).toBeGreaterThanOrEqual(44);
    expect(targetStyle.height ?? targetStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(targetLeft).toBeGreaterThanOrEqual(0);
    expect(targetLeft + targetWidth).toBeLessThanOrEqual(itemWidth);
    expect(visualStyle).toEqual(expect.objectContaining({ width: 22, height: 22 }));
    expect(targetLeft + visualLeft).toBe((itemWidth - 52) / 2 + 32);
  });
});
