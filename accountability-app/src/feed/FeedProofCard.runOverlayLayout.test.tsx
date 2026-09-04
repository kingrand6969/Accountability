import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { FeedProofCard } from './FeedProofCard';
import type { FeedPost } from './types';

const mockReact = React;
const mockView = View;
const mockWindowDimensions = jest.fn(() => ({
  width: 360,
  height: 640,
  scale: 1,
  fontScale: 1,
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions(),
}));

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: Record<string, unknown>) => mockReact.createElement(
    mockView,
    { testID: 'run-overlay-gradient', ...props },
  ),
}));
jest.mock('../activity/RouteTrace', () => ({
  RouteTrace: (props: Record<string, unknown>) => mockReact.createElement(
    mockView,
    { testID: 'run-overlay-route', ...props },
  ),
}));
jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark'),
  }),
}));
jest.mock('../memories/SaveToMemories', () => ({ SaveToMemories: () => null }));
jest.mock('./Avatar', () => ({ Avatar: () => null }));
jest.mock('./PostImage', () => ({
  PostImage: () => mockReact.createElement(mockView, { testID: 'feed-post-image' }),
}));
jest.mock('./PostVideo', () => ({
  PostVideo: () => mockReact.createElement(mockView, { testID: 'feed-post-video' }),
}));
jest.mock('./ProofHeadlineOverlay', () => ({ ProofHeadlineOverlay: () => null }));
jest.mock('./SocialModeSelector', () => ({
  deriveFeedCardPresentation: () => ({
    ownerLabel: 'Alex',
    audienceLabel: 'Public',
    redacted: false,
  }),
}));

const basePost: FeedPost = {
  id: 'run-post',
  body: 'Morning run',
  image_url: 'run.jpg',
  created_at: '2026-08-27T08:00:00.000Z',
  user_id: 'owner-a',
  author_name: 'Alex',
  author_avatar: null,
  like_count: 0,
  comment_count: 0,
  liked_by_me: false,
  audience: 'public',
  post_type: 'run',
  share_data: {
    verified: true,
    distance_m: 5000,
    duration_s: 1500,
    route: [
      { lat: -31.95, lon: 115.86 },
      { lat: -31.96, lon: 115.87 },
    ],
  },
  activity_id: 'activity-1',
  tagged: [],
  event: null,
};

function renderCard(post: FeedPost, fontScale: number, width: number) {
  mockWindowDimensions.mockReturnValue({ width, height: 640, scale: 1, fontScale });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <FeedProofCard
        post={post}
        currentUserId="viewer"
        attending={false}
        onOpen={jest.fn()}
        onComment={jest.fn()}
        onMenu={jest.fn()}
        onAttend={jest.fn()}
        onToggleLike={jest.fn()}
        onShare={jest.fn()}
        onOpenEncouragement={jest.fn()}
      />,
    );
  });
  return renderer;
}

function mediaStyle(renderer: TestRenderer.ReactTestRenderer) {
  const media = renderer.root.findByProps({ accessibilityRole: 'link' });
  return StyleSheet.flatten(media.props.style({ pressed: false }));
}

describe('FeedProofCard run overlay allocation', () => {
  beforeEach(() => {
    mockWindowDimensions.mockClear();
  });

  test.each([320, 360])(
    'allocates the full 286dp overlay inside production run media at 2.0 scale on %idp',
    (width) => {
      const renderer = renderCard(basePost, 2, width);
      const media = mediaStyle(renderer);
      const overlay = StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'run-route-metric-overlay' }).props.style,
      );

      expect(mockWindowDimensions).toHaveBeenCalled();
      expect(overlay.height).toBe(286);
      expect(media.minHeight).toBeGreaterThanOrEqual(overlay.height);
      expect(renderer.root.findAll(
        (node) => node.type === View && node.props.testID === 'feed-post-image',
      )).toHaveLength(1);
    },
  );

  test('keeps the normal-scale run wrapper at its existing 220dp minimum', () => {
    const renderer = renderCard(basePost, 1, 360);

    expect(mediaStyle(renderer).minHeight).toBe(220);
    expect(StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-route-metric-overlay' }).props.style,
    ).height).toBe(138);
  });

  test('keeps large-text video media at natural height and renders no run overlay', () => {
    const renderer = renderCard({
      ...basePost,
      id: 'video-post',
      body: '',
      post_type: 'video',
      share_data: {},
    }, 2, 320);

    expect(mediaStyle(renderer).minHeight).toBeUndefined();
    expect(renderer.root.findAll(
      (node) => node.type === View && node.props.testID === 'feed-post-video',
    )).toHaveLength(1);
    expect(renderer.root.findAllByProps({ testID: 'run-route-metric-overlay' })).toHaveLength(0);
  });
});
