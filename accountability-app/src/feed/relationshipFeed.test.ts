import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { listFeed } from './api';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn(), rpc: jest.fn() },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn(async () => new Map()) }));
jest.mock('../lib/r2', () => ({ uploadBytesToR2: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const mockGetUser = supabase.auth.getUser as jest.Mock<any>;
const mockFrom = supabase.from as jest.Mock<any>;
const mockRpc = supabase.rpc as jest.Mock<any>;

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'me' } }, error: null });
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('personal relationship feed RPC', () => {
  test.each(['buddies', 'discover'] as const)('%s uses the server-side relationship query only', async (mode) => {
    mockRpc.mockResolvedValue({ data: [{ id: 'post-1' }], error: null });
    const posts = feedQuery([post('post-1')]);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'posts') return posts;
      if (table === 'post_likes') return likedQuery([]);
      throw new Error(`Unexpected client relationship query: ${table}`);
    });

    await expect(listFeed('2026-08-01T00:00:00Z', undefined, undefined, mode)).resolves.toHaveLength(1);

    expect(mockRpc).toHaveBeenCalledWith('personal_feed_post_ids', {
      p_mode: mode,
      p_before: '2026-08-01T00:00:00Z',
      p_limit: 20,
    });
    expect(mockFrom).not.toHaveBeenCalledWith('buddy_links');
    expect(mockFrom).not.toHaveBeenCalledWith('buddy_stars');
    expect(posts.in).toHaveBeenCalledWith('id', ['post-1']);
  });

  test('returns no posts without issuing a details query when the RPC is empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(listFeed()).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('rejects an RPC error without widening the feed', async () => {
    const denied = { code: '42501', message: 'denied' };
    mockRpc.mockResolvedValue({ data: null, error: denied });
    await expect(listFeed(undefined, undefined, undefined, 'discover')).rejects.toBe(denied);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('preserves the RPC post-id order while hydrating post details', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'newer' }, { id: 'same-time-lower-id' }], error: null });
    mockFrom.mockReturnValue(feedQuery([post('same-time-lower-id'), post('newer')]));
    await expect(listFeed()).resolves.toEqual([
      expect.objectContaining({ id: 'newer' }),
      expect.objectContaining({ id: 'same-time-lower-id' }),
    ]);
  });
});

describe('scoped feeds', () => {
  test.each([
    { groupId: 'group-1', pageId: undefined, column: 'group_id' },
    { groupId: undefined, pageId: 'page-1', column: 'page_id' },
  ])('group/page keeps the existing query path and never calls the personal RPC', async ({ groupId, pageId, column }) => {
    const posts = feedQuery([]);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'post_hides') return selectEqResult([]);
      if (table === 'buddy_links') return buddyResult([]);
      if (table === 'posts') return posts;
      throw new Error(`Unexpected table ${table}`);
    });
    await expect(listFeed(undefined, groupId, pageId)).resolves.toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(posts.eq).toHaveBeenCalledWith(column, groupId ?? pageId);
  });
});

function post(id: string) {
  return {
    id, body: id, image_url: null, created_at: '2026-08-01T00:00:00Z', user_id: 'author',
    audience: 'public', post_type: 'post', share_data: {}, activity_id: null,
    post_likes: [{ count: 0 }], post_comments: [{ count: 0 }], post_encouragements: [{ count: 0 }],
    post_tags: [], event: null,
  };
}

function feedQuery(data: any[]) {
  const chain: any = {};
  for (const method of ['select', 'order', 'limit', 'not', 'eq', 'is', 'in', 'lt']) chain[method] = jest.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return chain;
}

function selectEqResult(data: any[]) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(async () => ({ data, error: null }));
  return chain;
}

function buddyResult(data: any[]) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.or = jest.fn(async () => ({ data, error: null }));
  return chain;
}

function likedQuery(data: any[]) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.in = jest.fn(async () => ({ data, error: null }));
  return chain;
}
