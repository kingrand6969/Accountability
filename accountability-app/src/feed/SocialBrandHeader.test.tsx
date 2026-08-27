import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { expect, jest, test } from '@jest/globals';

import { SocialBrandHeader } from './SocialBrandHeader';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({ colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark') }),
}));

jest.mock('../ui/BrandMark', () => ({ BrandMark: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('./Avatar', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Avatar: ({ name }: { name: string | null }) => mockReact.createElement(
      MockView,
      { testID: 'header-profile-avatar', accessibilityLabel: name ?? 'unknown' },
    ),
  };
});

test('opens the signed-in owner Buddy Card from a 48-point profile target', () => {
  const onProfile = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <SocialBrandHeader
        unread={0}
        profileName="Kin"
        profileAvatar={null}
        onProfile={onProfile}
        onMenu={jest.fn()}
        onSearch={jest.fn()}
        onCreate={jest.fn()}
        onNotifications={jest.fn()}
      />,
    );
  });

  const profile = renderer.root.findByProps({ accessibilityLabel: 'View your Buddy Card' });
  const target = StyleSheet.flatten(profile.props.style({ pressed: false }));
  act(() => profile.props.onPress());

  expect(onProfile).toHaveBeenCalledTimes(1);
  expect(target.minWidth).toBeGreaterThanOrEqual(48);
  expect(target.minHeight).toBeGreaterThanOrEqual(48);
  expect(renderer.root.findByProps({ testID: 'header-profile-avatar' }).props.accessibilityLabel).toBe('Kin');
});
