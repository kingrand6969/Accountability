import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';
import { Text, View } from 'react-native';
import { RunCard } from './RunCard';
import type { RunShareLayout } from './runShareAppearance';

const mockMap = jest.fn();
const mockReact = React;
const mockView = View;

jest.mock('../ui/OsmMap', () => ({
  OsmMap: (props: Record<string, unknown>) => {
    mockMap(props);
    return mockReact.createElement(mockView, { accessibilityLabel: 'Run route map', ...props });
  },
}));
jest.mock('./RouteTrace', () => ({
  RouteTrace: (props: Record<string, unknown>) => {
    return mockReact.createElement(mockView, { accessibilityLabel: 'Run route trace', ...props });
  },
}));

const points = [
  { lat: -31.9523, lon: 115.8613 },
  { lat: -31.953, lon: 115.862 },
  { lat: -31.954, lon: 115.863 },
];

function card(layout: RunShareLayout, overrides: Record<string, unknown> = {}) {
  return (
    <RunCard
      mode="map"
      photoUri={null}
      distanceM={3620}
      durationS={1458}
      points={points}
      width={340}
      aspectRatio={4 / 5}
      mediaFit="cover"
      layout={layout}
      font="momentum"
      theme="night"
      title="Sunday Run"
      completedAt="2026-08-23T10:18:00.000Z"
      showTimestamp
      showEndpoints={false}
      {...overrides}
    />
  );
}

function textOf(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat(Infinity).join(' ');
}

describe('RunCard approved layouts', () => {
  test.each<readonly [RunShareLayout, string]>([
    ['center-stack', 'Center Stack'],
    ['right-rail', 'Right Rail'],
    ['data-horizon', 'Data Horizon'],
    ['editorial-stack', 'Editorial Stack'],
    ['map-focus', 'Map Focus'],
  ])('renders %s as a named accessible layout', (layout, label) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(card(layout)); });
    expect(renderer.root.findByProps({ accessibilityLabel: `Run card, ${label} layout` })).toBeTruthy();
    expect(textOf(renderer)).toContain('3.62');
    expect(textOf(renderer)).toContain('6:43');
    act(() => renderer.unmount());
  });

  test('shows or removes only the recorded date and clock time', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(card('map-focus')); });
    expect(textOf(renderer)).toContain('23 AUGUST');
    act(() => { renderer.update(card('map-focus', { showTimestamp: false })); });
    expect(textOf(renderer)).not.toContain('23 AUGUST');
    expect(textOf(renderer)).toContain('24:18');
    act(() => renderer.unmount());
  });

  test('uses a real map and no endpoint markers while privacy is enabled', () => {
    mockMap.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(card('map-focus')); });
    expect(mockMap).toHaveBeenLastCalledWith(expect.objectContaining({
      interactive: false,
      route: points.map((point) => ({ lat: point.lat, lng: point.lon })),
      markers: [],
      showLatestMarker: false,
      tiles: 'dark',
    }));
    act(() => renderer.unmount());
  });

  test('shows explicit start and finish dots only after privacy opt-out', () => {
    mockMap.mockClear();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(card('map-focus', { showEndpoints: true })); });
    expect(mockMap).toHaveBeenLastCalledWith(expect.objectContaining({
      showLatestMarker: false,
      markers: [
        { lat: points[0].lat, lng: points[0].lon, color: '#16A36A' },
        { lat: points[2].lat, lng: points[2].lon, color: '#B9FF3D' },
      ],
    }));
    act(() => renderer.unmount());
  });
});
