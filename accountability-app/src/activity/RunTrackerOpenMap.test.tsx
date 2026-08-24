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
    busy: false,
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

const SUPPORTED_VIEWPORTS = [
  { viewportWidth: 320, viewportHeight: 568, sideInset: 16 },
  { viewportWidth: 390, viewportHeight: 844, sideInset: 0 },
  { viewportWidth: 430, viewportHeight: 932, sideInset: 0 },
] as const;

const SUPPORTED_GEOMETRY_CASES = [
  ...SUPPORTED_VIEWPORTS.flatMap((viewport) =>
    [1, 1.3, 2].map((fontScale) => ({ ...viewport, fontScale })),
  ),
  ...SUPPORTED_VIEWPORTS.map((viewport) => ({
    ...viewport,
    fontScale: 2,
    safeTop: 44,
    safeBottom: 34,
  })),
];

describe('RunTrackerOpenMap', () => {
  test.each(SUPPORTED_GEOMETRY_CASES)(
    'keeps supported $viewportWidth×$viewportHeight at $fontScale× vertically separated',
    (viewport) => {
      const { renderer } = render(viewport);
      const toolsStyle = StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'run-open-map-map-tools' }).props.style,
      );
      const statusStyle = StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'run-open-map-status' }).props.style,
      );
      const metricsStyle = StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'run-open-map-primary-metrics' }).props.style,
      );

      expect(toolsStyle.top + toolsStyle.height).toBeLessThanOrEqual(statusStyle.top - 18);
      expect(statusStyle.top + statusStyle.minHeight)
        .toBeLessThanOrEqual(metricsStyle.top - 12);
    },
  );

  test.each([
    {
      name: 'reference phone',
      viewportWidth: 390,
      viewportHeight: 844,
      fontScale: 1,
      sideInset: 0,
      expectedMapToolsTop: 408,
      expectedStatusTop: 532,
    },
    {
      name: 'compact phone',
      viewportWidth: 320,
      viewportHeight: 568,
      fontScale: 1,
      sideInset: 16,
      expectedMapToolsTop: 146,
      expectedStatusTop: 270,
    },
  ])('keeps map tools directly above the centered status on the $name', (landmark) => {
    const { renderer } = render(landmark);
    const tools = renderer.root.findByProps({ testID: 'run-open-map-map-tools' });
    const status = renderer.root.findByProps({ testID: 'run-open-map-status' });
    const statusChip = renderer.root.findByProps({ testID: 'run-open-map-status-chip' });
    const toolsStyle = StyleSheet.flatten(tools.props.style);
    const statusStyle = StyleSheet.flatten(status.props.style);
    const statusChipStyle = StyleSheet.flatten(statusChip.props.style);

    expect(toolsStyle.top).toBe(landmark.expectedMapToolsTop);
    expect(statusStyle.top).toBe(landmark.expectedStatusTop);
    expect(toolsStyle.top + 48 * 2 + 10).toBeLessThanOrEqual(statusStyle.top - 18);
    expect(statusStyle.left + statusStyle.width / 2).toBe(landmark.viewportWidth / 2);
    expect(statusStyle.alignItems).toBe('center');
    expect(statusChipStyle.alignSelf).toBe('center');
  });

  test.each([
    { viewportWidth: 320, sideInset: 16, expectedTabWidth: 64 },
    { viewportWidth: 390, sideInset: 0, expectedTabWidth: 82 },
  ])(
    'uses the full safe navigation interval for 200% tabs at $viewportWidth points',
    ({ viewportWidth, sideInset, expectedTabWidth }) => {
      const { renderer } = render({
        viewportWidth,
        viewportHeight: 844,
        fontScale: 2,
        sideInset,
      });
      const backStyle = flattenedControlStyle(byLabel(renderer, 'Back'));
      const moreStyle = flattenedControlStyle(byLabel(renderer, 'More options'));
      const tabStyles = ['Run', 'Walk', 'Ride'].map((label) =>
        flattenedControlStyle(byLabel(renderer, label)),
      );
      const tabLabels = ['Run', 'Walk', 'Ride'].map((label) =>
        renderer.root.findByProps({ testID: `run-activity-label-${label.toLowerCase()}` }),
      );

      expect(tabStyles.map((style) => style.width)).toEqual([
        expectedTabWidth,
        expectedTabWidth,
        expectedTabWidth,
      ]);
      expect(tabStyles[0].left).toBe(backStyle.left + backStyle.width);
      expect(tabStyles[1].left).toBe(tabStyles[0].left + tabStyles[0].width);
      expect(tabStyles[2].left).toBe(tabStyles[1].left + tabStyles[1].width);
      expect(tabStyles[2].left + tabStyles[2].width).toBe(moreStyle.right === undefined
        ? moreStyle.left
        : viewportWidth - moreStyle.right - moreStyle.width);
      for (const [index, label] of ['Run', 'Walk', 'Ride'].entries()) {
        const tabStyle = tabStyles[index];
        const labelNode = tabLabels[index];
        const labelStyle = StyleSheet.flatten(labelNode.props.style);
        const horizontalPadding = tabStyle.paddingHorizontal ?? 0;
        const usableWidth = tabStyle.width - horizontalPadding * 2;
        const estimatedGlyphWidth = label.length * labelStyle.fontSize * 2 * 0.64;

        expect(horizontalPadding).toBe(0);
        expect(labelStyle.fontSize).toBe(12);
        expect(labelStyle.lineHeight).toBe(16);
        expect(labelNode.props.numberOfLines).toBe(1);
        expect(estimatedGlyphWidth).toBeLessThanOrEqual(usableWidth);
      }
    },
  );

  test('keeps both map controls in normal flex flow instead of stacking absolutely', () => {
    const { renderer } = render();
    const tools = renderer.root.findByProps({ testID: 'run-open-map-map-tools' });
    const center = byLabel(renderer, 'Center map on my location');
    const overview = byLabel(renderer, 'Show complete route');
    const toolsStyle = StyleSheet.flatten(tools.props.style);
    const centerStyle = flattenedControlStyle(center);
    const overviewStyle = flattenedControlStyle(overview);

    expect(toolsStyle.flexDirection).toBe('column');
    expect(toolsStyle.gap).toBe(10);
    expect(toolsStyle.height).toBe(48 * 2 + 10);
    expect(centerStyle.position).toBe('relative');
    expect(overviewStyle.position).toBe('relative');
    expect(centerStyle.width).toBe(48);
    expect(overviewStyle.width).toBe(48);
  });

  test('lets map gestures pass through every informational overlay subtree', () => {
    const { renderer } = render();

    expect(renderer.root.findByProps({ testID: 'run-open-map-status' }).props.pointerEvents)
      .toBe('none');
    expect(
      renderer.root.findByProps({ testID: 'run-open-map-primary-metrics' }).props.pointerEvents,
    ).toBe('none');
    expect(
      renderer.root.findByProps({ testID: 'run-open-map-secondary-metrics' }).props.pointerEvents,
    ).toBe('none');
    expect(byLabel(renderer, 'Center map on my location').props.onPress).toEqual(
      expect.any(Function),
    );
    expect(byLabel(renderer, 'Start Run').props.onPress).toEqual(expect.any(Function));
  });

  test('uses a non-overlapping constrained fallback for unsupported safe-area geometry', () => {
    const safeTop = 120;
    const { renderer, componentProps } = render({
      viewportWidth: 320,
      viewportHeight: 568,
      fontScale: 2,
      safeTop,
      sideInset: 16,
    });
    const statusStyle = StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-open-map-status' }).props.style,
    );
    const metricsStyle = StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-open-map-primary-metrics' }).props.style,
    );
    const secondaryStyle = StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-open-map-secondary-metrics' }).props.style,
    );

    expect(statusStyle.top).toBeGreaterThanOrEqual(safeTop + 8 + 48 + 16);
    expect(statusStyle.top + statusStyle.minHeight).toBeLessThanOrEqual(metricsStyle.top - 12);
    expect(metricsStyle.top + metricsStyle.minHeight).toBeLessThanOrEqual(
      secondaryStyle.top - 8,
    );
    expect(renderer.root.findAllByProps({ testID: 'run-open-map-map-tools' })).toHaveLength(0);
    expect(byLabel(renderer, 'Back')).toBeTruthy();
    expect(byLabel(renderer, 'Ready to run. GPS checks when you start')).toBeTruthy();
    expect(byLabel(renderer, 'Distance 0.00 kilometres')).toBeTruthy();
    expect(byLabel(renderer, 'Elapsed time 00:00')).toBeTruthy();
    expect(byLabel(renderer, 'Pace unavailable')).toBeTruthy();
    expect(byLabel(renderer, 'Estimated calories 0')).toBeTruthy();
    expect(byLabel(renderer, 'Start Run')).toBeTruthy();

    press(renderer, 'Map controls');
    press(renderer, 'Center map on my location');
    press(renderer, 'Show complete route');
    expect(componentProps.onCenterMap).toHaveBeenCalledTimes(1);
    expect(componentProps.onShowRoute).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      name: 'Starting',
      statusTitle: 'Getting GPS ready',
      statusDetail: 'Checking location permission',
      primaryAction: idleAction({ label: 'Starting…', disabled: true, busy: true }),
    },
    {
      name: 'Pending',
      statusTitle: 'Save needs attention',
      statusDetail: 'Your route is safe on this phone',
      primaryAction: idleAction({ label: 'Retry save', icon: 'refresh' }),
    },
  ])('reserves two 200% detail lines for the $name status on a reference phone', (state) => {
    const { renderer } = render({
      ...state,
      viewportWidth: 390,
      viewportHeight: 844,
      fontScale: 2,
    });
    const status = renderer.root.findByProps({ testID: 'run-open-map-status' });
    const metrics = renderer.root.findByProps({ testID: 'run-open-map-primary-metrics' });
    const detail = renderer.root.findByProps({ testID: 'run-status-detail' });
    const statusStyle = StyleSheet.flatten(status.props.style);
    const metricsStyle = StyleSheet.flatten(metrics.props.style);

    expect(statusStyle.minHeight).toBeGreaterThanOrEqual(92);
    expect(statusStyle.top + statusStyle.minHeight).toBeLessThanOrEqual(metricsStyle.top - 12);
    expect(detail.props.children).toBe(state.statusDetail);
    expect(detail.props.numberOfLines).toBeUndefined();
    expect(detail.props.maxFontSizeMultiplier ?? Number.POSITIVE_INFINITY)
      .toBeGreaterThanOrEqual(2);
    expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'run-status-title' }).props.style))
      .toMatchObject({ fontSize: 12, lineHeight: 15 });
    expect(StyleSheet.flatten(detail.props.style)).toMatchObject({ fontSize: 10, lineHeight: 13 });
  });

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
      action: idleAction({ label: 'Starting…', disabled: true, busy: true }),
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
      busy: action.busy,
      disabled: action.disabled,
    });
    expect(control.props.testID).toBe(`run-primary-action-${expectedTone}`);

    if (!action.disabled) {
      press(renderer, action.label);
      expect(action.onPress).toHaveBeenCalledTimes(1);
    }
  });

  test('takes busy accessibility state from data rather than action wording', () => {
    const action = idleAction({
      label: 'Preparing location',
      disabled: true,
      busy: true,
    });
    const { renderer } = render({ primaryAction: action });

    expect(byLabel(renderer, 'Preparing location').props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
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
    const mapTools = renderer.root.findByProps({ testID: 'run-open-map-map-tools' });
    const metrics = renderer.root.findByProps({ testID: 'run-open-map-primary-metrics' });
    const secondary = renderer.root.findByProps({ testID: 'run-open-map-secondary-metrics' });
    const action = byLabel(renderer, 'Start Run');
    const statusStyle = StyleSheet.flatten(status.props.style);
    const mapToolsStyle = StyleSheet.flatten(mapTools.props.style);
    const metricsStyle = StyleSheet.flatten(metrics.props.style);
    const secondaryStyle = StyleSheet.flatten(secondary.props.style);
    const actionStyle = flattenedControlStyle(action);

    expect(statusStyle.minHeight).toBeGreaterThanOrEqual(92);
    expect(mapToolsStyle.flexDirection).toBe('row');
    expect(mapToolsStyle.height).toBe(48);
    expect(mapToolsStyle.top + mapToolsStyle.height).toBeLessThanOrEqual(
      statusStyle.top - 18,
    );
    expect(metricsStyle.top).toBeGreaterThanOrEqual(
      statusStyle.top + statusStyle.minHeight + 12,
    );
    expect(secondaryStyle.minHeight).toBeGreaterThanOrEqual(58);
    expect(secondaryStyle.top).toBeGreaterThanOrEqual(metricsStyle.top + 80);
    expect(actionStyle.top).toBeGreaterThanOrEqual(
      secondaryStyle.top + secondaryStyle.minHeight + 14,
    );
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
      expect(value.props.maxFontSizeMultiplier).toBe(1);
    }
    expect(StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-secondary-value-pace' }).props.style,
    )).toMatchObject({ fontSize: 14, lineHeight: 18 });
    expect(StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-secondary-label-pace' }).props.style,
    )).toMatchObject({ fontSize: 8, lineHeight: 11 });

    const essentialTextIds = [
      'run-activity-label-run',
      'run-activity-label-walk',
      'run-activity-label-ride',
      'run-status-title',
      'run-status-detail',
      'run-metric-label-distance',
      'run-metric-label-time',
      'run-secondary-value-pace',
      'run-secondary-label-pace',
      'run-secondary-value-calories',
      'run-secondary-label-calories',
      'run-primary-action-label',
    ];
    for (const testID of essentialTextIds) {
      const text = renderer.root.findByProps({ testID });
      expect(text.props.maxFontSizeMultiplier ?? Number.POSITIVE_INFINITY)
        .toBeGreaterThanOrEqual(2);
    }
  });
});
