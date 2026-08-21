import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Switch, Text } from 'react-native';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { postVisibilityCopy } from '../progress/visibility';
import { PostVisibilitySwitch } from './PostVisibilitySwitch';

jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => mounted.splice(0).forEach((renderer) => act(() => renderer.unmount())));

describe('PostVisibilitySwitch', () => {
  test('renders the privacy-safe Off state and a 48-point effective target', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<PostVisibilitySwitch showPublicly={false} onChange={jest.fn()} />); });
    mounted.push(renderer);
    const control = renderer.root.findByType(Switch);
    expect(control.props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(control.props.accessibilityLabel).toBe(postVisibilityCopy(false).accessibilityLabel);
    expect(control.props.accessibilityHint).toBe(postVisibilityCopy(false).helper);
    expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'post-visibility-switch-target' }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(renderer.root.findAllByType(Text).map((node) => node.props.children).join(' ')).toContain('Buddies only');
  });

  test('announces Public plus Buddy Card and forwards the one boolean change', () => {
    const onChange = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<PostVisibilitySwitch showPublicly onChange={onChange} />); });
    mounted.push(renderer);
    const control = renderer.root.findByType(Switch);
    expect(control.props.accessibilityState.checked).toBe(true);
    expect(renderer.root.findAllByType(Text).map((node) => node.props.children).join(' ')).toContain('Public + Buddy Card');
    act(() => control.props.onValueChange(false));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
