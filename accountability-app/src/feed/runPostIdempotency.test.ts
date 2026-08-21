import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  createPost,
  createRunPostIdempotent,
  executeIdempotentPost,
  updatePostVisibility,
} from './api';
import { supabase } from '../lib/supabase';
import { isExistingPostImageError, mayUseStorageFallback, postImagePath } from './uploadPostImage';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));
jest.mock('../profiles/publicProfiles', () => ({
  getPublicProfiles: jest.fn(async () => new Map()),
}));
jest.mock('../lib/r2', () => ({
  uploadToR2: jest.fn(async () => 'https://images.example/non-idempotent.jpg'),
}));

const operationId = '123e4567-e89b-42d3-a456-426614174000';

const visibilityCases: [boolean, 'buddies' | 'public', boolean][] = [
  [false, 'buddies', false],
  [true, 'public', true],
];

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
  rpc: jest.Mock<(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>>;
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

  test('personal standard posts derive both columns from one boolean', async () => {
    const query = postQuery();

    await createPost('Public progress', null, null, null, null, false, {
      audience: 'buddies',
      showPublicly: true,
    });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      audience: 'public',
      show_on_card: true,
    }));
  });

  test('normalizes a tampered legacy personal combination toward Buddies only', async () => {
    const query = postQuery();

    await createPost('Keep this private', null, null, null, null, true, {
      audience: 'buddies',
    });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      audience: 'buddies',
      show_on_card: false,
    }));
  });

  test.each(visibilityCases)('run switch %p persists the matching canonical state', async (
    showPublicly,
    audience,
    showOnCard,
  ) => {
    const query = postQuery({ existingPostIds: [null] });

    await createRunPostIdempotent({
      body: 'Morning run',
      imageUrl: null,
      operationId,
      showPublicly,
      activityId: 'activity-1',
      shareData: {},
      expectedOwnerId: 'member-1',
    });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      audience,
      show_on_card: showOnCard,
    }));
  });

  test('run rejects an account mismatch before querying posts', async () => {
    const query = postQuery();

    await expect(createRunPostIdempotent({
      body: 'Account A run',
      imageUrl: null,
      operationId,
      showPublicly: false,
      activityId: 'activity-1',
      shareData: {},
      expectedOwnerId: 'member-a',
    })).rejects.toThrow('Account changed.');

    expect(query.select).not.toHaveBeenCalled();
    expect(query.insert).not.toHaveBeenCalled();
  });

  test('run rejects an invalid operation id before reading auth or posts', async () => {
    await expect(createRunPostIdempotent({
      body: 'Invalid operation',
      imageUrl: null,
      operationId: 'not-a-uuid',
      showPublicly: false,
      activityId: 'activity-1',
      shareData: {},
    })).rejects.toThrow('Invalid post operation id.');

    expect(mockedSupabase.auth.getUser).not.toHaveBeenCalled();
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  test('run returns an exact committed replay without inserting again', async () => {
    const query = postQuery({
      existingPostIds: ['run-existing'],
      existingPostPayload: {
        body: 'Morning run',
        image_url: 'media/run.jpg',
        group_id: null,
        page_id: null,
        event_id: null,
        show_on_card: true,
        audience: 'public',
        post_type: 'run',
        share_data: {
          format: 'feed',
          verified: true,
          activity_type: 'run',
          distance_m: 5000,
          duration_s: 1500,
          started_at: '2026-08-22T10:00:00.000Z',
        },
        activity_id: 'activity-1',
      },
    });

    await expect(createRunPostIdempotent({
      body: 'Morning run',
      imageUrl: 'media/run.jpg',
      operationId,
      showPublicly: true,
      activityId: 'activity-1',
      shareData: { format: 'feed' },
      expectedOwnerId: 'member-1',
    })).resolves.toEqual({ postId: 'run-existing', created: false });

    expect(query.insert).not.toHaveBeenCalled();
  });

  test.each([
    ['body', { body: 'Changed run' }],
    ['media', { imageUrl: 'media/changed-run.jpg' }],
    ['visibility', { showPublicly: false }],
    ['activity', { activityId: 'activity-2' }],
    ['share data', { shareData: { format: 'story' } }],
  ])('run rejects a replay with changed %s', async (_label, changes) => {
    const query = postQuery({
      existingPostIds: ['run-existing'],
      existingPostPayload: {
        body: 'Morning run',
        image_url: 'media/run.jpg',
        group_id: null,
        page_id: null,
        event_id: null,
        show_on_card: true,
        audience: 'public',
        post_type: 'run',
        share_data: {
          format: 'feed',
          verified: true,
          activity_type: 'run',
          distance_m: 5000,
          duration_s: 1500,
          started_at: '2026-08-22T10:00:00.000Z',
        },
        activity_id: 'activity-1',
      },
    });

    await expect(createRunPostIdempotent({
      body: 'Morning run',
      imageUrl: 'media/run.jpg',
      operationId,
      showPublicly: true,
      activityId: 'activity-1',
      shareData: { format: 'feed' },
      expectedOwnerId: 'member-1',
      ...changes,
    })).rejects.toThrow('This draft changed after the post was created');
    expect(query.insert).not.toHaveBeenCalled();
  });

  test('run rejects an operation previously committed as another post type', async () => {
    const query = postQuery({
      existingPostIds: ['post-existing'],
      existingPostPayload: {
        body: 'Morning run',
        image_url: 'media/run.jpg',
        group_id: null,
        page_id: null,
        event_id: null,
        show_on_card: true,
        audience: 'public',
        post_type: 'photo',
        share_data: {
          format: 'feed',
          verified: true,
          activity_type: 'run',
          distance_m: 5000,
          duration_s: 1500,
          started_at: '2026-08-22T10:00:00.000Z',
        },
        activity_id: 'activity-1',
      },
    });

    await expect(createRunPostIdempotent({
      body: 'Morning run',
      imageUrl: 'media/run.jpg',
      operationId,
      showPublicly: true,
      activityId: 'activity-1',
      shareData: { format: 'feed' },
      expectedOwnerId: 'member-1',
    })).rejects.toThrow('This draft changed after the post was created');
    expect(query.insert).not.toHaveBeenCalled();
  });

  test('run stops when the account changes after its operation lookup', async () => {
    const query = postQuery({ existingPostIds: [null] });
    mockedSupabase.auth.getUser
      .mockResolvedValueOnce({ data: { user: { id: 'member-1' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'member-2' } }, error: null });

    await expect(createRunPostIdempotent({
      body: 'Account A run',
      imageUrl: null,
      operationId,
      showPublicly: true,
      activityId: 'activity-1',
      shareData: {},
      expectedOwnerId: 'member-1',
    })).rejects.toThrow('Account changed.');

    expect(query.insert).not.toHaveBeenCalled();
  });

  test('standard post stops when the account changes before insert', async () => {
    const query = postQuery();
    mockedSupabase.auth.getUser
      .mockResolvedValueOnce({ data: { user: { id: 'member-1' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'member-2' } }, error: null });

    await expect(createPost('Account A progress', null, null, null, null, false, {
      showPublicly: false,
      expectedOwnerId: 'member-1',
    })).rejects.toThrow('Account changed.');

    expect(query.insert).not.toHaveBeenCalled();
  });

  test('visibility updates audience and Buddy Card eligibility in one owner-bound write', async () => {
    mockedSupabase.rpc.mockResolvedValue({
      data: [{
        result_post_id: 'post-1',
        result_audience: 'public',
        result_show_on_card: true,
      }],
      error: null,
    });

    await updatePostVisibility('post-1', true, 'member-1');

    expect(mockedSupabase.rpc).toHaveBeenCalledWith('set_personal_post_visibility', {
      p_expected_owner: 'member-1',
      p_post_id: 'post-1',
      p_show_publicly: true,
    });
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  test.each([null, [], [{
    result_post_id: 'another-post',
    result_audience: 'public',
    result_show_on_card: true,
  }]])('visibility update rejects a missing or mismatched RPC result: %p', async (data) => {
    mockedSupabase.rpc.mockResolvedValue({ data, error: null });

    await expect(updatePostVisibility('post-1', true, 'member-1'))
      .rejects.toThrow('Post visibility could not be updated.');
  });

  test('visibility update rejects a server owner or moderation denial', async () => {
    const denial = { code: '42501', message: 'Post visibility could not be updated.' };
    mockedSupabase.rpc.mockResolvedValue({ data: null, error: denial });

    await expect(updatePostVisibility('post-1', false, 'member-1')).rejects.toBe(denial);
  });

  test('visibility update rejects stale success after an account switch', async () => {
    mockedSupabase.auth.getUser
      .mockResolvedValueOnce({ data: { user: { id: 'member-1' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'member-2' } }, error: null });
    mockedSupabase.rpc.mockResolvedValue({
      data: [{
        result_post_id: 'post-1',
        result_audience: 'buddies',
        result_show_on_card: false,
      }],
      error: null,
    });

    await expect(updatePostVisibility('post-1', false, 'member-1'))
      .rejects.toThrow('Account changed.');
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
