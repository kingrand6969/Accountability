import type { FeedPost } from './types';

export function feedRowsBelongToView(
  ownerId: string | null,
  currentUserId: string | null,
) {
  return ownerId === currentUserId && currentUserId !== null;
}

export function scheduleIdentityBoundAction(
  requestedUserId: string,
  getCurrentUserId: () => string | null,
  action: () => void,
  delayMs = 250,
  onConsumed?: () => void,
) {
  return setTimeout(() => {
    onConsumed?.();
    if (getCurrentUserId() === requestedUserId) action();
  }, delayMs);
}

export type FeedViewState =
  | 'initial-loading'
  | 'pagination-loading'
  | 'populated'
  | 'empty'
  | 'retryable-error'
  | 'offline-cached'
  | 'offline-uncached';

export function deriveFeedViewState(input: {
  loading: boolean;
  loadingMore: boolean;
  postCount: number;
  error: string | null;
  online: boolean;
}): FeedViewState {
  if (!input.online) return input.postCount > 0 ? 'offline-cached' : 'offline-uncached';
  if (input.loading && input.postCount === 0) return 'initial-loading';
  if (input.error) return 'retryable-error';
  if (input.loadingMore) return 'pagination-loading';
  return input.postCount > 0 ? 'populated' : 'empty';
}

export function deriveFeedCardPresentation(post: FeedPost, currentUserId: string | null) {
  const redacted = !post.author_name?.trim() && !post.author_avatar;
  return {
    redacted,
    ownerLabel: post.user_id === currentUserId ? 'Your post' : 'Buddy post',
    audienceLabel:
      post.audience === 'public'
        ? 'Public'
        : post.audience === 'group'
          ? 'Group restricted'
          : 'Buddies only',
  } as const;
}
