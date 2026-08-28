import { describe, expect, jest, test } from '@jest/globals';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ScrollView, StyleSheet } from 'react-native';

import InviteCard from '../app/invite-card';
import { spacing } from '../ui/theme';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props),
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LinearGradient: (props: Record<string, unknown>) =>
      React.createElement(ReactNative.View, props),
  };
});

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 11, right: 0, bottom: 23, left: 0 }),
}));
jest.mock('../profiles/api', () => ({ getMyProfile: jest.fn() }));
jest.mock('../media/useResolvedImageUrl', () => ({ useResolvedImageUrl: () => null }));
jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark'),
  }),
}));

describe('Invite Card accessibility layout', () => {
  test('keeps controls reachable in a safe-area padded scroll shell without capturing them', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<InviteCard />);
    });

    const scroll = renderer.root.findByType(ScrollView);
    const contentStyle = StyleSheet.flatten(scroll.props.contentContainerStyle);
    expect(scroll.props.scrollEnabled).not.toBe(false);
    expect(contentStyle).toMatchObject({
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 23 + spacing.lg,
    });

    const capture = renderer.root.find(
      (node) => node.props.collapsable === false && node.props.accessibilityLabel === 'Invitation artwork',
    );
    expect(
      capture.findAll(
        (node) =>
          Array.isArray(node.props.colors) &&
          node.props.colors.join(',') === '#111411,#263223,#446B00',
      ),
    ).not.toHaveLength(0);
    expect(capture.findAllByProps({ accessibilityLabel: 'Share invitation card' })).toHaveLength(0);
    const hasPrivateCopy = (node: TestRenderer.ReactTestInstance) =>
      node.children.some(
        (child) => typeof child === 'string' && child.includes('private app data'),
      );
    expect(capture.findAll(hasPrivateCopy)).toHaveLength(0);

    const share = renderer.root
      .findAllByProps({ accessibilityLabel: 'Share invitation card' })
      .find((node) => typeof node.props.onPress === 'function');
    expect(share).toBeDefined();
    expect(renderer.root.findAll(hasPrivateCopy)).not.toHaveLength(0);
  });
});
