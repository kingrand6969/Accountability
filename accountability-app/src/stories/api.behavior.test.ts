import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  buildStoryGroups,
  insertStoryViewReceipt,
  markStoryViewed,
  type Story,
} from './api';

const mockGetUser = jest.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const mockFrom = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: () => mockGetUser() }, from: (...args: unknown[]) => mockFrom(...args) },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn() }));
jest.mock('../feed/uploadPostImage', () => ({ uploadPostImage: jest.fn() }));
jest.mock('../media/privateMedia', () => ({ resolveMediaUrls: jest.fn() }));

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
});

const stories: Story[] = [
  { id: 'a-old', user_id: 'a', image_url: 'a1', caption: null, created_at: '2026-08-09T00:00:00Z' },
  { id: 'a-new', user_id: 'a', image_url: 'a2', caption: null, created_at: '2026-08-10T00:00:00Z' },
  { id: 'b', user_id: 'b', image_url: 'b', caption: null, created_at: '2026-08-10T02:00:00Z' },
  { id: 'me', user_id: 'viewer', image_url: 'me', caption: null, created_at: '2026-08-01T00:00:00Z' },
];

describe('story receipt grouping', () => {
  test('only marks another user viewed when every active story has a receipt and orders groups', () => {
    const profiles = new Map([
      ['a', { display_name: 'A', avatar_url: 'avatar-a' }],
      ['b', { display_name: 'B', avatar_url: 'avatar-b' }],
    ]);

    const groups = buildStoryGroups(stories, 'viewer', new Set(['a-old', 'b']), profiles);

    expect(groups.map((group) => [group.user_id, group.viewed, group.latestCreatedAt])).toEqual([
      ['viewer', true, '2026-08-01T00:00:00Z'],
      ['a', false, '2026-08-10T00:00:00Z'],
      ['b', true, '2026-08-10T02:00:00Z'],
    ]);
  });
});

describe('insertStoryViewReceipt', () => {
  test('inserts only the story and viewer ids', async () => {
    const insert = jest.fn(async () => ({ error: null }));
    await insertStoryViewReceipt('story-1', 'viewer-1', insert);
    expect(insert).toHaveBeenCalledWith({ story_id: 'story-1', user_id: 'viewer-1' });
  });

  test('treats duplicate primary-key receipts as success but throws other errors', async () => {
    await expect(insertStoryViewReceipt('s', 'u', async () => ({ error: { code: '23505' } }))).resolves.toBeUndefined();
    const error = { code: '42501', message: 'denied' };
    await expect(insertStoryViewReceipt('s', 'u', async () => ({ error }))).rejects.toBe(error);
  });
});

describe('markStoryViewed identity binding', () => {
  test('does not insert a stale account-A receipt after auth switches to account B', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'account-b' } } });

    await expect(markStoryViewed('story-from-a-ui', 'account-a')).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('inserts a receipt when the authenticated account still matches the expected viewer', async () => {
    const insert = jest.fn(async () => ({ error: null }));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'account-a' } } });
    mockFrom.mockReturnValue({ insert });

    await markStoryViewed('story-1', 'account-a');

    expect(insert).toHaveBeenCalledWith({ story_id: 'story-1', user_id: 'account-a' });
  });
});
