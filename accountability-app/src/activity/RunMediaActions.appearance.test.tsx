import React from 'react';
import { StyleSheet } from 'react-native';
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
    expect(StyleSheet.flatten(feed.props.style({ pressed: false }))).toMatchObject({
      minHeight: 56,
      borderRadius: 999,
      backgroundColor: '#121512',
      borderWidth: 1,
      borderColor: '#272D27',
    });
    expect(StyleSheet.flatten(feed.props.style({ pressed: true }))).toMatchObject({
      opacity: 0.75,
    });
    expect(StyleSheet.flatten(renderer.root.findByProps({ children: 'Continue to Feed' }).props.style)).toMatchObject({
      color: '#B9FF3D',
      textTransform: 'uppercase',
    });
    expect(renderer.root.findByProps({ name: 'arrow-forward' }).props.color).toBe('#B9FF3D');
    const utility = renderer.root.findByProps({ accessibilityLabel: 'Add to My Day' });
    expect(StyleSheet.flatten(utility.props.style({ pressed: false }))).toMatchObject({
      minHeight: 48,
      backgroundColor: '#181C18',
      borderColor: '#272D27',
    });
    act(() => feed.props.onPress());
    expect(onContinueToFeed).toHaveBeenCalledTimes(1);

    const myDay = renderer.root.findByProps({ accessibilityLabel: 'Add to My Day' });
    await act(async () => myDay.props.onPress());
    expect(onMyDay).toHaveBeenCalledTimes(1);
    expect(onDestination).not.toHaveBeenCalled();
    const completedMyDay = renderer.root.findByProps({ accessibilityLabel: 'Add to My Day' });
    expect(StyleSheet.flatten(completedMyDay.props.style({ pressed: false }))).toMatchObject({
      minHeight: 48,
      backgroundColor: '#181C18',
      borderColor: '#87E38D',
    });
    expect(StyleSheet.flatten(renderer.root.findByProps({ children: 'Added to My Day' }).props.style)).toMatchObject({
      color: '#87E38D',
    });
    expect(renderer.root.findByProps({ name: 'checkmark-circle' }).props.color).toBe('#87E38D');
    expect(JSON.stringify(completedMyDay.props.style({ pressed: false }))).not.toContain('#B9FF3D');

    const saveImage = renderer.root.findByProps({ accessibilityLabel: 'Save image' });
    await act(async () => saveImage.props.onPress());
    expect(onDestination).toHaveBeenCalledWith('phone');
    const imageSaved = renderer.root.findByProps({ children: 'Image saved' });
    expect(StyleSheet.flatten(imageSaved.props.style)).toMatchObject({ color: '#87E38D' });
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

  test('shows one concise destination error at a time instead of raw stacked failures', async () => {
    const onMyDay = jest.fn(async () => {
      throw new Error('Upload service is out of date. Please try again shortly.');
    });
    const onDestination = jest.fn(async () => {
      throw new Error(
        'Method createAssetAsync imported from "expo-media-library" is deprecated.\nhttps://docs.expo.dev/',
      );
    });
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <RunMediaActions
          onContinueToFeed={jest.fn()}
          onMyDay={onMyDay}
          onDestination={onDestination}
        />,
      );
    });

    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Add to My Day' }).props.onPress();
    });
    expect([...new Set(renderer.root.findAllByProps({ accessibilityRole: 'alert' }).map((node) => node.props.children))]).toEqual([
      'Couldn’t add this run to My Day. Your run is still saved—try again.',
    ]);

    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Save image' }).props.onPress();
    });
    expect([...new Set(renderer.root.findAllByProps({ accessibilityRole: 'alert' }).map((node) => node.props.children))]).toEqual([
      'Couldn’t save this image to your phone. Your run is still saved—try again.',
    ]);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('createAssetAsync');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('docs.expo.dev');
    act(() => renderer.unmount());
  });
});
