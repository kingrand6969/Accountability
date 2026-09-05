import { describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { CrownDockRunAction } from './CrownDockRunAction';

jest.mock('./AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: {
      surface: { canvas: '#0B0D0B' },
      ink: { action: '#B9FF3D', inverse: '#0B0D0B' },
    },
  }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      mockReact.createElement(MockView, { ...props, testID: 'mock-run-icon' }),
  };
});

jest.mock('react-native-svg', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      mockReact.createElement(MockView, { ...props, testID: 'mock-run-svg' }),
    Path: (props: Record<string, unknown>) =>
      mockReact.createElement(MockView, { ...props, testID: 'mock-run-path' }),
  };
});

describe('CrownDockRunAction', () => {
  it('renders a balanced elevated action using the dark action token', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(CrownDockRunAction, { focused: true }));
    });

    const root = renderer.root.findByProps({ testID: 'crown-dock-run' });
    const svg = renderer.root.findByProps({ testID: 'mock-run-svg' });
    const paths = renderer.root.findAllByProps({ testID: 'mock-run-path' });

    expect(StyleSheet.flatten(root.props.style)).toEqual(
      expect.objectContaining({ width: 80, height: 88, top: -24 }),
    );
    expect(svg.props).toEqual(expect.objectContaining({ width: 76, height: 80 }));
    expect(paths.map((path) => path.props.fill)).toContain('#B9FF3D');
  });
});
