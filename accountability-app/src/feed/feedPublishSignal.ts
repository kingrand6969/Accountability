const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const pendingByOwner = new Map<string, string[]>();

function assertId(value: string, label: 'owner' | 'post'): void {
  if (!UUID.test(value)) throw new Error(`The ${label} id is invalid.`);
}

function uniqueInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Records a committed post for the initiating account's next Feed focus. */
export function markFeedPostPublished(ownerId: string, postId: string): void {
  assertId(ownerId, 'owner');
  assertId(postId, 'post');
  const current = pendingByOwner.get(ownerId) ?? [];
  if (!current.includes(postId)) pendingByOwner.set(ownerId, [...current, postId]);
}

/** Atomically consumes pending post ids for exactly one signed-in account. */
export function takeFeedPostsPublished(ownerId: string): string[] {
  assertId(ownerId, 'owner');
  const pending = pendingByOwner.get(ownerId) ?? [];
  pendingByOwner.delete(ownerId);
  return [...pending];
}

/** Requeues ids that could not yet be hydrated, ahead of newer pending work. */
export function restoreFeedPostPublished(ownerId: string, postIds: readonly string[]): void {
  assertId(ownerId, 'owner');
  postIds.forEach((postId) => assertId(postId, 'post'));
  if (postIds.length === 0) return;
  pendingByOwner.set(
    ownerId,
    uniqueInOrder([...postIds, ...(pendingByOwner.get(ownerId) ?? [])]),
  );
}

/**
 * Hydrates newly committed rows without replacing the current Feed page. Work
 * is restored for the initiating account if the account/route changes or a row
 * is not yet readable, so another focus can safely retry it.
 */
export async function reconcileFeedPostsPublished<T extends { id: string; user_id: string }>(input: {
  ownerId: string;
  fetchPost: (postId: string) => Promise<T | null>;
  isCurrent: () => boolean;
  onPosts: (posts: T[]) => void;
}): Promise<void> {
  const postIds = takeFeedPostsPublished(input.ownerId);
  if (postIds.length === 0) return;

  const hydrated = await Promise.all(postIds.map(async (postId) => {
    try {
      return { postId, post: await input.fetchPost(postId) };
    } catch {
      return { postId, post: null };
    }
  }));

  if (!input.isCurrent()) {
    restoreFeedPostPublished(input.ownerId, postIds);
    return;
  }

  const accepted: T[] = [];
  const retry: string[] = [];
  for (const { postId, post } of hydrated) {
    if (post?.id === postId && post.user_id === input.ownerId) accepted.push(post);
    else retry.push(postId);
  }
  if (!input.isCurrent()) {
    restoreFeedPostPublished(input.ownerId, postIds);
    return;
  }
  restoreFeedPostPublished(input.ownerId, retry);
  if (accepted.length > 0) input.onPosts(accepted);
}
