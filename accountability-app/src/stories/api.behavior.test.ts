import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  buildStoryGroups,
  insertStoryViewReceipt,
  listStoryGroups,
  markStoryViewed,
  type Story,
} from './api';

const mockGetUser = jest.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const mockFrom = jest.fn<(table: string) => unknown>();
const mockGetPublicProfiles = jest.fn<
  () => Promise<Map<string, { display_name?: string | null; avatar_url?: string | null }>>
>();
const mockResolveMediaUrls = jest.fn<(refs: string[]) => Promise<Map<string, string>>>();
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: () => mockGetUser() }, from: (table: string) => mockFrom(table) },
}));
jest.mock('../profiles/publicProfiles', () => ({
  getPublicProfiles: () => mockGetPublicProfiles(),
}));
jest.mock('../feed/uploadPostImage', () => ({ uploadPostImage: jest.fn() }));
jest.mock('../media/privateMedia', () => ({
  resolveMediaUrls: (refs: string[]) => mockResolveMediaUrls(refs),
}));

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockGetPublicProfiles.mockReset();
  mockResolveMediaUrls.mockReset();
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

  test('warms story authorization without replacing the raw image reference', async () => {
    const rawStory: Story = {
      id: 'story-raw',
      user_id: 'author',
      image_url: 'r2://stories/author/story.jpg',
      caption: null,
      created_at: '2026-08-10T00:00:00Z',
    };
    const storyQuery = {
      select: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn(async () => ({ data: [rawStory], error: null })),
    };
    const receiptQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn(async () => ({ data: [], error: null })),
    };
    mockGetUser.mockResolvedValue({ data: { user: { id: 'viewer' } } });
    mockFrom.mockImplementation((table: string) =>
      table === 'stories' ? storyQuery : receiptQuery,
    );
    mockGetPublicProfiles.mockResolvedValue(new Map());
    mockResolveMediaUrls.mockResolvedValue(
      new Map([[rawStory.image_url, 'https://signed.example/story.jpg?X-Amz-Signature=secret']]),
    );

    const groups = await listStoryGroups();

    expect(mockResolveMediaUrls).toHaveBeenCalledWith([rawStory.image_url]);
    expect(groups[0].stories[0].image_url).toBe(rawStory.image_url);
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
