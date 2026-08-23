import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
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
  RouteTrace: (props: Record<string, unknown>) => (
    mockReact.createElement(mockView, { accessibilityLabel: 'Run route trace', ...props })
  ),
}));

const points = [
  { lat: -31.9523, lon: 115.8613 },
  { lat: -31.953, lon: 115.862 },
  { lat: -31.954, lon: 115.863 },
];

function renderCard(layout: RunShareLayout) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <RunCard
        mode="map"
        photoUri={null}
        distanceM={3620}
        durationS={1458}
        points={points}
        width={340}
        aspectRatio={4 / 5}
        layout={layout}
        font="momentum"
        theme="night"
        title="Sunday Run"
        completedAt="2026-08-23T10:18:00.000Z"
        showTimestamp
        showEndpoints={false}
      />,
    );
  });
  return renderer;
}

function flatStyle(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  return StyleSheet.flatten(renderer.root.findByProps({ testID }).props.style);
}

describe('RunCard approved five-layout composition', () => {
  test('Center Stack puts performance at the top and identity at the bottom', () => {
    const renderer = renderCard('center-stack');
    expect(flatStyle(renderer, 'center-stack-performance')).toMatchObject({
      position: 'absolute', top: '10%', left: 0, right: 0, alignItems: 'center',
    });
    expect(flatStyle(renderer, 'center-stack-identity')).toMatchObject({
      position: 'absolute', left: '6%', bottom: '6%',
    });
    expect(flatStyle(renderer, 'center-stack-privacy')).toMatchObject({
      position: 'absolute', right: '6%', bottom: '6%',
    });
    expect(mockMap).toHaveBeenLastCalledWith(expect.objectContaining({
      fitPadding: { top: 132, right: 82, bottom: 77, left: 82 },
    }));
    act(() => renderer.unmount());
  });

  test('Right Rail keeps the route left of the performance rail', () => {
    const renderer = renderCard('right-rail');
    expect(flatStyle(renderer, 'right-rail-identity')).toMatchObject({
      position: 'absolute', left: '6%', top: '6%',
    });
    expect(flatStyle(renderer, 'right-rail-performance')).toMatchObject({
      position: 'absolute', right: '6%', top: '10%', width: '32%', alignItems: 'flex-end',
    });
    expect(flatStyle(renderer, 'right-rail-privacy')).toMatchObject({
      position: 'absolute', right: '6%', bottom: '6%',
    });
    expect(mockMap).toHaveBeenLastCalledWith(expect.objectContaining({
      fitPadding: { top: 102, right: 156, bottom: 77, left: 44 },
    }));
    act(() => renderer.unmount());
  });

  test('Data Horizon keeps all four metrics at the top and leaves the map open', () => {
    const renderer = renderCard('data-horizon');
    expect(flatStyle(renderer, 'data-horizon-performance')).toMatchObject({
      position: 'absolute', left: '6%', right: '6%', top: '6%', flexDirection: 'row',
    });
    expect(flatStyle(renderer, 'data-horizon-identity')).toMatchObject({
      position: 'absolute', left: '6%', bottom: '6%',
    });
    expect(flatStyle(renderer, 'data-horizon-privacy')).toMatchObject({
      position: 'absolute', right: '6%', bottom: '6%',
    });
    expect(mockMap).toHaveBeenLastCalledWith(expect.objectContaining({
      fitPadding: { top: 94, right: 41, bottom: 81, left: 95 },
    }));
    act(() => renderer.unmount());
  });

  test('Editorial Stack uses a poster-like top stack with bottom identity', () => {
    const renderer = renderCard('editorial-stack');
    expect(flatStyle(renderer, 'editorial-stack-performance')).toMatchObject({
      position: 'absolute', top: '9%', left: 0, right: 0, alignItems: 'center',
    });
    expect(flatStyle(renderer, 'editorial-stack-identity')).toMatchObject({
      position: 'absolute', left: '6%', bottom: '6%',
    });
    expect(flatStyle(renderer, 'editorial-stack-privacy')).toMatchObject({
      position: 'absolute', right: '6%', bottom: '6%',
    });
    expect(mockMap).toHaveBeenLastCalledWith(expect.objectContaining({
      fitPadding: { top: 140, right: 75, bottom: 81, left: 75 },
    }));
    act(() => renderer.unmount());
  });

  test('Map Focus preserves the approved title-top and data-bottom composition', () => {
    const renderer = renderCard('map-focus');
    expect(flatStyle(renderer, 'map-focus-identity')).toMatchObject({
      position: 'absolute', left: '6%', top: '6%',
    });
    expect(flatStyle(renderer, 'map-focus-performance')).toMatchObject({
      position: 'absolute', left: '6%', right: '6%', bottom: '5%',
    });
    expect(mockMap).toHaveBeenLastCalledWith(expect.objectContaining({
      fitPadding: { top: 81, right: 58, bottom: 153, left: 58 },
    }));
    act(() => renderer.unmount());
  });
});
