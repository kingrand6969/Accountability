import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { nextUnreadMessagesChannelName } from './unreadChannelIdentity';
import { useUnreadMessages } from './useUnreadMessages';

const mockUnreadMessageCount = jest.fn<() => Promise<number>>();
const mockChannel = jest.fn<(name: string) => unknown>();
const mockRemoveChannel = jest.fn<(channel: unknown) => Promise<void>>();

jest.mock('./api', () => ({
  unreadMessageCount: () => mockUnreadMessageCount(),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    channel: (name: string) => mockChannel(name),
    removeChannel: (channel: unknown) => mockRemoveChannel(channel),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function Probe({
  userId,
  onRender,
}: {
  userId: string | null;
  onRender: (unread: number) => void;
}) {
  onRender(useUnreadMessages(userId).unread);
  return null;
}

function setupChannel() {
  const channel = {
    on: jest.fn(),
    subscribe: jest.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  mockChannel.mockReturnValue(channel);
  return channel;
}

describe('unread-message realtime channel identity', () => {
  test('creates a fresh channel name for every subscription instance', () => {
    const first = nextUnreadMessagesChannelName('member-123');
    const second = nextUnreadMessagesChannelName('member-123');

    expect(first).toMatch(/^messages-unread:member-123:\d+$/);
    expect(second).toMatch(/^messages-unread:member-123:\d+$/);
    expect(second).not.toBe(first);
  });

  test('keeps subscriptions scoped to the signed-in member', () => {
    expect(nextUnreadMessagesChannelName('member-a')).toContain('member-a');
    expect(nextUnreadMessagesChannelName('member-b')).toContain('member-b');
  });
});

describe('useUnreadMessages owner boundary', () => {
  beforeEach(() => {
    mockUnreadMessageCount.mockReset();
    mockChannel.mockReset();
    mockRemoveChannel.mockReset();
    mockRemoveChannel.mockResolvedValue();
    setupChannel();
  });

  test('stays empty while signed out without opening a subscription', async () => {
    const renders: number[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          userId: null,
          onRender: (unread) => renders.push(unread),
        }),
      );
    });

    expect(renders.at(-1)).toBe(0);
    expect(mockUnreadMessageCount).not.toHaveBeenCalled();
    expect(mockChannel).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  test('ignores an old account result after switching owners', async () => {
    const ownerA = deferred<number>();
    const ownerB = deferred<number>();
    mockUnreadMessageCount
      .mockReturnValueOnce(ownerA.promise)
      .mockReturnValueOnce(ownerB.promise);
    const renders: number[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          userId: 'member-a',
          onRender: (unread) => renders.push(unread),
        }),
      );
    });
    await act(async () => {
      renderer.update(
        createElement(Probe, {
          userId: 'member-b',
          onRender: (unread) => renders.push(unread),
        }),
      );
    });
    expect(renders.at(-1)).toBe(0);

    await act(async () => {
      ownerB.resolve(7);
      await ownerB.promise;
    });
    expect(renders.at(-1)).toBe(7);

    await act(async () => {
      ownerA.resolve(42);
      await ownerA.promise;
    });
    expect(renders.at(-1)).toBe(7);
    expect(mockChannel.mock.calls.map(([name]) => name)).toEqual([
      expect.stringContaining('member-a'),
      expect.stringContaining('member-b'),
    ]);
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);

    await act(async () => renderer.unmount());
    expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
  });
});
