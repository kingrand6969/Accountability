import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('../app/story/[userId]'), 'utf8');

describe('story viewer receipt contract', () => {
  test('marks the actually displayed story without blocking viewing or advancing', () => {
    expect(source).toContain('markStoryViewed');
    expect(source).toContain('dataViewKey !== viewKey');
    expect(source).toContain('void markStoryViewed(displayedStoryId, ownerId).catch(() => {})');
    expect(source).toContain('}, [displayedStoryId, ownerId, viewKey, dataViewKey]);');
  });

  test('delegates timing to one lifecycle owner and gates it by focus and foreground', () => {
    expect(source).toContain('createStoryPlaybackLifecycle');
    expect(source).toContain("AppState.addEventListener('change'");
    expect(source).toContain('playback.setPlayable(');
    expect(source).toContain('playback.show(displayedStoryId)');
    expect(source).not.toContain('playback.current');
    expect(source).not.toContain('setTimeout(goNext');
  });
});
