/* eslint-disable @typescript-eslint/no-require-imports -- component loads after router mock */
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';

const mockRouter = {
  canGoBack: jest.fn(() => false),
  back: jest.fn(),
  replace: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const { notificationHeaderOptions } =
  require('./SafeBackButton') as typeof import('./SafeBackButton');

describe('notifications nested-tab header back behavior', () => {
  test('renders an accessible header control and falls back home on a cold load', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const header = notificationHeaderOptions().headerLeft();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(header);
    });
    const button = renderer.root.find(
      (node) =>
        node.props.accessibilityLabel === 'Go back from notifications' &&
        typeof node.props.onPress === 'function',
    );
    expect(button.props.accessibilityLabel).toBe('Go back from notifications');
    act(() => button.props.onPress());
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    act(() => renderer.unmount());
  });

  test('uses navigation history when notifications was opened in-app', async () => {
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(notificationHeaderOptions().headerLeft());
    });
    const button = renderer.root.find(
      (node) =>
        node.props.accessibilityLabel === 'Go back from notifications' &&
        typeof node.props.onPress === 'function',
    );
    act(() => button.props.onPress());
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });
});
