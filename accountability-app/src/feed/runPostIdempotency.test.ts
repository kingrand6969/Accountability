import { describe, expect, jest, test } from '@jest/globals';

import { executeIdempotentPost } from './api';
import { isExistingPostImageError, mayUseStorageFallback, postImagePath } from './uploadPostImage';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../profiles/publicProfiles', () => ({
  getPublicProfiles: jest.fn(async () => new Map()),
}));
jest.mock('../lib/r2', () => ({
  uploadToR2: jest.fn(async () => 'https://images.example/non-idempotent.jpg'),
}));

const operationId = '123e4567-e89b-42d3-a456-426614174000';

describe('idempotent Feed post creation', () => {
  test('confirms a committed post when the insert response was lost', async () => {
    const findExisting = jest
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('post-committed');
    const responseLost = new Error('response lost');

    await expect(
      executeIdempotentPost({
        findExisting,
        insert: jest.fn(async () => {
          throw responseLost;
        }),
      }),
    ).resolves.toEqual({ postId: 'post-committed', created: false });
  });

  test('concurrent unique conflict returns the winning post', async () => {
    const findExisting = jest
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('post-winner');
    const conflict = Object.assign(new Error('duplicate key'), { code: '23505' });

    await expect(
      executeIdempotentPost({
        findExisting,
        insert: jest.fn(async () => {
          throw conflict;
        }),
      }),
    ).resolves.toEqual({ postId: 'post-winner', created: false });
  });
});

describe('deterministic Feed image reuse', () => {
  test('does not bypass an R2 policy rejection through Supabase fallback', () => {
    expect(mayUseStorageFallback({ status: 429 })).toBe(false);
    expect(mayUseStorageFallback({ statusCode: 413 })).toBe(false);
    expect(mayUseStorageFallback({ status: 503 })).toBe(false);
    expect(mayUseStorageFallback(new TypeError('Network request failed'))).toBe(false);
  });
  test('uses the same user and operation path across retries', () => {
    const first = postImagePath('member-1', operationId, 'jpg');
    const retry = postImagePath('member-1', operationId, 'jpg');

    expect(first).toBe(`member-1/post/${operationId}.jpg`);
    expect(retry).toBe(first);
  });

  test('treats only an already-existing object response as safe reuse', () => {
    expect(isExistingPostImageError({ statusCode: '409', message: 'The resource already exists' }))
      .toBe(true);
    expect(isExistingPostImageError(new Error('network unavailable'))).toBe(false);
  });
});
