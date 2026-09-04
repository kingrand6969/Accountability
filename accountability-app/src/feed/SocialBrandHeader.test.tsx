import { readFileSync } from 'node:fs';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { expect, jest, test } from '@jest/globals';

import { SocialBrandHeader } from './SocialBrandHeader';

const source = readFileSync(require.resolve('./SocialBrandHeader'), 'utf8');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({ colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark') }),
}));

jest.mock('../ui/BrandMark', () => ({ BrandMark: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ name, color }: { name: string; color: string }) => (
    <View testID={`header-icon-${name}`} style={{ color }} />
  );
});

test('reserves chartreuse for Create while Search and Notifications stay quiet', () => {
  const theme = jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SocialBrandHeader unread={0} onSearch={jest.fn()} onCreate={jest.fn()} onNotifications={jest.fn()} />,
    );
  });
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'header-icon-search-outline' }).props.style).color).toBe(theme.ink.secondary);
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'header-icon-add-circle-outline' }).props.style).color).toBe(theme.ink.action);
  expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'header-icon-notifications-outline' }).props.style).color).toBe(theme.ink.secondary);
});

test('keeps the notification bell as the final header action without a profile initial', () => {
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <SocialBrandHeader
        unread={0}
        onSearch={jest.fn()}
        onCreate={jest.fn()}
        onNotifications={jest.fn()}
      />,
    );
  });

  expect(renderer.root.findAllByProps({ accessibilityLabel: 'View your Buddy Card' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Menu' })).toHaveLength(0);
  expect(renderer.root.findByProps({ accessibilityLabel: 'Notifications' })).toBeTruthy();
});

test('uses the dashboard Menu as the only menu entry point', () => {
  expect(source).not.toContain('onMenu');
  expect(source).not.toContain('icon="menu-outline"');
});

test('uses the canonical compact Mantle lockup instead of rebuilding the wordmark', () => {
  expect(source).toContain("import { BrandWordmark } from '../ui/BrandWordmark'");
  expect(source).toContain('<BrandWordmark compact />');
  expect(source).not.toContain("import { BrandMark } from '../ui/BrandMark'");
  expect(source).not.toContain('font.extrabold');
});
