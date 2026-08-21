import { describe, expect, jest, test } from '@jest/globals';
import type { FlexContext } from './flexContext';
import {
  buildFlexFeedShareData,
  publishFlexFeedPost,
} from './flexFeedPost';

jest.mock('../feed/api', () => ({ createPost: jest.fn() }));
jest.mock('../feed/feedPublishSignal', () => ({ markFeedPostPublished: jest.fn() }));

const ownerId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const postId = '33333333-3333-4333-8333-333333333333';
const mediaSha256 = 'a'.repeat(64);
type FlexFeedDependencies = NonNullable<Parameters<typeof publishFlexFeedPost>[1]>;
type CreatePostDependency = FlexFeedDependencies['createPost'];

const publicMedal: FlexContext = {
  kind: 'medal',
  sourceId: 'medal-trailblazer',
  title: 'Explorer Trailblazer',
  body: 'Just earned the Explorer Trailblazer medal.',
  showPublicly: true,
};

describe('Flex Feed milestone publishing', () => {
  test('builds canonical identity and exact captured-media digest metadata', () => {
    expect(buildFlexFeedShareData(publicMedal, mediaSha256)).toEqual({
      kind: 'medal',
      source: 'medal-trailblazer',
      title: 'Explorer Trailblazer',
      client_media_sha256: mediaSha256,
    });
  });

  test.each(['', 'abc123', 'A'.repeat(64), 'z'.repeat(64)])(
    'rejects a malformed captured-media digest: %s',
    (digest) => {
      expect(() => buildFlexFeedShareData(publicMedal, digest)).toThrow('digest');
    },
  );

  test('publishes one owner-bound idempotent milestone and marks it for Feed', async () => {
    const createPost = jest.fn(async () => postId) as jest.MockedFunction<CreatePostDependency>;
    const markFeedPostPublished = jest.fn();

    await expect(publishFlexFeedPost({
      context: publicMedal,
      mediaRef: 'https://media.example/proof.png',
      mediaSha256,
      operationId,
      expectedOwnerId: ownerId,
    }, { createPost, markFeedPostPublished })).resolves.toBe(postId);

    expect(createPost).toHaveBeenCalledTimes(1);
    expect(createPost).toHaveBeenCalledWith(
      publicMedal.body,
      'https://media.example/proof.png',
      null,
      null,
      null,
      true,
      {
        showPublicly: true,
        postType: 'milestone',
        shareData: {
          kind: 'medal',
          source: 'medal-trailblazer',
          title: 'Explorer Trailblazer',
          client_media_sha256: mediaSha256,
        },
        operationId,
        expectedOwnerId: ownerId,
      },
    );
    expect(markFeedPostPublished).toHaveBeenCalledTimes(1);
    expect(markFeedPostPublished).toHaveBeenCalledWith(ownerId, postId);
  });

  test('maps an Off draft to Buddies only with no Buddy Card', async () => {
    const createPost = jest.fn(async () => postId) as jest.MockedFunction<CreatePostDependency>;
    const buddiesContext: FlexContext = {
      ...publicMedal,
      showPublicly: false,
    };

    await publishFlexFeedPost({
      context: buddiesContext,
      mediaRef: 'https://media.example/proof.png',
      mediaSha256,
      operationId,
      expectedOwnerId: ownerId,
    }, { createPost, markFeedPostPublished: jest.fn() });

    expect(createPost.mock.calls[0]?.[5]).toBe(false);
    expect(createPost.mock.calls[0]?.[6]).toMatchObject({ showPublicly: false });
  });

  test('does not signal Feed when the durable post call fails', async () => {
    const createPost = jest.fn(async () => {
      throw new Error('lost response');
    }) as jest.MockedFunction<CreatePostDependency>;
    const markFeedPostPublished = jest.fn();

    await expect(publishFlexFeedPost({
      context: publicMedal,
      mediaRef: 'https://media.example/proof.png',
      mediaSha256,
      operationId,
      expectedOwnerId: ownerId,
    }, { createPost, markFeedPostPublished })).rejects.toThrow('lost response');

    expect(markFeedPostPublished).not.toHaveBeenCalled();
  });
});
