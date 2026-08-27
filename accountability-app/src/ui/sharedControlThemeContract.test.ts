import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import TestRenderer, { act } from 'react-test-renderer';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppThemeProvider } from './AppThemeProvider';
import { AppLaunchState } from './AppLaunchState';
import { AuthField } from './AuthField';
import { AuthShell } from './AuthShell';
import { ConfirmHost, confirmDialog } from './ConfirmDialog';
import { GlassBackdrop, GlassCard } from './Glass';
import { MonthCalendar } from './MonthCalendar';
import { TimePicker } from './TimePicker';
import { spacing, themeColors } from './theme';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  function MockIonicons(props: Record<string, unknown>) {
    return React.createElement(ReactNative.View, props);
  }
  return { __esModule: true, default: MockIonicons };
});

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(createElement(AppThemeProvider, null, element));
  });
  return renderer;
}

function flat(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

function staticStyle(node: TestRenderer.ReactTestInstance): Record<string, unknown> {
  return typeof node.props.style === 'function' ? {} : flat(node.props.style);
}

function colorAlpha(color: unknown): number {
  if (typeof color !== 'string') return 1;
  if (/^#[\dA-Fa-f]{8}$/.test(color)) return Number.parseInt(color.slice(7), 16) / 255;
  const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*(\d*\.?\d+)\)$/);
  return rgba ? Number(rgba[1]) : 1;
}

function isCharcoalWithAlpha(color: unknown, charcoal: string): boolean {
  return typeof color === 'string' && color.slice(0, 7).toUpperCase() === charcoal.toUpperCase();
}

