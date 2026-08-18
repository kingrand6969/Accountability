/* eslint-disable @typescript-eslint/no-require-imports -- screen loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { RefreshControl, Text } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let mockOwnerId: string | null = 'owner-a';
let mockFocusEpoch = 0;
const mockRouter = { push: jest.fn() };
const mockListConversations = jest.fn<() => Promise<unknown[]>>();
const mockListActiveBuddies = jest.fn<() => Promise<unknown[]>>();

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
  listConversations: () => mockListConversations(),
  listActiveBuddies: () => mockListActiveBuddies(),
}));
jest.mock('../pro/ProProvider', () => ({ useIsPro: () => ({ isPro: true }) }));
jest.mock('../feed/Avatar', () => ({ Avatar: () => null }));
jest.mock('../ui/EmptyState', () => {
  const ReactModule = require('react') as typeof React;
  const { Text: NativeText } = require('react-native') as typeof import('react-native');
  return {
    EmptyState: ({ title }: { title: string }) =>
      ReactModule.createElement(NativeText, null, title),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const conversation = (name: string, otherId = name.toLowerCase()) => ({
  otherId,
  name,
  avatar: null,
  lastBody: `Message from ${name}`,
  lastAt: '2026-08-18T00:00:00.000Z',
  lastFromMe: false,
  unread: 0,
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

describe('Messages account and refresh lifecycle', () => {
  const Messages = require('../app/(app)/messages').default as React.ComponentType;

  beforeEach(() => {
    mockOwnerId = 'owner-a';
    mockFocusEpoch = 0;
    mockRouter.push.mockReset();
    mockListConversations.mockReset().mockResolvedValue([]);
    mockListActiveBuddies.mockReset().mockResolvedValue([]);
  });

  test('never commits account A conversations after switching to B', async () => {
    const accountA = deferred<unknown[]>();
    mockListConversations
      .mockReturnValueOnce(accountA.promise)
      .mockResolvedValueOnce([conversation('Account B', 'buddy-b')]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Messages));
    });

    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Messages)));
    await flush();
    accountA.resolve([conversation('Account A', 'buddy-a')]);
    await flush();

    expect(visibleText(renderer)).toContain('Account B');
    expect(visibleText(renderer)).not.toContain('Account A');
  });

  test('never shows account A active buddies after switching to B', async () => {
    const accountA = deferred<unknown[]>();
    mockListActiveBuddies
      .mockReturnValueOnce(accountA.promise)
      .mockResolvedValueOnce([
        { id: 'active-b', name: 'Bravo B', avatar: null, online: true, lastActive: null },
      ]);
    mockListConversations.mockResolvedValue([]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Messages));
    });
    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Messages)));
    await flush();
    accountA.resolve([
      { id: 'active-a', name: 'Alpha A', avatar: null, online: true, lastActive: null },
    ]);
    await flush();

    expect(visibleText(renderer)).toContain('Bravo');
    expect(visibleText(renderer)).not.toContain('Alpha');
  });

  test('keeps same-owner conversations visible when a refocus refresh fails', async () => {
    mockListConversations
      .mockResolvedValueOnce([conversation('Training Buddy', 'buddy-1')])
      .mockRejectedValueOnce(new Error('offline'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Messages));
    });
    await flush();
    expect(visibleText(renderer)).toContain('Training Buddy');

    mockFocusEpoch += 1;
    await act(async () => renderer.update(React.createElement(Messages)));
    await flush();
    expect(visibleText(renderer)).toContain('Training Buddy');
  });

  test('drops a pull-refresh result when the account changes', async () => {
    const staleRefresh = deferred<unknown[]>();
    mockListConversations
      .mockResolvedValueOnce([conversation('Initial A', 'initial-a')])
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce([conversation('Current B', 'current-b')]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Messages));
    });
    await flush();

    act(() => renderer.root.findByType(RefreshControl).props.onRefresh());
    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Messages)));
    await flush();
    staleRefresh.resolve([conversation('Stale A', 'stale-a')]);
    await flush();

    expect(visibleText(renderer)).toContain('Current B');
    expect(visibleText(renderer)).not.toContain('Stale A');
  });

  test('collapses same-tick double taps into one chat navigation', async () => {
    mockListConversations.mockResolvedValueOnce([conversation('Maya', 'buddy-1')]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Messages));
    });
    await flush();
    const row = renderer.root.findByProps({ accessibilityLabel: 'Chat with Maya' });
    act(() => {
      row.props.onPress();
      row.props.onPress();
    });
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });
});
