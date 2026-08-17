import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PostVideo } from './PostVideo';

const mockPause = jest.fn();
type MockPlayer = { pause: typeof mockPause; loop: boolean; muted: boolean };
const mockUseVideoPlayer = jest.fn((_url: string, setup: (player: MockPlayer) => void) => {
  const player = { pause: mockPause, loop: false, muted: false };
  setup(player);
  return player;
});

jest.mock('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: (url: string, setup: (player: MockPlayer) => void) => mockUseVideoPlayer(url, setup),
}));

jest.mock('../media/useResolvedMediaUrl', () => ({
  useResolvedMediaUrl: (url: string) => url,
}));

describe('PostVideo lifecycle', () => {
  afterEach(() => {
    mockPause.mockReset();
    mockUseVideoPlayer.mockClear();
  });

  it('does not create a video player while inactive', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(createElement(PostVideo, { url: 'video.mp4', active: false }));
    });
    expect(mockUseVideoPlayer).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('VideoView' as never)).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('mounts one player only while active and pauses it before unmount', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(createElement(PostVideo, { url: 'video.mp4', active: true }));
    });
    expect(mockUseVideoPlayer).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('VideoView' as never)).toHaveLength(1);

    await act(async () => {
      renderer.update(createElement(PostVideo, { url: 'video.mp4', active: false }));
    });
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('VideoView' as never)).toHaveLength(0);
    await act(async () => renderer.unmount());
  });
});
