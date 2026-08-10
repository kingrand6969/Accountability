import { describe, expect, it } from '@jest/globals';

import { orderStoryGroups, type OrderableStoryGroup } from './storyOrdering';

type StoryGroup = OrderableStoryGroup & { label: string };

describe('orderStoryGroups', () => {
  it('orders me first, then unseen and viewed groups newest-first, with user_id tie-breaks', () => {
    const groups: StoryGroup[] = [
      { user_id: 'viewed-new', isMe: false, viewed: true, latestCreatedAt: '2026-08-10T09:00:00Z', label: 'viewed new' },
      { user_id: 'unseen-b', isMe: false, viewed: false, latestCreatedAt: '2026-08-10T08:00:00Z', label: 'unseen b' },
      { user_id: 'me', isMe: true, viewed: true, latestCreatedAt: '2026-08-01T00:00:00Z', label: 'me' },
      { user_id: 'viewed-old', isMe: false, viewed: true, latestCreatedAt: '2026-08-09T09:00:00Z', label: 'viewed old' },
      { user_id: 'unseen-new', isMe: false, viewed: false, latestCreatedAt: '2026-08-10T10:00:00Z', label: 'unseen new' },
      { user_id: 'unseen-a', isMe: false, viewed: false, latestCreatedAt: '2026-08-10T08:00:00Z', label: 'unseen a' },
    ];

    expect(orderStoryGroups(groups).map((group) => group.user_id)).toEqual([
      'me',
      'unseen-new',
      'unseen-a',
      'unseen-b',
      'viewed-new',
      'viewed-old',
    ]);
  });

  it('does not mutate the input array', () => {
    const groups: StoryGroup[] = [
      { user_id: 'later', isMe: false, viewed: false, latestCreatedAt: '2026-08-10T10:00:00Z', label: 'later' },
      { user_id: 'earlier', isMe: false, viewed: false, latestCreatedAt: '2026-08-09T10:00:00Z', label: 'earlier' },
    ];
    const originalOrder = [...groups];

    const ordered = orderStoryGroups(groups);

    expect(groups).toEqual(originalOrder);
    expect(ordered).not.toBe(groups);
  });

  it('treats invalid timestamps as zero so they sort oldest deterministically', () => {
    const groups: StoryGroup[] = [
      { user_id: 'invalid-b', isMe: false, viewed: false, latestCreatedAt: 'not-a-date', label: 'invalid b' },
      { user_id: 'valid', isMe: false, viewed: false, latestCreatedAt: '2026-01-01T00:00:00Z', label: 'valid' },
      { user_id: 'invalid-a', isMe: false, viewed: false, latestCreatedAt: 'invalid-too', label: 'invalid a' },
    ];

    expect(orderStoryGroups(groups).map((group) => group.user_id)).toEqual([
      'valid',
      'invalid-a',
      'invalid-b',
    ]);
  });
});
