import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { FeedProofCard } from './FeedProofCard';
import type { FeedPost } from './types';
import { spacing } from '../ui/theme';

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

function renderCard(
  post: FeedPost,
  fontScale: number,
  width: number,
  overrides: Partial<React.ComponentProps<typeof FeedProofCard>> = {},
) {
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
        {...overrides}
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

  test('keeps post options, Attend, and supporter summary targets at least 48dp', () => {
    const eventPost: FeedPost = {
      ...basePost,
      id: 'event-post',
      image_url: null,
      body: 'Weekend long run',
      post_type: 'event',
      share_data: {},
      activity_id: null,
      event: {
        id: 'event-1',
        title: 'Saturday long run',
        starts_at: '2026-09-12T07:00:00.000Z',
        location: 'Kings Park',
        group_id: 'group-1',
      },
    };
    const renderer = renderCard(eventPost, 1, 360, {
      preview: {
        count: 1,
        people: [{ id: 'buddy-1', name: 'Blair', avatar_url: null }],
        voices: 0,
      },
    });

    const postOptions = StyleSheet.flatten(
      renderer.root.findByProps({ accessibilityLabel: 'Post options' }).props.style({ pressed: false }),
    );
    const attend = StyleSheet.flatten(
      renderer.root.findByProps({ accessibilityLabel: 'Attend Saturday long run' }).props.style({ pressed: false }),
    );
    const supporters = StyleSheet.flatten(
      renderer.root.findByProps({ accessibilityLabel: '1 buddy has cheered this post' }).props.style({ pressed: false }),
    );

    expect(postOptions.width ?? postOptions.minWidth).toBeGreaterThanOrEqual(spacing.touch);
    expect(postOptions.height ?? postOptions.minHeight).toBeGreaterThanOrEqual(spacing.touch);
    expect(attend.minWidth).toBeGreaterThanOrEqual(spacing.touch);
    expect(attend.minHeight).toBeGreaterThanOrEqual(spacing.touch);
    expect(supporters.minWidth).toBeGreaterThanOrEqual(spacing.touch);
    expect(supporters.minHeight).toBeGreaterThanOrEqual(spacing.touch);
  });
});
