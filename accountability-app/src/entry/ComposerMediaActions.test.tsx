import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { ComposerMediaActions, type ComposerMediaActionItem } from './ComposerMediaActions';

jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => mounted.splice(0).forEach((renderer) => act(() => renderer.unmount())));

function actions(): ComposerMediaActionItem[] {
  return [
    { id: 'selfie', icon: 'camera-outline', tone: 'action', label: 'Take selfie', onPress: jest.fn() },
    { id: 'photo', icon: 'image-outline', tone: 'action', label: 'Choose photo', onPress: jest.fn() },
    { id: 'video', icon: 'videocam-outline', tone: 'danger', label: 'Choose video', onPress: jest.fn() },
    { id: 'event', icon: 'calendar-outline', tone: 'success', label: 'Event', onPress: jest.fn() },
  ];
}

describe('ComposerMediaActions', () => {
  test('renders a narrow large-text layout as a wrapping 2x2 grid with 48-point controls', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ComposerMediaActions
          availableWidth={320}
          fontScale={2}
          bottomInset={0}
          actions={actions()}
        />,
      );
    });
    mounted.push(renderer);

    const controls = ['selfie', 'photo', 'video', 'event'].map((id) => (
      renderer.root.findByProps({ testID: `composer-action-${id}` })
    ));
    expect(controls).toHaveLength(4);
    for (const control of controls) {
      const style = StyleSheet.flatten(control.props.style({ pressed: false }));
      expect(style.width).toBeLessThanOrEqual(140);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
    }

    const labels = renderer.root.findAllByType(Text);
    expect(labels.map((label) => label.props.children)).toEqual([
      'Take selfie',
      'Choose photo',
      'Choose video',
      'Event',
    ]);
    for (const label of labels) {
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.allowFontScaling).not.toBe(false);
    }
  });
});
