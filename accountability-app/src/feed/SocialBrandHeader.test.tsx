import React from 'react';
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

test('keeps the notification bell as the final header action without a profile initial', () => {
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <SocialBrandHeader
        unread={0}
        onMenu={jest.fn()}
        onSearch={jest.fn()}
        onCreate={jest.fn()}
        onNotifications={jest.fn()}
      />,
    );
  });

  expect(renderer.root.findAllByProps({ accessibilityLabel: 'View your Buddy Card' })).toHaveLength(0);
  expect(renderer.root.findByProps({ accessibilityLabel: 'Notifications' })).toBeTruthy();
});
