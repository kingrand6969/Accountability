import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';

import { StoryRail } from './StoryRail';
import { spacing, themeColors } from '../ui/theme';

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

const mockWindowDimensions = jest.fn(() => ({
  width: 360,
  height: 640,
  scale: 1,
  fontScale: 1,
}));
const mockReact = React;
const mockView = View;
const mockGetItem = jest.fn(async (_key: string) => '1' as string | null);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions(),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => mockGetItem(key),
  setItem: jest.fn(async () => undefined),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@expo/vector-icons/Ionicons', () => (
  props: Record<string, unknown>,
) => mockReact.createElement(mockView, { testID: 'story-ionicon', ...props }));
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
  test('uses inverse ink for a readable no-avatar initial on the neon create bubble', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<StoryRail meName="Alex" meAvatar={null} />);
    });

    const initial = renderer.root.findByProps({ children: 'A' });
    const initialStyle = StyleSheet.flatten(initial.props.style);
    const targetStyle = StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'story-create-plus-target' }).props.style,
    );
    const theme = themeColors('dark');

    expect(initialStyle.color).toBe(theme.ink.inverse);
    expect(contrast(initialStyle.color, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
    expect(targetStyle.width ?? targetStyle.minWidth).toBeGreaterThanOrEqual(spacing.touch);
    expect(targetStyle.height ?? targetStyle.minHeight).toBeGreaterThanOrEqual(spacing.touch);
  });

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
    expect(targetStyle.width ?? targetStyle.minWidth).toBeGreaterThanOrEqual(spacing.touch);
    expect(targetStyle.height ?? targetStyle.minHeight).toBeGreaterThanOrEqual(spacing.touch);
    expect(targetLeft).toBeGreaterThanOrEqual(0);
    expect(targetLeft + targetWidth).toBeLessThanOrEqual(itemWidth);
    expect(visualStyle).toEqual(expect.objectContaining({ width: 22, height: 22 }));
    expect(targetLeft + visualLeft).toBe((itemWidth - 52) / 2 + 32);
  });

  test('uses an actual 48dp hint-dismiss target around the unchanged close icon', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<StoryRail meName="Alex" />);
      await Promise.resolve();
    });

    const dismiss = renderer.root.findByProps({
      accessibilityLabel: 'Dismiss My Day suggestion',
    });
    const dismissStyle = StyleSheet.flatten(dismiss.props.style);
    const close = renderer.root.findByProps({ name: 'close' });

    expect(dismissStyle.width).toBe(spacing.touch);
    expect(dismissStyle.height).toBe(spacing.touch);
    expect(dismiss.props.hitSlop).toBeUndefined();
    expect(close.props.size).toBe(16);
  });
});
