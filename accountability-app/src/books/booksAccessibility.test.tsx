import { describe, expect, jest, test } from '@jest/globals';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import Books from '../app/books';
import { setBookPrefs } from './api';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props),
  };
});

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('../pro/ProProvider', () => ({ useIsPro: () => ({ isPro: true, loading: false }) }));
jest.mock('./api', () => ({
  INTERESTS: [
    { key: 'motivation', label: 'Motivation' },
    { key: 'health', label: 'Health' },
    { key: 'money', label: 'Money' },
  ],
  getBookPrefs: jest.fn(() => Promise.resolve({ interests: ['motivation', 'health'], cadence: 'daily' })),
  setBookPrefs: jest.fn(() => Promise.resolve()),
}));
jest.mock('./useBookFeed', () => ({
  useBookFeed: () => ({ feed: null, error: null, loading: true }),
}));
jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark'),
  }),
}));

describe('Books preference accessibility', () => {
  test('renders truthful checkbox and radio state while preserving selection updates', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Books />);
      await Promise.resolve();
    });

    const controls = (role: 'checkbox' | 'radio') => {
      const byLabel = new Map<string, TestRenderer.ReactTestInstance>();
      for (const node of renderer.root.findAllByProps({ accessibilityRole: role })) {
        if (node.props.accessibilityLabel && typeof node.props.onPress === 'function') {
          byLabel.set(node.props.accessibilityLabel, node);
        }
      }
      return [...byLabel.values()];
    };
    const checkboxes = () => controls('checkbox');
    expect(checkboxes().map((node) => [node.props.accessibilityLabel, node.props.accessibilityState])).toEqual([
      ['Motivation', { checked: true }],
      ['Health', { checked: true }],
      ['Money', { checked: false }],
    ]);

    const radioGroups = renderer.root.findAllByProps({ accessibilityRole: 'radiogroup' });
    expect(radioGroups).not.toHaveLength(0);
    const radios = () => controls('radio');
    expect(radios().map((node) => [node.props.accessibilityLabel, node.props.accessibilityState])).toEqual([
      ['Daily', { selected: true }],
      ['Weekly', { selected: false }],
      ['Monthly', { selected: false }],
    ]);

    act(() => checkboxes().find((node) => node.props.accessibilityLabel === 'Money')!.props.onPress());
    expect(checkboxes().find((node) => node.props.accessibilityLabel === 'Money')!.props.accessibilityState).toEqual({ checked: true });

    act(() => radios().find((node) => node.props.accessibilityLabel === 'Weekly')!.props.onPress());
    expect(radios().find((node) => node.props.accessibilityLabel === 'Weekly')!.props.accessibilityState).toEqual({ selected: true });
    expect(setBookPrefs).toHaveBeenLastCalledWith({
      interests: ['motivation', 'health', 'money'],
      cadence: 'weekly',
    });
  });
});
