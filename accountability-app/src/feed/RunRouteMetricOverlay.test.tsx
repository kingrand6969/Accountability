import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { RunRouteMetricOverlay } from './RunRouteMetricOverlay';

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

const run = {
  verified: true,
  distance_m: 5000,
  duration_s: 1500,
  route: [
    { lat: -31.95, lon: 115.86 },
    { lat: -31.96, lon: 115.87 },
  ],
};

function renderAt(fontScale: number, width: number) {
  mockWindowDimensions.mockReturnValue({ width, height: 640, scale: 1, fontScale });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RunRouteMetricOverlay data={run} />);
  });
  return renderer;
}

describe('RunRouteMetricOverlay responsive layout', () => {
  beforeEach(() => {
    mockWindowDimensions.mockClear();
  });

  test('keeps the normal-scale metrics in one compact row below the absolute route', () => {
    const renderer = renderAt(1, 360);
    const overlay = StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-route-metric-overlay' }).props.style,
    );
    const stats = StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-route-metrics' }).props.style,
    );
    const route = renderer.root.findByProps({ testID: 'run-overlay-route' });
    const primaryValue = StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-route-metric-value-km' }).props.style,
    );
    const timeValue = StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'run-route-metric-value-time' }).props.style,
    );
    const gradient = renderer.root.findByProps({ testID: 'run-overlay-gradient' });

    expect(mockWindowDimensions).toHaveBeenCalled();
    expect(overlay.height).toBe(138);
    expect(stats.flexDirection).toBe('row');
    expect(primaryValue.fontSize).toBe(42);
    expect(primaryValue.fontVariant).toEqual(expect.arrayContaining(['tabular-nums']));
    expect(timeValue.fontSize).toBe(18);
    expect(gradient.props.colors).toEqual(['transparent', 'rgba(11,13,11,.92)']);
    expect(StyleSheet.flatten(route.props.style).position).toBe('absolute');
    expect(route.props).toEqual(expect.objectContaining({ height: 76 }));
    expect(renderer.root.findAllByType(Text).map((node) => node.props.children))
      .toEqual(['5.00', 'km', '25:00', 'time', '5:00', 'pace /km']);
  });

  test.each([320, 360])(
    'stacks all metrics below an in-flow route at 2.0 scale on a %idp screen',
    (width) => {
      const renderer = renderAt(2, width);
      const overlay = StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'run-route-metric-overlay' }).props.style,
      );
      const stats = StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'run-route-metrics' }).props.style,
      );
      const route = renderer.root.findByProps({ testID: 'run-overlay-route' });
      const metricStyles = ['km', 'time', 'pace /km'].map((label) => StyleSheet.flatten(
        renderer.root.findByProps({ testID: `run-route-metric-${label}` }).props.style,
      ));

      expect(stats).toEqual(expect.objectContaining({
        flexDirection: 'column',
        alignItems: 'stretch',
      }));
      expect(StyleSheet.flatten(route.props.style)).toEqual(expect.objectContaining({
        position: 'relative',
        alignSelf: 'flex-end',
      }));
      expect(metricStyles).toHaveLength(3);
      expect(metricStyles).toEqual(expect.arrayContaining([
        expect.objectContaining({ flexDirection: 'row', minWidth: 0 }),
      ]));
      expect(overlay.height).toBeGreaterThanOrEqual(270);
      expect(renderer.root.findAllByType(Text)).toHaveLength(6);
    },
  );
});
