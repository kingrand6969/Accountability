import { afterEach, describe, expect, test, jest } from '@jest/globals';
import { createElement } from 'react';
import { AppState, type ViewToken } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { FeedPost } from './types';
import { useActiveVideoList, type VideoFeedRow } from './useActiveVideoList';

const videoPost = (id: string) => ({
  id,
  post_type: 'video',
  image_url: `${id}.mp4`,
} as FeedPost);

type Result = ReturnType<typeof useActiveVideoList>;

function Probe(props: {
  posts: FeedPost[];
  scopeKey: string;
  focused: boolean;
  blocked: boolean;
  onRender(result: Result): void;
}) {
  props.onRender(useActiveVideoList(props));
  return null;
}

describe('useActiveVideoList', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps identical visible rows active across refresh blocking without another scroll event', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    let latest!: Result;
    let renderer!: TestRenderer.ReactTestRenderer;
    const render = (blocked: boolean, posts = [videoPost('video-a')], scopeKey = 'user-a:group-a') =>
      createElement(Probe, {
        posts,
        scopeKey,
        focused: true,
        blocked,
        onRender: (result) => { latest = result; },
      });

    await act(async () => { renderer = TestRenderer.create(render(false)); });
    expect(latest.activeVideoId).toBeNull();
    await act(async () => {
      latest.onViewableItemsChanged({
        viewableItems: [{ item: latest.rows[0] } as ViewToken<VideoFeedRow>],
      });
    });
    expect(latest.activeVideoId).toBe('video-a');

    await act(async () => renderer.update(render(true)));
    expect(latest.activeVideoId).toBeNull();
    await act(async () => renderer.update(render(false, [videoPost('video-a')])));
    expect(latest.activeVideoId).toBe('video-a');

    await act(async () => renderer.update(render(false, [videoPost('video-a')], 'user-b:group-a')));
    expect(latest.activeVideoId).toBeNull();
    await act(async () => renderer.unmount());
  });

  test('rejects stale visibility when the actual row identity dataset changes', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    let latest!: Result;
    let renderer!: TestRenderer.ReactTestRenderer;
    const render = (posts: FeedPost[]) => createElement(Probe, {
      posts,
      scopeKey: 'user-a:page-a',
      focused: true,
      blocked: false,
      onRender: (result) => { latest = result; },
    });
    await act(async () => { renderer = TestRenderer.create(render([videoPost('video-a')])); });
    await act(async () => {
      latest.onViewableItemsChanged({
        viewableItems: [{ item: latest.rows[0] } as ViewToken<VideoFeedRow>],
      });
    });
    expect(latest.activeVideoId).toBe('video-a');
    await act(async () => renderer.update(render([videoPost('video-b')])));
    expect(latest.activeVideoId).toBeNull();
    await act(async () => renderer.unmount());
  });
});
