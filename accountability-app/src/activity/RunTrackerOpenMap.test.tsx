import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
  RunTrackerOpenMap,
  type RunTrackerOpenMapProps,
  type RunTrackerPrimaryAction,
} from './RunTrackerOpenMap';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const mounted: TestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  mounted.splice(0).forEach((renderer) => act(() => renderer.unmount()));
});

function idleAction(overrides: Partial<RunTrackerPrimaryAction> = {}): RunTrackerPrimaryAction {
  return {
    label: 'Start Run',
    icon: 'play',
    tone: 'primary',
    disabled: false,
    onPress: jest.fn(),
    ...overrides,
  };
}

function props(overrides: Partial<RunTrackerOpenMapProps> = {}): RunTrackerOpenMapProps {
  return {
    selectedActivity: 'run',
    activitySelectorDisabled: false,
    onSelectActivity: jest.fn(),
    onBack: jest.fn(),
    onMore: jest.fn(),
    onCenterMap: jest.fn(),
    onShowRoute: jest.fn(),
    routeOverviewAvailable: true,
    statusTitle: 'Ready to run',
    statusDetail: 'GPS checks when you start',
    distance: '0.00',
    elapsed: '00:00',
    pace: '--:--',
    estimatedCalories: 0,
    primaryAction: idleAction(),
    viewportWidth: 390,
    viewportHeight: 844,
    fontScale: 1,
    safeTop: 24,
    safeBottom: 20,
    sideInset: 0,
    ...overrides,
  };
}

function render(overrides: Partial<RunTrackerOpenMapProps> = {}) {
  let renderer!: TestRenderer.ReactTestRenderer;
  const componentProps = props(overrides);
  act(() => {
    renderer = TestRenderer.create(<RunTrackerOpenMap {...componentProps} />);
  });
  mounted.push(renderer);
  return { renderer, componentProps };
}

function byLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function press(renderer: TestRenderer.ReactTestRenderer, label: string) {
  act(() => byLabel(renderer, label).props.onPress());
}

function flattenedControlStyle(node: TestRenderer.ReactTestInstance) {
  const rawStyle = typeof node.props.style === 'function'
    ? node.props.style({ pressed: false })
    : node.props.style;
  return StyleSheet.flatten(rawStyle);
}

