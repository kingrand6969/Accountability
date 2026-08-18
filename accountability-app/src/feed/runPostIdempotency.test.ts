import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createPost, executeIdempotentPost } from './api';
import { supabase } from '../lib/supabase';
import { isExistingPostImageError, mayUseStorageFallback, postImagePath } from './uploadPostImage';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));
jest.mock('../profiles/publicProfiles', () => ({
  getPublicProfiles: jest.fn(async () => new Map()),
}));
jest.mock('../lib/r2', () => ({
  uploadToR2: jest.fn(async () => 'https://images.example/non-idempotent.jpg'),
}));

const operationId = '123e4567-e89b-42d3-a456-426614174000';

type PostQuery = {
  select: jest.Mock;
  insert: jest.Mock;
};

const mockedSupabase = supabase as unknown as {
  auth: {
    getUser: jest.Mock<
      () => Promise<{ data: { user: { id: string } }; error: null }>
    >;
  };
  from: jest.Mock;
};

function postQuery(options: {
  existingPostIds?: (string | null)[];
  existingPostPayload?: Record<string, unknown>;
  insertResult?: { data: { id: string } | null; error: unknown };
} = {}): PostQuery {
  const existingPostIds = [...(options.existingPostIds ?? [])];
  const maybeSingle = jest.fn(async () => {
    const id = existingPostIds.shift() ?? null;
    return { data: id ? { id, ...(options.existingPostPayload ?? {}) } : null, error: null };
  });
  const secondEq = jest.fn(() => ({ maybeSingle }));
  const firstEq = jest.fn(() => ({ eq: secondEq }));
  const single = jest.fn(async () => (
    options.insertResult ?? { data: { id: 'post-created' }, error: null }
  ));
  const query: PostQuery = {
    select: jest.fn(() => ({ eq: firstEq })),
    insert: jest.fn(() => ({ select: jest.fn(() => ({ single })) })),
  };
  mockedSupabase.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: 'member-1' } },
    error: null,
  });
});

describe('idempotent Feed post creation', () => {
  test('digest-addresses deterministic Supabase fallback uploads', () => {
    expect(postImagePath('member-1', operationId, 'jpg', 'a'.repeat(64))).toBe(
      `member-1/post/${operationId}-${'a'.repeat(64)}.jpg`,
    );
  });

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

  test('standard post confirms the committed row when its insert response is lost', async () => {
    postQuery({
      existingPostIds: [null, 'post-committed'],
      existingPostPayload: {
        body: 'Earned a medal',
        image_url: 'https://images.example/medal.jpg',
        group_id: 'group-1',
        page_id: 'page-1',
        event_id: 'event-1',
        show_on_card: true,
        audience: 'group',
        post_type: 'milestone',
        share_data: { medal: 'trailblazer' },
        activity_id: 'activity-1',
      },
      insertResult: { data: null, error: new Error('response lost') },
    });
    const retrySafeOptions = {
      audience: 'public' as const,
      postType: 'milestone' as const,
      shareData: { medal: 'trailblazer' },
      activityId: 'activity-1',
      operationId,
    };

    await expect(
      createPost(
        'Earned a medal',
        'https://images.example/medal.jpg',
        'group-1',
        'page-1',
        'event-1',
        true,
        retrySafeOptions,
      ),
    ).resolves.toBe('post-committed');
  });

  test('rejects a retry when the committed operation has different content', async () => {
    const query = postQuery({
      existingPostIds: ['post-committed'],
      existingPostPayload: {
        body: 'Original copy',
        image_url: null,
        group_id: null,
        page_id: null,
        event_id: null,
        show_on_card: false,
        audience: 'buddies',
        post_type: 'post',
        share_data: {},
        activity_id: null,
      },
    });

    await expect(createPost('Edited copy', null, null, null, null, false, {
      audience: 'buddies',
      operationId,
    })).rejects.toThrow('This draft changed after the post was created');
    expect(query.insert).not.toHaveBeenCalled();
  });

  test('rejects an account mismatch before reading or writing a post', async () => {
    const query = postQuery();

    await expect(createPost('Account A copy', null, null, null, null, false, {
      audience: 'buddies',
      operationId,
      expectedOwnerId: 'member-a',
    })).rejects.toThrow('Account changed.');
    expect(query.select).not.toHaveBeenCalled();
    expect(query.insert).not.toHaveBeenCalled();
  });

  test('standard post keeps every insert field while recording its operation id', async () => {
    const query = postQuery({ existingPostIds: [null] });
    const retrySafeOptions = {
      audience: 'public' as const,
      postType: 'milestone' as const,
      shareData: { medal: 'trailblazer' },
      activityId: 'activity-1',
      operationId,
    };

    await expect(
      createPost(
        'Earned a medal',
        'https://images.example/medal.jpg',
        'group-1',
        'page-1',
        'event-1',
        true,
        retrySafeOptions,
      ),
    ).resolves.toBe('post-created');
    expect(query.insert).toHaveBeenCalledWith({
      user_id: 'member-1',
      body: 'Earned a medal',
      image_url: 'https://images.example/medal.jpg',
      group_id: 'group-1',
      page_id: 'page-1',
      event_id: 'event-1',
      show_on_card: true,
      audience: 'group',
      post_type: 'milestone',
      share_data: { medal: 'trailblazer' },
      activity_id: 'activity-1',
      client_operation_id: operationId,
    });
  });

  test('standard post rejects an invalid operation id before querying posts', async () => {
    const retrySafeOptions = { operationId: 'not-a-uuid' };

    await expect(
      createPost('Retry me', null, null, null, null, false, retrySafeOptions),
    ).rejects.toThrow('Invalid post operation id.');
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  test('legacy standard post uses one direct insert without an operation lookup', async () => {
    const query = postQuery();

    await expect(
      createPost('Legacy post', null, null, null, null, false, { audience: 'buddies' }),
    ).resolves.toBe('post-created');
    expect(query.select).not.toHaveBeenCalled();
    expect(query.insert).toHaveBeenCalledWith({
      user_id: 'member-1',
      body: 'Legacy post',
      image_url: null,
      group_id: null,
      page_id: null,
      event_id: null,
      show_on_card: false,
      audience: 'buddies',
      post_type: 'post',
      share_data: {},
      activity_id: null,
    });
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
