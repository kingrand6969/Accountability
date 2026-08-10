import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { listFeed, myFollowedIds, relationshipFeedIds } from './api';
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
});

describe('followed people feed API', () => {
  test('loads followed ids from buddy_stars where the current user is the starrer', async () => {
    const stars = selectEqResult([{ target: 'followed-1' }, { target: 'followed-2' }]);
    mockFrom.mockReturnValueOnce(stars);

    await expect(myFollowedIds('me')).resolves.toEqual(['followed-1', 'followed-2']);
    expect(mockFrom).toHaveBeenCalledWith('buddy_stars');
    expect(stars.select).toHaveBeenCalledWith('target');
    expect(stars.eq).toHaveBeenCalledWith('starrer', 'me');
  });

  test('propagates followed-id query errors', async () => {
    const denied = { code: '42501', message: 'denied' };
    mockFrom.mockReturnValueOnce(selectEqResult([], denied));
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
      if (table === 'buddy_stars') return selectEqResult([{ target: 'buddy' }, { target: 'followed' }]);
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
      if (table === 'buddy_stars') return selectEqResult([], denied);
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
        return selectEqResult([{ target: starrer }]);
      }
      if (table === 'posts') return postQueries[postIndex++];
      throw new Error(`Unexpected table ${table}`);
    });

    await listFeed();
    await listFeed();

    expect(postQueries[0].in).toHaveBeenCalledWith('user_id', ['account-a', 'followed-a']);
    expect(postQueries[1].in).toHaveBeenCalledWith('user_id', ['account-b', 'followed-b']);
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

function feedQuery() {
  const chain: any = {};
  for (const method of ['select', 'order', 'limit', 'not', 'eq', 'is', 'in', 'lt']) {
    chain[method] = jest.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
}