describe('shared controls follow the active app appearance', () => {
  test.each([
    './Checkbox',
    './PrivacyToggle',
    '../profiles/ChipSelector',
  ])('%s consumes semantic Light/Dark roles instead of the flat compatibility palette', (modulePath) => {
    const source = readFileSync(require.resolve(modulePath), 'utf8');

    expect(source).toContain('useAppTheme');
    expect(source).not.toMatch(/import \{[^}]*\bcolors\b[^}]*\} from ['"][^'"]*theme['"]/s);
    expect(source).toContain('theme.surface');
    expect(source).toContain('theme.ink');
    expect(source).toContain('theme.border');
  });

  test('AppLaunchState renders the canvas, action spinner, and readable ink roles', () => {
    const dark = themeColors('dark');
    const renderer = render(createElement(AppLaunchState, { message: 'Opening AccountAbility' }));
    const root = renderer.toJSON() as TestRenderer.ReactTestRendererJSON;

    expect(flat(root.props.style).backgroundColor).toBe(dark.surface.canvas);
    expect(renderer.root.findByType(ActivityIndicator).props.color).toBe(dark.ink.action);
    expect(flat(renderer.root.findByProps({ children: 'Opening AccountAbility' }).props.style).color)
      .toBe(dark.ink.secondary);
    expect(flat(renderer.root.findAllByType(Image)[1].props.style).tintColor).toBe(dark.ink.primary);
  });

  test('AuthField renders raised field roles and applies the action border on focus', () => {
    const dark = themeColors('dark');
    const renderer = render(
      createElement(AuthField, {
        label: 'Email',
        icon: 'mail-outline',
        value: '',
        onChangeText: jest.fn(),
      }),
    );
    const input = renderer.root.findByType(TextInput);
    const field = () => renderer.root.findAllByType(View).find((node) => staticStyle(node).minHeight === 52)!;

    expect(staticStyle(field())).toEqual(expect.objectContaining({
      backgroundColor: dark.surface.raised,
      borderColor: dark.border.subtle,
    }));
    expect(flat(input.props.style)).toEqual(expect.objectContaining({
      color: dark.ink.primary,
      minHeight: 50,
    }));
    expect(input.props.placeholderTextColor).toBe(dark.ink.muted);
    expect(renderer.root.findByType(Ionicons).props.color).toBe(dark.ink.muted);
    expect(flat(renderer.root.findByProps({ children: 'Email' }).props.style).color).toBe(
      dark.ink.primary,
    );

    act(() => input.props.onFocus({}));
    expect(staticStyle(field()).borderColor).toBe(dark.border.action);
    act(() => input.props.onBlur({}));
    expect(staticStyle(field()).borderColor).toBe(dark.border.subtle);
  });

  test('AuthShell glass keeps a translucent charcoal plate over its dark blur', () => {
    const dark = themeColors('dark');
    const renderer = render(
      createElement(
        AuthShell,
        { glass: true } as Parameters<typeof AuthShell>[0],
        createElement(Text, null, 'Sign in'),
      ),
    );
    const plates = renderer.root.findAll((node) => {
      const color = staticStyle(node).backgroundColor;
      return isCharcoalWithAlpha(color, dark.surface.card) && colorAlpha(color) < 1;
    });

    expect(renderer.root.findAll((node) => node.props.tint === 'dark')).not.toHaveLength(0);
    expect(plates).not.toHaveLength(0);
    expect(colorAlpha(staticStyle(plates[0]).backgroundColor)).toBeGreaterThan(0);
  });

  test('ConfirmDialog renders a dark modal and preserves confirmation behavior', () => {
    const dark = themeColors('dark');
    const onConfirm = jest.fn();
    const renderer = render(createElement(ConfirmHost));

    act(() => {
      confirmDialog({
        title: 'Use this location?',
        message: 'Keep the selected area.',
        confirmLabel: 'Keep it',
        destructive: false,
        onConfirm,
      });
    });

    expect(renderer.root.findByType(Modal).props.visible).toBe(true);
    expect(renderer.root.findAll((node) => staticStyle(node).backgroundColor === dark.interaction.scrim))
      .not.toHaveLength(0);
    const plates = renderer.root.findAll((node) => {
      const color = staticStyle(node).backgroundColor;
      return isCharcoalWithAlpha(color, dark.surface.card) && colorAlpha(color) < 1;
    });
    expect(plates).not.toHaveLength(0);
    expect(colorAlpha(staticStyle(plates[0]).backgroundColor)).toBeGreaterThan(0);
    expect(renderer.root.findAll((node) => staticStyle(node).borderColor === dark.border.strong))
      .not.toHaveLength(0);
    expect(renderer.root.findAll((node) => node.props.tint === 'dark')).not.toHaveLength(0);
    expect(flat(renderer.root.findByProps({ children: 'Use this location?' }).props.style).color)
      .toBe(dark.ink.primary);
    expect(flat(renderer.root.findByProps({ children: 'Keep the selected area.' }).props.style).color)
      .toBe(dark.ink.muted);

    const cancel = renderer.root.findAllByProps({ accessibilityLabel: 'Cancel' })
      .find((node) => typeof node.props.style === 'function')!;
    const confirm = renderer.root.findAllByProps({ accessibilityLabel: 'Keep it' })
      .find((node) => typeof node.props.style === 'function')!;
    expect(flat(cancel.props.style({ pressed: false })).backgroundColor).toBe(dark.surface.raised);
    expect(flat(confirm.props.style({ pressed: false })).backgroundColor).toBe(dark.ink.action);
    act(() => confirm.props.onPress());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
  });

  test('Glass renders the dark backdrop, semantic rim, translucent card plate, and dark blur tint', () => {
    const dark = themeColors('dark');
    const backdrop = render(createElement(GlassBackdrop));
    expect(backdrop.root.findAll((node) =>
      node.props.colors?.join?.(',') === [
        dark.surface.canvas,
        dark.surface.card,
        dark.surface.raised,
      ].join(','),
    )).not.toHaveLength(0);

    const card = render(createElement(GlassCard, null, createElement(Text, null, 'Glass content')));
    expect(card.root.findAll((node) =>
      node.props.colors?.join?.(',') === [
        dark.border.strong,
        dark.border.subtle,
        dark.ink.action,
      ].join(','),
    )).not.toHaveLength(0);
    expect(card.root.findAll((node) => node.props.tint === 'dark')).not.toHaveLength(0);
    const defaultPlate = card.root.findAll((node) => {
      const color = staticStyle(node).backgroundColor;
      return isCharcoalWithAlpha(color, dark.surface.card) && colorAlpha(color) < 1;
    })[0];
    expect(defaultPlate).toBeDefined();
    expect(colorAlpha(staticStyle(defaultPlate).backgroundColor)).toBeCloseTo(0.82, 2);
  });

  test.each([0, 0.45])('GlassCard honors plateOpacity %s', (plateOpacity) => {
    const dark = themeColors('dark');
    const renderer = render(
      createElement(
        GlassCard,
        { plateOpacity } as Parameters<typeof GlassCard>[0],
        createElement(Text, null, 'Glass content'),
      ),
    );
    const plate = renderer.root.findAll((node) => {
      const color = staticStyle(node).backgroundColor;
      return isCharcoalWithAlpha(color, dark.surface.card);
    })[0];

    expect(plate).toBeDefined();
    expect(colorAlpha(staticStyle(plate).backgroundColor)).toBeCloseTo(plateOpacity, 2);
  });

  test('MonthCalendar defaults to dark card, border, action, and ink roles', () => {
    const dark = themeColors('dark');
    const onChange = jest.fn();
    const renderer = render(
      createElement(MonthCalendar, { value: '2026-08-15', onChange }),
    );
    const root = renderer.toJSON() as TestRenderer.ReactTestRendererJSON;
    const selected = renderer.root.findAllByProps({ accessibilityLabel: '2026-08-15' })
      .find((node) => typeof node.props.onPress === 'function')!;
    const selectedLabel = renderer.root.findAllByType(Text)
      .find((node) => node.props.children === 15)!;
    const previous = renderer.root.findAllByProps({ accessibilityLabel: 'Previous month' })
      .find((node) => typeof node.props.onPress === 'function')!;

    expect(flat(root.props.style)).toEqual(expect.objectContaining({
      backgroundColor: dark.surface.card,
      borderColor: dark.border.subtle,
    }));
    expect(renderer.root.findAllByType(Ionicons)[0].props.color).toBe(dark.ink.action);
    expect(flat(selectedLabel.props.style).color).toBe(dark.ink.inverse);
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    expect(flat(previous.props.style({ pressed: false }))).toEqual(
      expect.objectContaining({ width: 40, height: 40 }),
    );
    act(() => selected.props.onPress());
    expect(onChange).toHaveBeenCalledWith('2026-08-15');
  });

  test('TimePicker renders raised controls and a semantic dark modal', () => {
    const dark = themeColors('dark');
    const renderer = render(
      createElement(TimePicker, { value: '09:07', onChange: jest.fn() }),
    );
    const minutes = renderer.root.findByProps({ accessibilityLabel: 'Minutes' });
    const trigger = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.style === 'function',
    )[0];

    expect(flat(minutes.props.style)).toEqual(expect.objectContaining({
      minHeight: spacing.touch,
      backgroundColor: dark.surface.raised,
      borderColor: dark.border.subtle,
      color: dark.ink.primary,
    }));
    expect(minutes.props.placeholderTextColor).toBe(dark.ink.muted);
    expect(flat(trigger.props.style({ pressed: false }))).toEqual(expect.objectContaining({
      minHeight: spacing.touch,
      backgroundColor: dark.surface.raised,
      borderColor: dark.border.subtle,
    }));

    act(() => trigger.props.onPress());
    expect(renderer.root.findAll((node) => node.props.tint === 'dark')).not.toHaveLength(0);
    expect(renderer.root.findAll((node) => staticStyle(node).backgroundColor === dark.interaction.scrim))
      .not.toHaveLength(0);
    expect(renderer.root.findAll((node) => staticStyle(node).borderColor === dark.border.strong))
      .not.toHaveLength(0);
    const plates = renderer.root.findAll((node) => {
      const color = staticStyle(node).backgroundColor;
      return isCharcoalWithAlpha(color, dark.surface.card) && colorAlpha(color) < 1;
    });
    expect(plates).not.toHaveLength(0);
    expect(colorAlpha(staticStyle(plates[0]).backgroundColor)).toBeGreaterThan(0);
  });
});
