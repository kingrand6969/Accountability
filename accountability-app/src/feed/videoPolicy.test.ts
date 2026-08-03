import { describe, expect, test } from '@jest/globals';
import {
  MAX_POST_VIDEO_BYTES,
  MAX_POST_VIDEO_DURATION_MS,
  validatePostVideo,
  videoExtensionForMime,
} from './videoPolicy';

describe('post video policy', () => {
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
