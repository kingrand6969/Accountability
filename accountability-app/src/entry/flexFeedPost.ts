import { createPost } from '../feed/api';
import { markFeedPostPublished } from '../feed/feedPublishSignal';
import type { FlexContext } from './flexContext';

const SHA256_HEX = /^[0-9a-f]{64}$/u;

export type FlexFeedShareData = Readonly<{
  kind: FlexContext['kind'];
  source: string;
  title: string;
  client_media_sha256: string;
}>;

export function buildFlexFeedShareData(
  context: FlexContext,
  mediaSha256: string,
): FlexFeedShareData {
  if (!SHA256_HEX.test(mediaSha256)) {
    throw new Error('The captured media digest is invalid.');
  }
  return {
    kind: context.kind,
    source: context.sourceId,
    title: context.title,
    client_media_sha256: mediaSha256,
  };
}

export type PublishFlexFeedPostInput = Readonly<{
  context: FlexContext;
  mediaRef: string;
  mediaSha256: string;
  operationId: string;
  expectedOwnerId: string;
}>;

type PublishFlexFeedPostDependencies = Readonly<{
  createPost: typeof createPost;
  markFeedPostPublished: typeof markFeedPostPublished;
}>;

const DEFAULT_DEPENDENCIES: PublishFlexFeedPostDependencies = {
  createPost,
  markFeedPostPublished,
};

/** Publishes one typed, retry-safe Flex milestone and schedules it for Feed hydration. */
export async function publishFlexFeedPost(
  input: PublishFlexFeedPostInput,
  dependencies: PublishFlexFeedPostDependencies = DEFAULT_DEPENDENCIES,
): Promise<string> {
  const postId = await dependencies.createPost(
    input.context.body,
    input.mediaRef,
    null,
    null,
    null,
    input.context.audience === 'public' && input.context.showOnCard,
    {
      audience: input.context.audience,
      postType: 'milestone',
      shareData: buildFlexFeedShareData(input.context, input.mediaSha256),
      operationId: input.operationId,
      expectedOwnerId: input.expectedOwnerId,
    },
  );
  dependencies.markFeedPostPublished(input.expectedOwnerId, postId);
  return postId;
}
