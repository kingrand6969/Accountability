import { describe, expect, test } from '@jest/globals';
import {
  activeVideoPost,
  MAX_POST_VIDEO_BYTES,
  MAX_POST_VIDEO_DURATION_MS,
  validatePostVideo,
  videoExtensionForMime,
} from './videoPolicy';

describe('post video policy', () => {
  test('selects only the first eligible visible video while playback is allowed', () => {
    expect(activeVideoPost({
      focused: true,
      appActive: true,
      overlayOpen: false,
      generation: 'user-a:buddies:1',
      visibilityGeneration: 'user-a:buddies:1',
      visiblePostIds: ['video-a', 'video-b'],
      eligibleVideoIds: ['video-a', 'video-b'],
    })).toBe('video-a');
  });

  test('skips visible image posts and uses feed order to break viewability ties', () => {
    expect(activeVideoPost({
      focused: true,
      appActive: true,
      overlayOpen: false,
      generation: 'current',
      visibilityGeneration: 'current',
      visiblePostIds: ['image', 'video-b', 'video-a'],
      eligibleVideoIds: ['video-a', 'video-b'],
    })).toBe('video-b');
  });

  test.each([
    { focused: false, appActive: true, overlayOpen: false },
    { focused: true, appActive: false, overlayOpen: false },
    { focused: true, appActive: true, overlayOpen: true },
  ])('disables playback when the screen, app, or an overlay blocks it', (lifecycle) => {
    expect(activeVideoPost({
      ...lifecycle,
      generation: 'current',
      visibilityGeneration: 'current',
      visiblePostIds: ['video-a'],
      eligibleVideoIds: ['video-a'],
    })).toBeNull();
  });

  test('rejects stale viewability after the dataset or account generation changes', () => {
    expect(activeVideoPost({
      focused: true,
      appActive: true,
      overlayOpen: false,
      generation: 'user-b:buddies:2',
      visibilityGeneration: 'user-a:buddies:1',
      visiblePostIds: ['video-a'],
      eligibleVideoIds: ['video-a'],
    })).toBeNull();
  });
  test('accepts a supported video inside the duration and size limits', () => {
    expect(
      validatePostVideo({
        mimeType: 'video/mp4',
        durationMs: MAX_POST_VIDEO_DURATION_MS,
        fileSize: MAX_POST_VIDEO_BYTES,
      }),
    ).toEqual({ ok: true });
  });

  test('rejects videos longer than one minute', () => {
    expect(
      validatePostVideo({
        mimeType: 'video/mp4',
        durationMs: MAX_POST_VIDEO_DURATION_MS + 1,
        fileSize: 1,
      }),
    ).toEqual({ ok: false, message: 'Choose a video that is 60 seconds or shorter.' });
  });

  test('rejects videos larger than 50 MB', () => {
    expect(
      validatePostVideo({
        mimeType: 'video/mp4',
        durationMs: 1,
        fileSize: MAX_POST_VIDEO_BYTES + 1,
      }),
    ).toEqual({ ok: false, message: 'Choose a video smaller than 50 MB.' });
  });

  test('maps supported video mime types to safe extensions', () => {
    expect(videoExtensionForMime('video/mp4')).toBe('mp4');
    expect(videoExtensionForMime('video/quicktime')).toBe('mov');
    expect(videoExtensionForMime('video/webm')).toBe('webm');
    expect(videoExtensionForMime('application/octet-stream')).toBeNull();
  });
});