describe('RunTrackerOpenMap', () => {
  test('renders the approved idle hierarchy and isolates every matching callback', () => {
    const { renderer, componentProps } = render();

    expect(byLabel(renderer, 'Run').props.accessibilityRole).toBe('tab');
    expect(byLabel(renderer, 'Run').props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(byLabel(renderer, 'Walk').props.accessibilityState.selected).toBe(false);
    expect(byLabel(renderer, 'Ride').props.accessibilityState.selected).toBe(false);

    expect(byLabel(renderer, 'Distance 0.00 kilometres')).toBeTruthy();
    expect(byLabel(renderer, 'Elapsed time 00:00')).toBeTruthy();
    expect(byLabel(renderer, 'Pace unavailable')).toBeTruthy();
    expect(byLabel(renderer, 'Estimated calories 0')).toBeTruthy();
    expect(byLabel(renderer, 'Ready to run. GPS checks when you start')).toBeTruthy();
    expect(byLabel(renderer, 'Center map on my location')).toBeTruthy();
    expect(byLabel(renderer, 'Show complete route')).toBeTruthy();
    expect(byLabel(renderer, 'Start Run')).toBeTruthy();

    press(renderer, 'Walk');
    expect(componentProps.onSelectActivity).toHaveBeenCalledWith('walk');
    expect(componentProps.onBack).not.toHaveBeenCalled();
    expect(componentProps.onMore).not.toHaveBeenCalled();
    expect(componentProps.onCenterMap).not.toHaveBeenCalled();
    expect(componentProps.onShowRoute).not.toHaveBeenCalled();
    expect(componentProps.primaryAction.onPress).not.toHaveBeenCalled();

    press(renderer, 'Center map on my location');
    expect(componentProps.onCenterMap).toHaveBeenCalledTimes(1);
    expect(componentProps.onShowRoute).not.toHaveBeenCalled();
    expect(componentProps.primaryAction.onPress).not.toHaveBeenCalled();

    press(renderer, 'Show complete route');
    expect(componentProps.onShowRoute).toHaveBeenCalledTimes(1);
    expect(componentProps.primaryAction.onPress).not.toHaveBeenCalled();

    press(renderer, 'Back');
    expect(componentProps.onBack).toHaveBeenCalledTimes(1);
    expect(componentProps.onMore).not.toHaveBeenCalled();

    press(renderer, 'More options');
    expect(componentProps.onMore).toHaveBeenCalledTimes(1);

    press(renderer, 'Start Run');
    expect(componentProps.primaryAction.onPress).toHaveBeenCalledTimes(1);
  });

  test('disables all activity tabs together when the recording state locks selection', () => {
    const onSelectActivity = jest.fn();
    const { renderer } = render({ activitySelectorDisabled: true, onSelectActivity });

    for (const label of ['Run', 'Walk', 'Ride']) {
      const tab = byLabel(renderer, label);
      expect(tab.props.disabled).toBe(true);
      expect(tab.props.accessibilityState.disabled).toBe(true);
    }

    expect(onSelectActivity).not.toHaveBeenCalled();
  });

  test('truthfully disables route overview until enough route geometry exists', () => {
    const onShowRoute = jest.fn();
    const { renderer } = render({ routeOverviewAvailable: false, onShowRoute });
    const routeControl = byLabel(renderer, 'Show complete route');

    expect(routeControl.props.disabled).toBe(true);
    expect(routeControl.props.accessibilityState).toEqual({ disabled: true });
    expect(routeControl.props.accessibilityHint).toMatch(/unavailable/i);
    expect(onShowRoute).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'starting',
      action: idleAction({ label: 'Starting…', disabled: true }),
      expectedTone: 'primary',
    },
    {
      name: 'tracking',
      action: idleAction({ label: 'Stop & Save', icon: 'stop', tone: 'danger' }),
      expectedTone: 'danger',
    },
    {
      name: 'pending save',
      action: idleAction({ label: 'Retry save', icon: 'refresh', tone: 'primary' }),
      expectedTone: 'primary',
    },
  ])('renders the $name action state without changing the action contract', ({ action, expectedTone }) => {
    const { renderer } = render({ primaryAction: action });
    const control = byLabel(renderer, action.label);

    expect(control.props.disabled).toBe(action.disabled);
    expect(control.props.accessibilityState).toEqual({
      busy: action.label === 'Starting…',
      disabled: action.disabled,
    });
    expect(control.props.testID).toBe(`run-primary-action-${expectedTone}`);

    if (!action.disabled) {
      press(renderer, action.label);
      expect(action.onPress).toHaveBeenCalledTimes(1);
    }
  });

  test('gives every direct control an effective target of at least 48 by 48 points', () => {
    const { renderer } = render();
    const controls = [
      'Back',
      'Run',
      'Walk',
      'Ride',
      'More options',
      'Center map on my location',
      'Show complete route',
      'Start Run',
    ].map((label) => byLabel(renderer, label));

    expect(controls.length).toBe(8);
    for (const control of controls) {
      const style = flattenedControlStyle(control);
      const effectiveWidth = style.width ?? style.minWidth;
      const effectiveHeight = style.height ?? style.minHeight;
      expect(effectiveWidth).toBeGreaterThanOrEqual(48);
      expect(effectiveHeight).toBeGreaterThanOrEqual(48);
    }
  });

  test('keeps the 200% text composition ordered, scalable, and free of clipped labels', () => {
    const { renderer } = render({
      viewportWidth: 320,
      viewportHeight: 568,
      fontScale: 2,
      safeTop: 24,
      safeBottom: 20,
      sideInset: 16,
    });

    const status = renderer.root.findByProps({ testID: 'run-open-map-status' });
    const metrics = renderer.root.findByProps({ testID: 'run-open-map-primary-metrics' });
    const secondary = renderer.root.findByProps({ testID: 'run-open-map-secondary-metrics' });
    const action = byLabel(renderer, 'Start Run');
    const statusStyle = StyleSheet.flatten(status.props.style);
    const metricsStyle = StyleSheet.flatten(metrics.props.style);
    const secondaryStyle = StyleSheet.flatten(secondary.props.style);
    const actionStyle = flattenedControlStyle(action);

    expect(metricsStyle.top).toBeGreaterThan(statusStyle.top + statusStyle.minHeight);
    expect(secondaryStyle.top).toBeGreaterThan(metricsStyle.top);
    expect(actionStyle.top).toBeGreaterThan(secondaryStyle.top);
    expect(actionStyle.top + actionStyle.minHeight + 36).toBeLessThanOrEqual(568);

    const visibleTexts = renderer.root.findAllByType(Text);
    expect(visibleTexts.length).toBeGreaterThan(10);
    for (const node of visibleTexts) {
      expect(node.props.allowFontScaling).not.toBe(false);
    }
    const primaryValues = visibleTexts.filter((node) => node.props.testID?.startsWith('run-metric-value-'));
    expect(primaryValues).toHaveLength(2);
    for (const value of primaryValues) {
      expect(value.props.numberOfLines).toBe(1);
      expect(value.props.adjustsFontSizeToFit).toBe(true);
    }
  });
});
