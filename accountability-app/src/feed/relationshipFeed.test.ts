import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  collectFollowedIds,
  listFeed,
  myFollowedIds,
  relationshipAuthorFilter,
  relationshipFeedIds,
} from './api';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn() }));
jest.mock('../lib/r2', () => ({ uploadBytesToR2: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const mockGetUser = supabase.auth.getUser as jest.Mock<any>;
const mockFrom = supabase.from as jest.Mock<any>;

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
});

describe('relationshipFeedIds', () => {
  test('puts me first, then buddies and followed people in stable input order', () => {
    expect(
      relationshipFeedIds(
        'me',
        ['buddy-2', 'me', 'buddy-1', 'buddy-2'],
        ['followed-2', 'buddy-1', 'followed-1', 'followed-2'],
      ),
    ).toEqual(['me', 'buddy-2', 'buddy-1', 'followed-2', 'followed-1']);
  });

  test('omits a null current user while still deduplicating relationship ids', () => {
    expect(relationshipFeedIds(null, ['buddy', 'buddy'], ['buddy', 'followed']))
      .toEqual(['buddy', 'followed']);
  });

  test('rejects an oversized author filter instead of truncating relationship ids', () => {
    expect(() => relationshipAuthorFilter(['person-1', 'person-2'], 12))
      .toThrow('Relationship feed is too large');
  });
});

describe('collectFollowedIds', () => {
  test('collects, orders and deduplicates more than 1000 followed ids across range pages', async () => {
    const rows = Array.from({ length: 1_205 }, (_, index) => ({
      target: `person-${String(Math.floor(index / 2)).padStart(4, '0')}`,
    }));
    const loadPage = jest.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));

    const result = await collectFollowedIds(loadPage, 500);

    expect(loadPage.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(result).toHaveLength(603);
    expect(result[0]).toBe('person-0000');
    expect(result.at(-1)).toBe('person-0602');
  });

  test('continues after a full page and stops after the first short page', async () => {
    const loadPage = jest
      .fn<any>()
      .mockResolvedValueOnce({ data: [{ target: 'a' }, { target: 'b' }], error: null })
      .mockResolvedValueOnce({ data: [{ target: 'c' }], error: null });

    await expect(collectFollowedIds(loadPage, 2)).resolves.toEqual(['a', 'b', 'c']);
    expect(loadPage.mock.calls).toEqual([[0, 1], [2, 3]]);
  });

  test('propagates an error from any page without returning partial ids', async () => {
    const denied = { code: '42501', message: 'page denied' };
    const loadPage = jest
      .fn<any>()
      .mockResolvedValueOnce({ data: [{ target: 'a' }, { target: 'b' }], error: null })
      .mockResolvedValueOnce({ data: [], error: denied });

    await expect(collectFollowedIds(loadPage, 2)).rejects.toBe(denied);
  });
});

