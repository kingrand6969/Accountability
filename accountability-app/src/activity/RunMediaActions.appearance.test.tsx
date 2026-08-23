import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';

import { RunMediaActions } from './RunMediaActions';

describe('completed Run sharing actions', () => {
  test('puts Feed first and keeps the optional destinations separate', async () => {
    const onContinueToFeed = jest.fn();
    const onMyDay = jest.fn(async () => {});
    const onDestination = jest.fn(async () => {});
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <RunMediaActions
          onContinueToFeed={onContinueToFeed}
          onMyDay={onMyDay}
          onDestination={onDestination}
        />,
      );
    });

    const feed = renderer.root.findByProps({ accessibilityLabel: 'Continue to Feed' });
    expect(feed.props.accessibilityState).toEqual({ disabled: false });
    act(() => feed.props.onPress());
    expect(onContinueToFeed).toHaveBeenCalledTimes(1);

    const myDay = renderer.root.findByProps({ accessibilityLabel: 'Add to My Day' });
    await act(async () => myDay.props.onPress());
    expect(onMyDay).toHaveBeenCalledTimes(1);
    expect(onDestination).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  test('disables Feed truthfully while the saved run is still syncing', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <RunMediaActions
          onContinueToFeed={jest.fn()}
          onMyDay={jest.fn(async () => {})}
          onDestination={jest.fn(async () => {})}
          activityQueued
        />,
      );
    });

    const feed = renderer.root.findByProps({ accessibilityLabel: 'Continue to Feed' });
    expect(feed.props.accessibilityState).toEqual({ disabled: true });
    expect(renderer.root.findByProps({
      children: 'Post to Feed is available after this activity syncs.',
    })).toBeTruthy();
    act(() => renderer.unmount());
  });
});
