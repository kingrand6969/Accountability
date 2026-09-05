import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text, TextInput } from 'react-native';
import { describe, expect, jest, test } from '@jest/globals';

import { CheckInDateField } from './CheckInDateField.web';
import { localDateKey, recordedAtForLocalDate } from './checkInDate';

jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});

describe('body check-in local date semantics', () => {
  test('uses the current instant for today and local noon for a past selected date', () => {
    const now = new Date(2026, 7, 22, 17, 43, 12, 345);
    expect(recordedAtForLocalDate(localDateKey(now), now)).toBe(now.toISOString());

    const pastIso = recordedAtForLocalDate('2026-08-20', now);
    const past = new Date(pastIso);
    expect([past.getFullYear(), past.getMonth() + 1, past.getDate(), past.getHours()]).toEqual([2026, 8, 20, 12]);
  });

  test.each(['2026-02-30', '2026-2-03', 'not-a-date'])('rejects invalid strict calendar value %s', (value) => {
    expect(() => recordedAtForLocalDate(value, new Date(2026, 7, 22, 12))).toThrow('Enter a valid check-in date.');
  });

  test('rejects future local dates', () => {
    expect(() => recordedAtForLocalDate('2026-08-23', new Date(2026, 7, 22, 23, 59))).toThrow('Check-in date cannot be in the future.');
  });

  test('renders a strict accessible 48-point web date field with timezone context', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CheckInDateField value="2026-08-20" onChange={jest.fn()} maximumDate={new Date(2026, 7, 22, 12)} />,
      );
    });
    const input = renderer.root.findByProps({ accessibilityLabel: 'Check-in date' });
    expect(input.type).toBe(TextInput);
    expect(input.props.placeholder).toBe('YYYY-MM-DD');
    expect(StyleSheet.flatten(input.props.style).minHeight).toBeGreaterThanOrEqual(48);
    const visible = renderer.root.findAllByType(Text).flatMap((node) =>
      Array.isArray(node.props.children) ? node.props.children : [node.props.children],
    ).filter((value): value is string => typeof value === 'string').join(' ');
    expect(visible).toContain('timezone');
  });

  test('native picker is bounded to now and does not expose a free-form date input', () => {
    const nativeSource = fs.readFileSync(path.join(__dirname, 'CheckInDateField.native.tsx'), 'utf8');
    expect(nativeSource).toContain('maximumDate={maximumDate}');
    expect(nativeSource).toContain("mode=\"date\"");
    expect(nativeSource).not.toContain('TextInput');
  });
});
