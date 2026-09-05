/* eslint-disable @typescript-eslint/no-require-imports -- screen loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { RefreshControl, Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

let mockOwnerId: string | null = 'owner-a';
let mockFocusEpoch = 0;
const mockRouter = { push: jest.fn() };
const mockListNotifications = jest.fn<() => Promise<unknown[]>>();
const mockMarkAllRead = jest.fn<(ownerId: string) => Promise<void>>();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ session: mockOwnerId ? { user: { id: mockOwnerId } } : null }),
}));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect, mockFocusEpoch]);
    },
  };
});
jest.mock('./api', () => ({
  listNotifications: () => mockListNotifications(),
  markAllRead: (ownerId: string) => mockMarkAllRead(ownerId),
  notificationLine: (item: { actor_name: string }) => `${item.actor_name} cheered you`,
}));
jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return {
    useAppTheme: () => ({
      mode: 'light',
      colors: themeColors('light'),
      setMode: jest.fn(),
    }),
  };
});
jest.mock('../feed/Avatar', () => ({ Avatar: () => null }));
jest.mock('../ui/EmptyState', () => {
  const ReactModule = require('react') as typeof React;
  const { Text: NativeText } = require('react-native') as typeof import('react-native');
  return {
    EmptyState: ({ title }: { title: string }) =>
      ReactModule.createElement(NativeText, null, title),
  };
});

const Notifications = require('../app/(app)/notifications').default as React.ComponentType;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const notification = (actor: string, id = actor.toLowerCase()) => ({
  id,
  type: 'like',
  actor_id: `${id}-actor`,
  actor_name: actor,
  actor_avatar: null,
  post_id: '11111111-1111-4111-8111-111111111111',
  read: false,
  created_at: '2026-08-18T00:00:00.000Z',
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function visibleText(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .flatMap((node) =>
      Array.isArray(node.props.children) ? node.props.children : [node.props.children],
    )
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

const activeRenderers: TestRenderer.ReactTestRenderer[] = [];

function renderNotifications() {
  const renderer = TestRenderer.create(React.createElement(Notifications));
  activeRenderers.push(renderer);
  return renderer;
}

describe('Notifications truthful load lifecycle', () => {
  afterEach(() => {
    for (const renderer of activeRenderers.splice(0)) {
      act(() => renderer.unmount());
    }
  });

  beforeEach(() => {
    mockOwnerId = 'owner-a';
    mockFocusEpoch = 0;
    mockRouter.push.mockReset();
    mockListNotifications.mockReset().mockResolvedValue([]);
    mockMarkAllRead.mockReset().mockResolvedValue(undefined);
  });

  test('shows an accessible initial failure instead of false empty notifications and retries', async () => {
    mockListNotifications
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([notification('Recovered')]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderNotifications();
    });
    await flush();

    expect(visibleText(renderer)).toContain('Notifications couldn’t load');
    expect(visibleText(renderer)).not.toContain('No notifications yet');
    const retry = renderer.root.findByProps({ accessibilityLabel: 'Retry loading notifications' });
    expect(retry.props.accessibilityRole).toBe('button');

    act(() => retry.props.onPress());
    await flush();
    expect(visibleText(renderer)).toContain('Recovered cheered you');
    expect(visibleText(renderer)).not.toContain('Notifications couldn’t load');
    expect(mockMarkAllRead).toHaveBeenCalledWith('owner-a');
  });

  test('keeps same-owner stale notifications visible and explains a refresh failure', async () => {
    mockListNotifications
      .mockResolvedValueOnce([notification('Training Buddy')])
      .mockRejectedValueOnce(new Error('offline'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderNotifications();
    });
    await flush();

    mockFocusEpoch += 1;
    await act(async () => renderer.update(React.createElement(Notifications)));
    await flush();

    expect(visibleText(renderer)).toContain('Training Buddy cheered you');
    expect(visibleText(renderer)).toContain('Notifications couldn’t load');
  });

  test('labels unresolved initial notifications as a loading progress state', async () => {
    mockListNotifications.mockReturnValueOnce(new Promise(() => {}));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderNotifications();
    });

    const loading = renderer.root.findByProps({ accessibilityLabel: 'Loading notifications' });
    expect(loading.props.accessibilityRole).toBe('progressbar');
  });

  test('drops a stale account failure without hiding or alarming the next account', async () => {
    const accountA = deferred<unknown[]>();
    mockListNotifications
      .mockReturnValueOnce(accountA.promise)
      .mockResolvedValueOnce([notification('Account B', 'notification-b')]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderNotifications();
    });

    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Notifications)));
    await flush();
    accountA.reject(new Error('stale offline failure'));
    await flush();

    expect(visibleText(renderer)).toContain('Account B cheered you');
    expect(visibleText(renderer)).not.toContain('Notifications couldn’t load');
  });

  test('keeps stale rows while a pull refresh is in flight', async () => {
    const refresh = deferred<unknown[]>();
    mockListNotifications
      .mockResolvedValueOnce([notification('Cached')])
      .mockReturnValueOnce(refresh.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderNotifications();
    });
    await flush();

    act(() => renderer.root.findByType(RefreshControl).props.onRefresh());
    expect(visibleText(renderer)).toContain('Cached cheered you');
    refresh.resolve([notification('Fresh')]);
    await flush();
    expect(visibleText(renderer)).toContain('Fresh cheered you');
  });
});
