import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('private image consumer boundary', () => {
  it.each([
    'src/feed/Avatar.tsx',
    'src/feed/PostImage.tsx',
    'src/buddy/BuddyCardProfilePhoto.tsx',
    'src/buddy/BuddyCardFace.tsx',
    'src/discover/DiscoverExperience.tsx',
    'src/app/buddy-card/[id].tsx',
    'src/app/edit-profile.tsx',
    'src/app/(app)/profile.tsx',
  ])('%s uses the image-only resolver', (path) => {
    const value = source(path);
    expect(value).toContain('useResolvedImageUrl');
    expect(value).not.toContain('useResolvedMediaUrl');
  });

  it('does not pass raw Buddy Card or Discover avatar references to native image views', () => {
    expect(source('src/buddy/BuddyCardFace.tsx')).not.toContain('source={{ uri: avatar }}');

    const discover = source('src/discover/DiscoverExperience.tsx');
    expect(discover).not.toContain(
      'source={{ uri: card?.card.bg_url || card?.avatar || person.avatar_url! }}',
    );
  });

  it.each([
    'src/app/menu.tsx',
    'src/app/(app)/activity.tsx',
    'src/app/(app)/run.tsx',
    'src/app/invite-card.tsx',
  ])('%s resolves its raw profile avatar before native rendering', (path) => {
    expect(source(path)).toContain('useResolvedImageUrl');
  });

  it('keeps video and voice media on the streaming resolver', () => {
    expect(source('src/feed/PostVideo.tsx')).toContain('useResolvedMediaUrl');
    expect(source('src/feed/PostVideo.tsx')).not.toContain('useResolvedImageUrl');
    expect(source('src/feed/EncouragementSheet.tsx')).toContain('useResolvedMediaUrl');
    expect(source('src/feed/EncouragementSheet.tsx')).not.toContain('useResolvedImageUrl');
  });
});
