import { useEffect, useMemo, useState } from 'react';
import { AppState, type ViewToken } from 'react-native';
import type { FeedPost } from './types';
import { activeVideoPost } from './videoPolicy';

export type VideoFeedRow = { post: FeedPost; generation: string };

export function useActiveVideoList({
  posts,
  generation,
  focused,
  blocked = false,
}: {
  posts: readonly FeedPost[];
  generation: string;
  focused: boolean;
  blocked?: boolean;
}) {
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [visiblePostIds, setVisiblePostIds] = useState<string[]>([]);
  const [visibilityGeneration, setVisibilityGeneration] = useState('');
  const [viewabilityConfig] = useState({ itemVisiblePercentThreshold: 65, minimumViewTime: 180 });
  const [onViewableItemsChanged] = useState(() => ({
    viewableItems,
  }: {
    viewableItems: ViewToken<VideoFeedRow>[];
  }) => {
    const ids = viewableItems.flatMap(({ item }) => item?.post ? [item.post.id] : []);
    setVisiblePostIds((current) => current.join('|') === ids.join('|') ? current : ids);
    setVisibilityGeneration(viewableItems[0]?.item?.generation ?? '');
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const rows = useMemo(
    () => posts.map((post) => ({ post, generation })),
    [generation, posts],
  );
  const activeVideoId = activeVideoPost({
    focused,
    appActive,
    overlayOpen: blocked,
    generation,
    visibilityGeneration,
    visiblePostIds,
    eligibleVideoIds: posts.flatMap((post) =>
      post.post_type === 'video' && post.image_url ? [post.id] : [],
    ),
  });

  return { rows, activeVideoId, viewabilityConfig, onViewableItemsChanged };
}
