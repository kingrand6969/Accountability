import { describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TimePicker } from './TimePicker';

function minuteInput(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ accessibilityLabel: 'Minutes' });
}

describe('TimePicker', () => {
  it('preserves a partial minute draft while accepting controlled updates', async () => {
    const onChange = jest.fn<(value: string) => void>();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        createElement(TimePicker, { value: '09:07', onChange }),
      );
    });
    expect(minuteInput(renderer).props.value).toBe('07');

    await act(async () => {
      minuteInput(renderer).props.onChangeText('1');
    });
    expect(onChange).toHaveBeenLastCalledWith('09:01');

    await act(async () => {
      renderer.update(
        createElement(TimePicker, { value: '09:01', onChange }),
      );
    });
    expect(minuteInput(renderer).props.value).toBe('1');

    await act(async () => renderer.unmount());
  });

  it('applies external minute changes immediately and normalizes on blur', async () => {
    const onChange = jest.fn<(value: string) => void>();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        createElement(TimePicker, { value: '09:07', onChange }),
      );
    });

    await act(async () => {
      renderer.update(
        createElement(TimePicker, { value: '09:42', onChange }),
      );
    });
    expect(minuteInput(renderer).props.value).toBe('42');

    await act(async () => {
      minuteInput(renderer).props.onChangeText('99');
    });
    expect(onChange).toHaveBeenLastCalledWith('09:59');
    await act(async () => {
      renderer.update(
        createElement(TimePicker, { value: '09:59', onChange }),
      );
    });
    expect(minuteInput(renderer).props.value).toBe('99');

    await act(async () => {
      minuteInput(renderer).props.onBlur();
    });
    expect(minuteInput(renderer).props.value).toBe('59');

    await act(async () => renderer.unmount());
  });
});
