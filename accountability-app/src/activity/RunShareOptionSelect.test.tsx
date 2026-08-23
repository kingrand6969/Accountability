import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, jest, test } from '@jest/globals';

import { RunShareOptionSelect } from './RunShareOptionSelect';

describe('RunShareOptionSelect', () => {
  test('shows a compact value and changes only after an explicit option press', () => {
    const onChange = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <RunShareOptionSelect
          label="Layout"
          value="map-focus"
          options={[
            { id: 'map-focus', label: 'Map Focus' },
            { id: 'right-rail', label: 'Right Rail' },
          ]}
          onChange={onChange}
        />,
      );
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Layout, Map Focus' })).toBeTruthy();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Layout, Map Focus' }).props.onPress());
    expect(renderer.root.findByProps({ accessibilityLabel: 'Use Right Rail layout' })).toBeTruthy();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Use Right Rail layout' }).props.onPress());
    expect(onChange).toHaveBeenCalledWith('right-rail');
    act(() => renderer.unmount());
  });

  test('uses 48 point direct controls and exposes selection state', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <RunShareOptionSelect
          label="Font"
          value="momentum"
          options={[{ id: 'momentum', label: 'Momentum' }]}
          onChange={() => undefined}
        />,
      );
    });
    const control = renderer.root.findByProps({ accessibilityLabel: 'Font, Momentum' });
    expect(control.props.style).toEqual(expect.objectContaining({ minHeight: 48 }));
    act(() => control.props.onPress());
    expect(renderer.root.findByProps({ accessibilityLabel: 'Use Momentum font' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ selected: true }));
    act(() => renderer.unmount());
  });
});
