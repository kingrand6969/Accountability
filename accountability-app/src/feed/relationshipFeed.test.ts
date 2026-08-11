import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { listFeed, listPersonalFeed } from './api';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn(), getSession: jest.fn() }, from: jest.fn(), rpc: jest.fn() },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn(async () => new Map()) }));
jest.mock('../lib/r2', () => ({ uploadBytesToR2: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const mockGetUser = supabase.auth.getUser as jest.Mock<any>;
const mockGetSession = supabase.auth.getSession as jest.Mock<any>;
const mockFrom = supabase.from as jest.Mock<any>;
const mockRpc = supabase.rpc as jest.Mock<any>;

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'me' } }, error: null });
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'me' } } }, error: null });
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('unified personal feed snapshot', () => {
  test('loads an account-bound Feed without remote auth lookups', async () => {
    mockGetUser.mockRejectedValue(new Error('remote auth should not run'));
    mockRpc
      .mockResolvedValueOnce({ data: 'session-fast', error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(listPersonalFeed('me')).resolves.toEqual([]);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });

  test('refresh creates a session, pages it, and preserves ranked metadata and order', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 'session-1', error: null })
      .mockResolvedValueOnce({
        data: [
          { session_id: 'session-1', position: 1, id: 'buddy', source: 'buddy', suggested: false },
          { session_id: 'session-1', position: 2, id: 'suggested', source: 'suggested', suggested: true },
        ],
        error: null,
      });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'posts') return feedQuery([post('suggested'), post('buddy')]);
      if (table === 'post_likes') return likedQuery([]);
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(listFeed()).resolves.toEqual([
      expect.objectContaining({ id: 'buddy', feed_source: 'buddy', suggested: false, feed_position: 1 }),
      expect.objectContaining({ id: 'suggested', feed_source: 'suggested', suggested: true, feed_position: 2 }),
    ]);
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'create_unified_feed_session', { p_candidate_limit: 500 });
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'unified_feed_post_ids', {
      p_session_id: 'session-1', p_after_position: 0, p_limit: 20,
    });
  });

  test('initial refresh refills when hydration drops an inaccessible row from a full ranked batch', async () => {
    const firstBatch = Array.from({ length: 20 }, (_, index) => ({
      session_id: 'initial-refill', position: index + 1, id: index === 9 ? 'inaccessible' : `visible-${index + 1}`,
      source: 'buddy', suggested: false,
    }));
    mockRpc
      .mockResolvedValueOnce({ data: 'initial-refill', error: null })
      .mockResolvedValueOnce({ data: firstBatch, error: null })
      .mockResolvedValueOnce({ data: [
        { session_id: 'initial-refill', position: 21, id: 'visible-21', source: 'followed_page', suggested: false },
      ], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'posts') return feedQuery([
        ...firstBatch.filter((row) => row.id !== 'inaccessible').map((row) => post(row.id)),
        post('visible-21'),
      ]);
      return likedQuery([]);
    });

    const result = await listFeed();
    expect(result).toHaveLength(20);
    expect(result.map((item) => item.id)).toEqual([
      ...firstBatch.filter((row) => row.id !== 'inaccessible').map((row) => row.id),
      'visible-21',
    ]);
    expect(mockRpc).toHaveBeenLastCalledWith('unified_feed_post_ids', {
      p_session_id: 'initial-refill', p_after_position: 20, p_limit: 20,
    });
  });

  test('next page advances by server position instead of timestamp', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 'session-2', error: null })
      .mockResolvedValueOnce({ data: [{ session_id: 'session-2', position: 7, id: 'first', source: 'self', suggested: false }], error: null })
      .mockResolvedValueOnce({ data: [{ session_id: 'session-2', position: 11, id: 'second', source: 'joined_group', suggested: false }], error: null });
    mockFrom.mockImplementation((table: string) => table === 'posts' ? feedQuery([post('first'), post('second')]) : likedQuery([]));

    await listFeed();
    await expect(listFeed('legacy-timestamp')).resolves.toEqual([
      expect.objectContaining({ id: 'second', feed_position: 11 }),
    ]);
    expect(mockRpc).toHaveBeenLastCalledWith('unified_feed_post_ids', {
      p_session_id: 'session-2', p_after_position: 7, p_limit: 20,
    });
  });

  test('normal pagination refills after hydration drops ranked rows and advances their positions', async () => {
    const rankedBatch = Array.from({ length: 20 }, (_, index) => ({
      session_id: 'normal-refill', position: index + 2, id: index === 4 ? 'missing-normal' : `page-${index + 1}`,
      source: 'buddy', suggested: false,
    }));
    mockRpc
      .mockResolvedValueOnce({ data: 'normal-refill', error: null })
      .mockResolvedValueOnce({ data: [{ session_id: 'normal-refill', position: 1, id: 'first', source: 'self', suggested: false }], error: null })
      .mockResolvedValueOnce({ data: rankedBatch, error: null })
      .mockResolvedValueOnce({ data: [
        { session_id: 'normal-refill', position: 22, id: 'page-21', source: 'suggested', suggested: true },
      ], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'posts') return feedQuery([
        post('first'),
        ...rankedBatch.filter((row) => row.id !== 'missing-normal').map((row) => post(row.id)),
        post('page-21'),
      ]);
      return likedQuery([]);
    });

    await listFeed();
    const result = await listFeed('legacy-timestamp');
    expect(result).toHaveLength(20);
    expect(result.at(-1)).toEqual(expect.objectContaining({ id: 'page-21', feed_position: 22 }));
    expect(mockRpc).toHaveBeenLastCalledWith('unified_feed_post_ids', {
      p_session_id: 'normal-refill', p_after_position: 21, p_limit: 20,
    });
  });

  test('RPC errors fail closed without hydrating arbitrary posts', async () => {
    const denied = { code: '42501', message: 'denied' };
    mockRpc.mockResolvedValueOnce({ data: null, error: denied });
    await expect(listFeed()).rejects.toBe(denied);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('a failed refresh retains the prior successful session for later pagination', async () => {
    const refreshError = { message: 'offline' };
    mockRpc
      .mockResolvedValueOnce({ data: 'stable-session', error: null })
      .mockResolvedValueOnce({ data: [{ session_id: 'stable-session', position: 3, id: 'one', source: 'self', suggested: false }], error: null })
      .mockResolvedValueOnce({ data: null, error: refreshError })
      .mockResolvedValueOnce({ data: [{ session_id: 'stable-session', position: 4, id: 'two', source: 'buddy', suggested: false }], error: null });
    mockFrom.mockImplementation((table: string) => table === 'posts' ? feedQuery([post('one'), post('two')]) : likedQuery([]));

    await listFeed();
    await expect(listFeed()).rejects.toBe(refreshError);
    await expect(listFeed('legacy-timestamp')).resolves.toEqual([expect.objectContaining({ id: 'two' })]);
    expect(mockRpc).toHaveBeenLastCalledWith('unified_feed_post_ids', {
      p_session_id: 'stable-session', p_after_position: 3, p_limit: 20,
    });
  });

  test('a pagination RPC failure refreshes once and never returns duplicate posts', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 'old-session', error: null })
      .mockResolvedValueOnce({ data: [{ session_id: 'old-session', position: 1, id: 'seen', source: 'self', suggested: false }], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'PFS01', message: 'Feed session unavailable' } })
      .mockResolvedValueOnce({ data: 'new-session', error: null })
      .mockResolvedValueOnce({ data: [
        { session_id: 'new-session', position: 1, id: 'seen', source: 'self', suggested: false },
        { session_id: 'new-session', position: 2, id: 'fresh', source: 'buddy', suggested: false },
      ], error: null });
    mockFrom.mockImplementation((table: string) => table === 'posts' ? feedQuery([post('seen'), post('fresh')]) : likedQuery([]));

    await listFeed();
    await expect(listFeed('legacy-timestamp')).resolves.toEqual([expect.objectContaining({ id: 'fresh' })]);
    expect(mockRpc).toHaveBeenCalledTimes(5);
  });

  test('valid empty exhaustion stays empty without creating a replacement session', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 'exhausted-session', error: null })
      .mockResolvedValueOnce({ data: [{ session_id: 'exhausted-session', position: 1, id: 'only', source: 'self', suggested: false }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => table === 'posts' ? feedQuery([post('only')]) : likedQuery([]));

    await listFeed();
    await expect(listFeed('legacy-timestamp')).resolves.toEqual([]);
    expect(mockRpc.mock.calls.filter(([name]) => name === 'create_unified_feed_session')).toHaveLength(1);
  });

  test('non-session pagination errors fail closed without creating a replacement session', async () => {
    const unavailable = { code: '57014', message: 'database timeout' };
    mockRpc
      .mockResolvedValueOnce({ data: 'error-session', error: null })
      .mockResolvedValueOnce({ data: [{ session_id: 'error-session', position: 1, id: 'only', source: 'self', suggested: false }], error: null })
      .mockResolvedValueOnce({ data: null, error: unavailable });
    mockFrom.mockImplementation((table: string) => table === 'posts' ? feedQuery([post('only')]) : likedQuery([]));

    await listFeed();
    await expect(listFeed('legacy-timestamp')).rejects.toBe(unavailable);
    expect(mockRpc.mock.calls.filter(([name]) => name === 'create_unified_feed_session')).toHaveLength(1);
  });

  test('replacement session refills past a fully duplicated first page without creating another session', async () => {
    const duplicatePage = Array.from({ length: 20 }, (_, index) => ({
      session_id: 'replacement', position: index + 1, id: `seen-${index + 1}`,
      source: 'buddy', suggested: false,
    }));
    mockRpc
      .mockResolvedValueOnce({ data: 'original', error: null })
      .mockResolvedValueOnce({ data: duplicatePage.map((row) => ({ ...row, session_id: 'original' })), error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'PFS01', message: 'Feed session unavailable' } })
      .mockResolvedValueOnce({ data: 'replacement', error: null })
      .mockResolvedValueOnce({ data: duplicatePage, error: null })
      .mockResolvedValueOnce({ data: [
        { session_id: 'replacement', position: 21, id: 'fresh-1', source: 'joined_group', suggested: false },
        { session_id: 'replacement', position: 22, id: 'fresh-2', source: 'suggested', suggested: true },
      ], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'posts') return feedQuery([
        ...duplicatePage.map((row) => post(row.id)), post('fresh-2'), post('fresh-1'),
      ]);
      return likedQuery([]);
    });

    await expect(listFeed()).resolves.toHaveLength(20);
    await expect(listFeed('legacy-timestamp')).resolves.toEqual([
      expect.objectContaining({ id: 'fresh-1', feed_position: 21 }),
      expect.objectContaining({ id: 'fresh-2', feed_position: 22 }),
    ]);
    expect(mockRpc.mock.calls.filter(([name]) => name === 'create_unified_feed_session')).toHaveLength(2);
    expect(mockRpc).toHaveBeenLastCalledWith('unified_feed_post_ids', {
      p_session_id: 'replacement', p_after_position: 20, p_limit: 20,
    });
  });

  test('drops a response when the signed-in account changes during hydration', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 'session-me', error: null })
      .mockResolvedValueOnce({ data: [{ session_id: 'session-me', position: 1, id: 'private', source: 'self', suggested: false }], error: null });
    mockFrom.mockImplementation((table: string) => table === 'posts' ? feedQuery([post('private')]) : likedQuery([]));
    mockGetUser
      .mockResolvedValueOnce({ data: { user: { id: 'me' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });

    await expect(listFeed()).resolves.toEqual([]);
  });
});

describe('scoped feeds', () => {
  test.each([
    { groupId: 'group-1', pageId: undefined, column: 'group_id' },
    { groupId: undefined, pageId: 'page-1', column: 'page_id' },
  ])('group/page keeps the existing query path and never calls a Feed snapshot RPC', async ({ groupId, pageId, column }) => {
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
