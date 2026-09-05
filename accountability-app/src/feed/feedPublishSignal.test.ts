import { afterEach, describe, expect, test } from '@jest/globals';
import {
  markFeedPostPublished,
  reconcileFeedPostsPublished,
  restoreFeedPostPublished,
  takeFeedPostsPublished,
} from './feedPublishSignal';

describe('feed publish signal', () => {
  const ownerA = '11111111-1111-4111-8111-111111111111';
  const ownerB = '22222222-2222-4222-8222-222222222222';
  const postA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const postB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  afterEach(() => {
    takeFeedPostsPublished(ownerA);
    takeFeedPostsPublished(ownerB);
  });

  test('keeps pending posts isolated by the initiating account and preserves order', () => {
    markFeedPostPublished(ownerA, postA);
    markFeedPostPublished(ownerB, postB);

    expect(takeFeedPostsPublished(ownerA)).toEqual([postA]);
    expect(takeFeedPostsPublished(ownerB)).toEqual([postB]);
  });

  test('deduplicates a lost-response retry and consumes each post once', () => {
    markFeedPostPublished(ownerA, postA);
    markFeedPostPublished(ownerA, postA);

    expect(takeFeedPostsPublished(ownerA)).toEqual([postA]);
    expect(takeFeedPostsPublished(ownerA)).toEqual([]);
  });

  test('restores unresolved posts without duplicating newer pending work', () => {
    markFeedPostPublished(ownerA, postA);
    expect(takeFeedPostsPublished(ownerA)).toEqual([postA]);

    markFeedPostPublished(ownerA, postB);
    restoreFeedPostPublished(ownerA, [postA, postB]);

    expect(takeFeedPostsPublished(ownerA)).toEqual([postA, postB]);
  });

  test('rejects malformed account and post identifiers', () => {
    expect(() => markFeedPostPublished('not-an-owner', postA)).toThrow('invalid');
    expect(() => markFeedPostPublished(ownerA, 'not-a-post')).toThrow('invalid');
    expect(() => takeFeedPostsPublished('not-an-owner')).toThrow('invalid');
  });

  test('hydrates authoritative owner rows and commits them in publish order', async () => {
    markFeedPostPublished(ownerA, postA);
    markFeedPostPublished(ownerA, postB);
    const committed: { id: string; user_id: string }[][] = [];

    await reconcileFeedPostsPublished({
      ownerId: ownerA,
      fetchPost: async (postId) => ({ id: postId, user_id: ownerA }),
      isCurrent: () => true,
      onPosts: (posts) => committed.push(posts),
    });

    expect(committed).toEqual([[
      { id: postA, user_id: ownerA },
      { id: postB, user_id: ownerA },
    ]]);
    expect(takeFeedPostsPublished(ownerA)).toEqual([]);
  });

  test('never commits after an account change and restores the initiating account work', async () => {
    markFeedPostPublished(ownerA, postA);
    const committed: unknown[] = [];
    let current = true;

    await reconcileFeedPostsPublished({
      ownerId: ownerA,
      fetchPost: async (postId) => {
        current = false;
        return { id: postId, user_id: ownerA };
      },
      isCurrent: () => current,
      onPosts: (posts) => committed.push(posts),
    });

    expect(committed).toEqual([]);
    expect(takeFeedPostsPublished(ownerA)).toEqual([postA]);
  });

  test('requeues missing, failed, and wrong-owner rows while accepting valid rows', async () => {
    const postC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    markFeedPostPublished(ownerA, postA);
    markFeedPostPublished(ownerA, postB);
    markFeedPostPublished(ownerA, postC);
    const committed: { id: string; user_id: string }[][] = [];

    await reconcileFeedPostsPublished({
      ownerId: ownerA,
      fetchPost: async (postId) => {
        if (postId === postA) return { id: postId, user_id: ownerA };
        if (postId === postB) throw new Error('offline');
        return { id: postId, user_id: ownerB };
      },
      isCurrent: () => true,
      onPosts: (posts) => committed.push(posts),
    });

    expect(committed).toEqual([[{ id: postA, user_id: ownerA }]]);
    expect(takeFeedPostsPublished(ownerA)).toEqual([postB, postC]);
  });
});
