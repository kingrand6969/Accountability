/* eslint-disable @typescript-eslint/no-require-imports -- screen loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';
const TARGET_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let mockOwnerId: string | null = OWNER_A;
let mockTargetId: string | undefined = TARGET_A;
let mockFocusEpoch = 0;
const mockListMessages = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockListMessagesAfter = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockSendMessage = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockMarkRead = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockReportUser = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockBlockUser = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockProfile = jest.fn<(targetId: string) => Promise<{ data: unknown; error?: unknown }>>();
const mockGetUser = jest.fn<
  () => Promise<{ data: { user: { id: string } | null } }>
>();
const mockRemoveChannel = jest.fn();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    session: mockOwnerId ? { user: { id: mockOwnerId } } : null,
    loading: false,
  }),
}));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useLocalSearchParams: () => ({ id: mockTargetId }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect, mockFocusEpoch]);
    },
  };
});
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../ui/CachedImage', () => ({ CachedImage: () => null }));
jest.mock('./ChatMessages', () => {
  const ReactModule = require('react') as typeof React;
  const { Text: NativeText } = require('react-native') as typeof import('react-native');
  return {
    MessageRow: ({ item }: { item: { body: string } }) =>
      ReactModule.createElement(NativeText, null, item.body),
  };
});
jest.mock('./api', () => ({
  CHAT_PAGE: 50,
  listMessages: (...args: unknown[]) => mockListMessages(...args),
  listMessagesAfter: (...args: unknown[]) => mockListMessagesAfter(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  markConversationRead: (...args: unknown[]) => mockMarkRead(...args),
  reportUser: (...args: unknown[]) => mockReportUser(...args),
  blockUser: (...args: unknown[]) => mockBlockUser(...args),
}));
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => {
      let targetId = '';
      const chain = {
        select: () => chain,
        eq: (_column: string, value: string) => {
          targetId = value;
          return chain;
        },
        maybeSingle: () => mockProfile(targetId),
      };
      return chain;
    },
    channel: () => {
      const channel = {
        on: () => channel,
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function message(id: string, body: string, sender = TARGET_A) {
  return { id, body, sender, created_at: '2026-08-18T00:00:00.000Z' };
}

function profile(name: string) {
  return Promise.resolve({
    data: { display_name: name, avatar_url: null, last_active_at: null },
    error: null,
  });
}

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

let mountedRenderers: TestRenderer.ReactTestRenderer[] = [];

function mount(component: React.ReactElement) {
  const renderer = TestRenderer.create(component);
  mountedRenderers.push(renderer);
  return renderer;
}

describe('BuddyChat owner and target lifecycle', () => {
  const BuddyChat = require('../app/buddy-chat/[id]').default as React.ComponentType;

  beforeEach(() => {
    jest.useFakeTimers();
    mockOwnerId = OWNER_A;
    mockTargetId = TARGET_A;
    mockFocusEpoch = 0;
    mockListMessages.mockReset().mockResolvedValue([]);
    mockListMessagesAfter.mockReset().mockResolvedValue([]);
    mockSendMessage.mockReset();
    mockMarkRead.mockReset().mockResolvedValue();
    mockReportUser.mockReset().mockResolvedValue();
    mockBlockUser.mockReset().mockResolvedValue();
    mockProfile.mockReset().mockImplementation((target) => profile(`Buddy ${target.slice(0, 1)}`));
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: OWNER_A } } });
    mockRemoveChannel.mockReset();
    jest.spyOn(Alert, 'alert').mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      mountedRenderers.forEach((renderer) => renderer.unmount());
      jest.runOnlyPendingTimers();
    });
    mountedRenderers = [];
    jest.useRealTimers();
  });

  test('uses the shared auth context and does not re-read auth inside the screen', async () => {
    await act(async () => {
      mount(React.createElement(BuddyChat));
    });
    await flush();

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockListMessages).toHaveBeenCalledWith(TARGET_A, undefined, OWNER_A);
  });

  test('clears account A immediately and never commits its pending messages into account B', async () => {
    const pendingA = deferred<unknown[]>();
    mockListMessages
      .mockReturnValueOnce(pendingA.promise)
      .mockResolvedValueOnce([message('b', 'Account B message', TARGET_A)]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = mount(React.createElement(BuddyChat));
    });

    mockOwnerId = OWNER_B;
    await act(async () => renderer.update(React.createElement(BuddyChat)));
    expect(visibleText(renderer)).not.toContain('Account A message');
    await flush();
    pendingA.resolve([message('a', 'Account A message')]);
    await flush();

    expect(visibleText(renderer)).toContain('Account B message');
    expect(visibleText(renderer)).not.toContain('Account A message');
    expect(mockListMessages).toHaveBeenLastCalledWith(TARGET_A, undefined, OWNER_B);
  });

  test('clears target A immediately and drops its pending profile and messages after opening target B', async () => {
    const messagesA = deferred<unknown[]>();
    const profileA = deferred<{ data: unknown; error?: unknown }>();
    mockListMessages
      .mockReturnValueOnce(messagesA.promise)
      .mockResolvedValueOnce([message('b', 'Target B message', TARGET_B)]);
    mockProfile
      .mockReturnValueOnce(profileA.promise)
      .mockImplementationOnce(() => profile('Target B'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = mount(React.createElement(BuddyChat));
    });

    mockTargetId = TARGET_B;
    await act(async () => renderer.update(React.createElement(BuddyChat)));
    await flush();
    messagesA.resolve([message('a', 'Target A message')]);
    profileA.resolve({
      data: { display_name: 'Target A', avatar_url: null, last_active_at: null },
      error: null,
    });
    await flush();

    expect(visibleText(renderer)).toContain('Target B');
    expect(visibleText(renderer)).toContain('Target B message');
    expect(visibleText(renderer)).not.toContain('Target A message');
    expect(mockListMessages).toHaveBeenLastCalledWith(TARGET_B, undefined, OWNER_A);
  });

  test('collapses same-tick sends and keeps the initiating owner and target immutable', async () => {
    const pending = deferred<unknown>();
    mockSendMessage.mockReturnValue(pending.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = mount(React.createElement(BuddyChat));
    });
    await flush();
    const input = renderer.root.findByType(TextInput);
    act(() => input.props.onChangeText('  Strong work  '));
    const send = renderer.root.findByProps({ accessibilityLabel: 'Send message' });
    act(() => {
      send.props.onPress();
      send.props.onPress();
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(TARGET_A, 'Strong work', OWNER_A);
    mockOwnerId = OWNER_B;
    await act(async () => renderer.update(React.createElement(BuddyChat)));
    pending.resolve(message('sent-a', 'Strong work', OWNER_A));
    await flush();
    expect(visibleText(renderer)).not.toContain('Strong work');
    expect(Alert.alert).not.toHaveBeenCalledWith('Could not send', expect.anything());
  });

  test('restores failed text for the same chat without overwriting a newer draft', async () => {
    const pending = deferred<unknown>();
    mockSendMessage.mockReturnValue(pending.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = mount(React.createElement(BuddyChat));
    });
    await flush();
    const input = renderer.root.findByType(TextInput);
    act(() => input.props.onChangeText('First message'));
    act(() => {
      void renderer.root.findByProps({ accessibilityLabel: 'Send message' }).props.onPress();
    });
    act(() => renderer.root.findByType(TextInput).props.onChangeText('New draft'));
    pending.reject(new Error('offline'));
    await flush();

    expect(renderer.root.findByType(TextInput).props.value).toContain('First message');
    expect(renderer.root.findByType(TextInput).props.value).toContain('New draft');
    expect(Alert.alert).toHaveBeenCalledWith('Could not send', 'offline');
  });

  test('never shows a send error after the chat has unmounted', async () => {
    const pending = deferred<unknown>();
    mockSendMessage.mockReturnValue(pending.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = mount(React.createElement(BuddyChat));
    });
    await flush();
    act(() => renderer.root.findByType(TextInput).props.onChangeText('Keep this private'));
    act(() => {
      void renderer.root.findByProps({ accessibilityLabel: 'Send message' }).props.onPress();
    });
    await act(async () => renderer.unmount());
    mountedRenderers = mountedRenderers.filter((candidate) => candidate !== renderer);

    pending.reject(new Error('late failure'));
    await flush();
    expect(Alert.alert).not.toHaveBeenCalledWith('Could not send', expect.anything());
  });

  test('collapses report taps and refuses a delayed confirmation after the target changes', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = mount(React.createElement(BuddyChat));
    });
    await flush();
    const report = renderer.root.findByProps({ accessibilityLabel: 'Report or block this user' });
    act(() => {
      report.props.onPress();
      report.props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
      text: string;
      onPress?: () => unknown;
    }[];
    const confirm = buttons.find((button) => button.text === 'Report & block')?.onPress;
    expect(confirm).toBeDefined();

    mockTargetId = TARGET_B;
    await act(async () => renderer.update(React.createElement(BuddyChat)));
    await act(async () => {
      await confirm?.();
    });
    expect(mockReportUser).not.toHaveBeenCalled();
    expect(mockBlockUser).not.toHaveBeenCalled();
  });

  test('does not continue to block or toast when the account changes during a pending report', async () => {
    const pendingReport = deferred<void>();
    mockReportUser.mockReturnValue(pendingReport.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = mount(React.createElement(BuddyChat));
    });
    await flush();
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Report or block this user' }).props.onPress();
    });
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
      text: string;
      onPress?: () => unknown;
    }[];
    const confirm = buttons.find((button) => button.text === 'Report & block')?.onPress;
    let action!: Promise<unknown>;
    act(() => {
      action = Promise.resolve(confirm?.());
    });
    expect(mockReportUser).toHaveBeenCalledWith(TARGET_A, 'Reported from chat', OWNER_A);

    mockOwnerId = OWNER_B;
    await act(async () => renderer.update(React.createElement(BuddyChat)));
    pendingReport.resolve();
    await act(async () => {
      await action;
    });
    expect(mockBlockUser).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith('Done', expect.anything());
  });
});
