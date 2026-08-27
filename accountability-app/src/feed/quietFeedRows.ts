export type QuietFeedRow<Post> =
  | { kind: 'post'; post: Post; generation: string }
  | { kind: 'buddies'; id: 'suggested-buddies'; generation: string }
  | { kind: 'ad'; id: string; generation: string };

export function buildQuietFeedRows<Post extends { id: string }>({
  posts,
  showBuddyRail,
  showAds,
  generation,
  adEvery = 5,
}: {
  posts: readonly Post[];
  showBuddyRail: boolean;
  showAds: boolean;
  generation: string;
  adEvery?: number;
}): QuietFeedRow<Post>[] {
  const rows: QuietFeedRow<Post>[] = [];
  posts.forEach((post, index) => {
    rows.push({ kind: 'post', post, generation });
    if (index === 0 && showBuddyRail) {
      rows.push({ kind: 'buddies', id: 'suggested-buddies', generation });
    }
    if (showAds && (index + 1) % adEvery === 0) {
      rows.push({ kind: 'ad', id: `ad-${post.id}`, generation });
    }
  });
  return rows;
}