describe('followed people feed API', () => {
  test('loads followed ids from buddy_stars where the current user is the starrer', async () => {
    const stars = pagedStarsResult([{ target: 'followed-1' }, { target: 'followed-2' }]);
    mockFrom.mockReturnValueOnce(stars);

    await expect(myFollowedIds('me')).resolves.toEqual(['followed-1', 'followed-2']);
    expect(mockFrom).toHaveBeenCalledWith('buddy_stars');
    expect(stars.select).toHaveBeenCalledWith('target');
    expect(stars.eq).toHaveBeenCalledWith('starrer', 'me');
    expect(stars.order).toHaveBeenCalledWith('target', { ascending: true });
    expect(stars.range).toHaveBeenCalledWith(0, 499);
  });

  test('propagates followed-id query errors', async () => {
    const denied = { code: '42501', message: 'denied' };
    mockFrom.mockReturnValueOnce(pagedStarsResult([], denied));
    await expect(myFollowedIds('me')).rejects.toBe(denied);
  });

  test.each([
    { mode: 'buddies' as const, filterMethod: 'in' as const },
    { mode: 'discover' as const, filterMethod: 'not' as const },
  ])('$mode mode filters with the local deduped relationship ids', async ({ mode, filterMethod }) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'me' } }, error: null });
    const posts = feedQuery();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'post_hides') return selectEqResult([]);
      if (table === 'buddy_links') return buddyResult([{ user_a: 'me', user_b: 'buddy' }]);
      if (table === 'buddy_stars') return pagedStarsResult([{ target: 'buddy' }, { target: 'followed' }]);
      if (table === 'posts') return posts;
      throw new Error(`Unexpected table ${table}`);
    });

    await listFeed(undefined, undefined, undefined, mode);

    expect(posts[filterMethod]).toHaveBeenCalledWith(
      'user_id',
      mode === 'discover' ? 'in' : ['me', 'buddy', 'followed'],
      ...(mode === 'discover' ? ['(me,buddy,followed)'] : []),
    );
    if (mode === 'discover') expect(posts.eq).toHaveBeenCalledWith('audience', 'public');
  });

  test('a followed-id error rejects Discover instead of widening it', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'me' } }, error: null });
    const denied = { code: '42501', message: 'stars denied' };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'post_hides') return selectEqResult([]);
      if (table === 'buddy_links') return buddyResult([]);
      if (table === 'buddy_stars') return pagedStarsResult([], denied);
      throw new Error(`Discover widened to ${table}`);
    });

    await expect(listFeed(undefined, undefined, undefined, 'discover')).rejects.toBe(denied);
    expect(mockFrom).not.toHaveBeenCalledWith('posts');
  });

  test('account switches build relationship ids afresh for each invocation', async () => {
    mockGetUser
      .mockResolvedValueOnce({ data: { user: { id: 'account-a' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'account-b' } }, error: null });
    const postQueries = [feedQuery(), feedQuery()];
    let postIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'post_hides') return selectEqResult([]);
      if (table === 'buddy_links') return buddyResult([]);
      if (table === 'buddy_stars') {
        const starrer = mockGetUser.mock.calls.length === 1 ? 'followed-a' : 'followed-b';
        return pagedStarsResult([{ target: starrer }]);
      }
      if (table === 'posts') return postQueries[postIndex++];
      throw new Error(`Unexpected table ${table}`);
    });

    await listFeed();
    await listFeed();

    expect(postQueries[0].in).toHaveBeenCalledWith('user_id', ['account-a', 'followed-a']);
    expect(postQueries[1].in).toHaveBeenCalledWith('user_id', ['account-b', 'followed-b']);
  });

  test.each([
    { scope: 'group', groupId: 'group-1', pageId: undefined },
    { scope: 'page', groupId: undefined, pageId: 'page-1' },
  ])('$scope feeds do not query followed relationships', async ({ groupId, pageId }) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'me' } }, error: null });
    const posts = feedQuery();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'post_hides') return selectEqResult([]);
      if (table === 'buddy_links') return buddyResult([]);
      if (table === 'buddy_stars') throw new Error('hypothetical star lookup failure');
      if (table === 'posts') return posts;
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(listFeed(undefined, groupId, pageId)).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalledWith('buddy_stars');
    expect(posts.eq).toHaveBeenCalledWith(groupId ? 'group_id' : 'page_id', groupId ?? pageId);
  });
});

function selectEqResult(data: any[], error: unknown = null) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => Promise.resolve({ data, error }));
  return chain;
}

function buddyResult(data: any[], error: unknown = null) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.or = jest.fn(() => Promise.resolve({ data, error }));
  return chain;
}

function pagedStarsResult(data: any[], error: unknown = null) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.range = jest.fn(async () => ({ data, error }));
  return chain;
}

function feedQuery() {
  const chain: any = {};
  for (const method of ['select', 'order', 'limit', 'not', 'eq', 'is', 'in', 'lt']) {
    chain[method] = jest.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
}
