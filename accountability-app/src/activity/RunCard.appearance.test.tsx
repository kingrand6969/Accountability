import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
      theme="dark"
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

function rgb(hex: string): readonly [number, number, number] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as unknown as readonly [number, number, number];
}

function compositeOverWhite(color: readonly [number, number, number], alpha: number) {
  return color.map((channel) => channel * alpha + 255 * (1 - alpha)) as unknown as readonly [number, number, number];
}

function luminance(color: readonly [number, number, number]) {
  const linear = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: readonly [number, number, number], background: readonly [number, number, number]) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
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
      routeStyle: {
        color: '#B9FF3D',
        weight: 5,
        casingColor: '#0B0D0B',
        casingWeight: 9,
      },
      markers: [],
      showLatestMarker: false,
      tiles: 'osm',
    }));
    act(() => renderer.unmount());
  });

  test.each<RunShareLayout>([
    'center-stack',
    'right-rail',
    'data-horizon',
    'editorial-stack',
    'map-focus',
  ])('%s keeps natural OSM tiles and protects every text overlay from a worst-case light map', (layout) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(card(layout)); });

    expect(renderer.root.findAllByType(LinearGradient)).toHaveLength(0);
    const overlayIds = [`${layout}-identity`, `${layout}-performance`];
    if (layout !== 'map-focus') overlayIds.push(`${layout}-privacy`);
    for (const testID of overlayIds) {
      expect(StyleSheet.flatten(renderer.root.findByProps({ testID }).props.style)).toMatchObject({
        backgroundColor: 'rgba(11,13,11,0.86)',
      });
    }

    const worstCaseLightMap = compositeOverWhite([11, 13, 11], 0.86);
    expect(contrast(rgb('#F7F8F4'), worstCaseLightMap)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb('#CED4CB'), worstCaseLightMap)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb('#B9FF3D'), worstCaseLightMap)).toBeGreaterThanOrEqual(3);
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

  test('uses contrasting semantic glyph colors for hidden and exposed endpoints', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(card('map-focus')); });
    const hiddenGlyph = renderer.root.findByProps({ children: '✓' });
    const hiddenBadge = StyleSheet.flatten(hiddenGlyph.parent!.props.style);
    expect(StyleSheet.flatten(hiddenGlyph.props.style)).toMatchObject({ color: '#0B0D0B' });
    expect(hiddenBadge).toMatchObject({ backgroundColor: '#B9FF3D', borderColor: '#B9FF3D' });
    expect(contrast(rgb('#0B0D0B'), rgb('#B9FF3D'))).toBeGreaterThanOrEqual(4.5);

    act(() => { renderer.update(card('map-focus', { showEndpoints: true })); });
    const exposedGlyph = renderer.root.findByProps({ children: '!' });
    const exposedBadge = StyleSheet.flatten(exposedGlyph.parent!.props.style);
    expect(StyleSheet.flatten(exposedGlyph.props.style)).toMatchObject({ color: '#FBBF24' });
    expect(exposedBadge).toMatchObject({ borderColor: '#FBBF24' });
    const contrastPlateOverLightMap = compositeOverWhite([11, 13, 11], 0.86);
    expect(contrast(rgb('#FBBF24'), contrastPlateOverLightMap)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb('#FBBF24'), contrastPlateOverLightMap)).toBeGreaterThanOrEqual(3);
    act(() => renderer.unmount());
  });
});
