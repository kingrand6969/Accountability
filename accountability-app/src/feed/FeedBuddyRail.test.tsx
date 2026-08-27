import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { FeedBuddyRail } from './FeedBuddyRail';
import type { Candidate } from '../buddy/api';

jest.mock('../ui/AppThemeProvider', () => ({
  useAppTheme: () => ({ colors: jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark') }),
}));

jest.mock('./Avatar', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Avatar = jest.fn(({ name }: { name: string | null }) => mockReact.createElement(
    MockView,
    { testID: 'feed-buddy-avatar', accessibilityLabel: name ?? 'unknown' },
  ));
  return {
    Avatar,
  };
});

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const candidates: Candidate[] = [
  { id: 'buddy-1', display_name: 'Alex', avatar_url: null, area: 'Perth' },
  { id: 'buddy-2', display_name: 'Blair', avatar_url: null, area: 'Perth' },
  { id: 'buddy-3', display_name: 'Casey', avatar_url: null, area: 'Perth' },
  { id: 'buddy-4', display_name: 'Devon', avatar_url: null, area: 'Perth' },
  { id: 'buddy-5', display_name: 'Emery', avatar_url: null, area: 'Perth' },
];

function renderRail(overrides: Partial<React.ComponentProps<typeof FeedBuddyRail>> = {}) {
  const onOpen = jest.fn();
  const onAdd = jest.fn();
  const onSeeAll = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <FeedBuddyRail
        candidates={candidates}
        busyIds={new Set()}
        onOpen={onOpen}
        onAdd={onAdd}
        onSeeAll={onSeeAll}
        {...overrides}
      />,
    );
  });
  return { renderer, onOpen, onAdd, onSeeAll };
}

describe('FeedBuddyRail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows only the first four suggested buddies', () => {
    const { renderer } = renderRail();

    expect(renderer.root.findAll((node) => node.type === View && node.props.testID === 'feed-buddy-avatar')).toHaveLength(4);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Emery' })).toHaveLength(0);
  });

  test('passes the fallback member name to Avatar for an unnamed candidate', () => {
    renderRail({ candidates: [{ id: 'buddy-empty', display_name: null, avatar_url: null, area: null }] });
    const { Avatar } = jest.requireMock('./Avatar') as { Avatar: jest.Mock };

    expect(Avatar).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AccountAbility member', size: 44 }),
      undefined,
    );
  });

  test('opens, adds, and reveals suggestions through their accessible actions', () => {
    const { renderer, onAdd, onOpen, onSeeAll } = renderRail();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Open Buddy Card for Blair' }).props.onPress();
      renderer.root.findByProps({ accessibilityLabel: 'Add Casey as a buddy' }).props.onPress();
      renderer.root.findByProps({ accessibilityLabel: 'See all suggested buddies' }).props.onPress();
    });

    expect(onOpen).toHaveBeenCalledWith(candidates[1]);
    expect(onAdd).toHaveBeenCalledWith(candidates[2]);
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  test('keeps the rail flat without card border or elevation', () => {
    const { renderer } = renderRail();
    const root = renderer.root.findByProps({ testID: 'feed-buddy-rail' });
    const styles = Array.isArray(root.props.style) ? root.props.style : [root.props.style];
    const resolved = Object.assign({}, ...styles);

    expect(resolved.borderWidth).toBeUndefined();
    expect(resolved.elevation).toBeUndefined();
  });

  test('marks an in-flight request as busy and disabled', () => {
    const { renderer } = renderRail({ busyIds: new Set(['buddy-1']) });
    const action = renderer.root.findByProps({ accessibilityLabel: 'Add Alex as a buddy' });

    expect(action.props.accessibilityState).toEqual({ busy: true, disabled: true });
  });
});
