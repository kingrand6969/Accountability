import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const screenSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/buddy-card/[id].tsx'),
  'utf8',
);

describe('Buddy Card recent-post media contract', () => {
  test('authorizes opaque photos before cached rendering without changing card access or interaction', () => {
    expect(screenSource).toContain("import { CachedImage } from '../../ui/CachedImage';");
    expect(screenSource).toContain(
      "import { useResolvedImageUrl } from '../../media/useResolvedImageUrl';",
    );

    const thumbnailStart = screenSource.indexOf('function BuddyCardPostThumbnail');
    const screenStart = screenSource.indexOf('export default function BuddyCardScreen');
    expect(thumbnailStart).toBeGreaterThan(-1);
    expect(screenStart).toBeGreaterThan(thumbnailStart);
    const thumbnailSource = screenSource.slice(thumbnailStart, screenStart);

    expect(thumbnailSource).toContain(
      "useResolvedImageUrl(post.post_type === 'video' ? null : post.image_url)",
    );
    expect(thumbnailSource).toContain('<CachedImage');
    expect(thumbnailSource).toContain('uri={resolvedImageUrl}');
    expect(thumbnailSource).not.toContain('uri={post.image_url}');
    expect(thumbnailSource).toContain('style={imageStyle}');
    expect(thumbnailSource).toContain('style={placeholderStyle}');
    expect(thumbnailSource).toContain(
      "post.post_type === 'video' ? 'videocam-outline' : 'chatbox-ellipses-outline'",
    );

    const recentPostsStart = screenSource.indexOf(
      '{/* Buddies see recent posts; non-buddies only see owner-selected public posts. */}',
    );
    const recentPostsEnd = screenSource.indexOf('{ownerView ? (', recentPostsStart);
    const recentPostsSource = screenSource.slice(recentPostsStart, recentPostsEnd);

    expect(recentPostsSource).toContain('ownerView || isBuddy || view.card.show_posts');
    expect(recentPostsSource).toContain('<BuddyCardPostThumbnail');
    expect(recentPostsSource).toContain(
      'imageStyle={ownerView || isBuddy ? styles.postThumb : styles.publicPostImage}',
    );
    expect(recentPostsSource).toContain('styles.postThumbFallback');
    expect(recentPostsSource).toContain(
      "router.push({ pathname: '/post/[id]', params: { id: p.id } })",
    );
    expect(recentPostsSource).not.toContain('source={{ uri: p.image_url }}');
    expect(screenSource).toContain("const fullView = mode === 'self' || mode === 'buddy';");
    expect(screenSource).toContain('listCardPosts(targetId, fullView)');
  });
});
