import { describe, expect, jest, test } from '@jest/globals';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Modal } from 'react-native';

import { BanWall, NoticeModal } from './ModerationGate';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 10, right: 0, bottom: 18, left: 0 }),
}));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: jest.fn() } },
}));
jest.mock('./api', () => ({
  acknowledgeWarning: jest.fn(),
  fetchModerationState: jest.fn(),
  sessionPing: jest.fn(),
}));
jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark'),
  }),
}));

function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

describe('Moderation modal accessibility isolation', () => {
  test('ban wall is a nondismissable native modal exposing only Sign out', () => {
    const onSignOut = jest.fn();
    const renderer = render(<BanWall message="Repeated abuse" onSignOut={onSignOut} busy={false} />);
    const modal = renderer.root.findByType(Modal);

    expect(modal.props.visible).toBe(true);
    expect(modal.props.accessibilityViewIsModal).toBe(true);
    expect(modal.props.transparent).toBe(false);
    act(() => modal.props.onRequestClose());
    expect(onSignOut).not.toHaveBeenCalled();

    const actionLabels = new Set(
      renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .map((node) => node.props.accessibilityLabel)
        .filter(Boolean),
    );
    expect([...actionLabels]).toEqual(['Sign out']);
    expect(renderer.root.findAllByProps({ accessibilityRole: 'header' })).not.toHaveLength(0);
    const signOut = renderer.root
      .findAllByProps({ accessibilityLabel: 'Sign out' })
      .find((node) => typeof node.props.onPress === 'function')!;
    act(() => signOut.props.onPress());
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  test('mandatory notice is a nondismissable modal with only its acknowledgment path', () => {
    const onClose = jest.fn();
    const renderer = render(
      <NoticeModal
        tone="warning"
        icon="warning"
        title="A note from the moderators"
        body="Please follow the community rules."
        cta="I understand"
        onClose={onClose}
      />,
    );
    const modal = renderer.root.findByType(Modal);

    expect(modal.props.visible).toBe(true);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.accessibilityViewIsModal).toBe(true);
    act(() => modal.props.onRequestClose());
    expect(onClose).not.toHaveBeenCalled();

    const actionLabels = new Set(
      renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .map((node) => node.props.accessibilityLabel)
        .filter(Boolean),
    );
    expect([...actionLabels]).toEqual(['I understand']);
    expect(renderer.root.findAllByProps({ accessibilityRole: 'header' })).not.toHaveLength(0);
    const acknowledge = renderer.root
      .findAllByProps({ accessibilityLabel: 'I understand' })
      .find((node) => typeof node.props.onPress === 'function')!;
    act(() => acknowledge.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
