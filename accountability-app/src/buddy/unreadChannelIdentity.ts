let unreadChannelSequence = 0;

export function nextUnreadMessagesChannelName(userId: string): string {
  unreadChannelSequence += 1;
  return `messages-unread:${userId}:${unreadChannelSequence}`;
}
