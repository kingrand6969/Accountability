import { describe, expect, test } from '@jest/globals';

import { nextUnreadMessagesChannelName } from './unreadChannelIdentity';

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
