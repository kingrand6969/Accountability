import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PixelRatio, StyleSheet, Text } from 'react-native';

import { GlassTabBar, VISIBLE_TAB_LABELS } from './GlassTabBar';
import {
  FLOATING_BAR_CLEARANCE,
  TAB_BAR_MAX_CONTENT_HEIGHT,
  TAB_BAR_SAFE_AREA_ALLOWANCE,
} from './floatingTabBar';
import * as floatingTabBar from './floatingTabBar';
import { spacing, themeColors, type AppThemeMode } from './theme';
import { hapticSelect } from './haptics';

let mockThemeMode: AppThemeMode = 'dark';

jest.mock('./AppThemeProvider', () => ({
  useAppTheme: () => {
    const theme = jest.requireActual<typeof import('./theme')>('./theme');
    return {
      mode: mockThemeMode,
      colors: theme.themeColors(mockThemeMode),
      setMode: jest.fn(),
    };
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 16, left: 0 }),
}));

jest.mock('./haptics', () => ({
  hapticSelect: jest.fn(),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const mockReact = jest.requireActual<typeof import('react')>('react');
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ name, color, size }: { name: string; color: string; size: number }) => mockReact.createElement(
    MockText,
    { testID: `ionicon-${name}`, style: { color, width: size, height: size } },
  );
});

jest.mock('./BrandMark', () => ({
  BrandMark: function MockBrandMark(props: Record<string, unknown>) {
    const React = jest.requireActual<typeof import('react')>('react');
    const ReactNative =
      jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(ReactNative.View, {
      ...props,
      testID: 'approved-brand-mark',
    });
  },
}));

type Route = { key: string; name: string };

const routes: Route[] = [
  { key: 'feed', name: 'index' },
  { key: 'journey', name: 'activity' },
  { key: 'run', name: 'run' },
  { key: 'messages', name: 'messages' },
  { key: 'notifications', name: 'notifications' },
  { key: 'today', name: 'today' },
  { key: 'profile', name: 'profile' },
];

const titles: Record<string, string> = {
  feed: 'Feed',
  journey: 'Journey',
  run: 'Run',
  messages: 'Messages',
  notifications: 'Notifications',
  today: 'Today',
  profile: 'Profile',
};

function icon(label: string) {
  return function TestIcon({
    color,
  }: {
    focused: boolean;
    color: string;
    size: number;
  }) {
    return createElement(
      Text,
      { testID: `icon-${label}`, style: { color } },
      label,
    );
  };
}

function renderTabBar({
  focusedIndex = 0,
  preventPress = false,
  hideFocused = false,
}: {
  focusedIndex?: number;
  preventPress?: boolean;
  hideFocused?: boolean;
} = {}) {
  const emit = jest.fn(() => ({ defaultPrevented: preventPress }));
  const navigate = jest.fn();
  const onMenu = jest.fn();
  const descriptors = Object.fromEntries(
    routes.map((route, index) => [
      route.key,
      {
        options: {
          title: titles[route.key],
          tabBarIcon: index < 4 ? icon(titles[route.key]) : undefined,
          tabBarStyle:
            hideFocused && index === focusedIndex ? { display: 'none' } : undefined,
        },
      },
    ]),
  );

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      createElement(GlassTabBar, {
        state: { index: focusedIndex, routes },
        descriptors,
        navigation: { emit, navigate },
        onMenu,
      }),
    );
  });
  return { renderer, emit, navigate, onMenu };
}

function visibleLabels(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAll(
      (node) =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('tab-label-'),
    )
    .map((node) => node.props.testID.replace('tab-label-', ''))
    .filter((label, index, labels) => labels.indexOf(label) === index);
}

function pressableByLabel(
  renderer: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string,
) {
  return renderer.root
    .findAllByProps({ accessibilityLabel })
    .find((node) => typeof node.props.style === 'function')!;
}

describe('GlassTabBar contract', () => {
  beforeEach(() => {
    mockThemeMode = 'dark';
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('shows Menu immediately after Messages as the fifth dashboard destination', () => {
    const { renderer } = renderTabBar();

    expect(VISIBLE_TAB_LABELS).toEqual([
      'Feed',
      'Journey',
      'Run',
      'Messages',
      'Menu',
    ]);
    expect(visibleLabels(renderer)).toEqual([
      'Feed',
      'Journey',
      'Messages',
      'Menu',
    ]);
    expect(visibleLabels(renderer)).not.toEqual(
      expect.arrayContaining(['Today', 'Profile', 'Notifications']),
    );
  });

  it('uses action ink and a restrained indicator for the selected destination', () => {
    const dark = themeColors('dark');
    const { renderer } = renderTabBar({ focusedIndex: 1 });
    const journey = pressableByLabel(renderer, 'Journey');

    expect(journey.props.accessibilityRole).toBe('tab');
    expect(journey.props.accessibilityState).toEqual({ selected: true });
    expect(
      renderer.root.findByProps({ testID: 'tab-label-Journey' }).props.style,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: dark.ink.action })]),
    );
    expect(
      renderer.root.findByProps({ testID: 'tab-indicator-Journey' }).props.style,
    ).toEqual(
      expect.objectContaining({
        backgroundColor: dark.ink.action,
        position: 'absolute',
        bottom: 3,
      }),
    );
  });

  it('keeps Menu unselected and muted when a hidden Notifications route is focused', () => {
    const dark = themeColors('dark');
    const inactive = renderTabBar({ focusedIndex: 0 });
    const inactiveMenu = pressableByLabel(inactive.renderer, 'Menu');

    expect(inactiveMenu.props.accessibilityState).toEqual({ selected: false });
    expect(
      StyleSheet.flatten(
        inactive.renderer.root.findByProps({ testID: 'ionicon-menu-outline' }).props.style,
      ).color,
    ).toBe(dark.ink.muted);
    expect(
      inactive.renderer.root.findByProps({ testID: 'tab-label-Menu' }).props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ color: dark.ink.muted })]));

    const notifications = renderTabBar({ focusedIndex: 4 });
    const notificationsMenu = pressableByLabel(notifications.renderer, 'Menu');

    expect(notificationsMenu.props.accessibilityState).toEqual({ selected: false });
    expect(
      StyleSheet.flatten(
        notifications.renderer.root.findByProps({ testID: 'ionicon-menu-outline' }).props
          .style,
      ).color,
    ).toBe(dark.ink.muted);
    expect(
      notifications.renderer.root.findByProps({ testID: 'tab-label-Menu' }).props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ color: dark.ink.muted })]));
  });

  it('renders the permanent dark surface, border, ink, and indicator roles', () => {
    const dark = themeColors('dark');
    const { renderer } = renderTabBar({ focusedIndex: 0 });

    expect(renderer.toJSON()).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          style: expect.arrayContaining([
            expect.objectContaining({
              backgroundColor: dark.surface.raised,
              borderTopColor: dark.border.subtle,
            }),
          ]),
        }),
      }),
    );
    expect(
      renderer.root.findByProps({ testID: 'tab-label-Feed' }).props.style,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: dark.ink.action })]),
    );
    expect(renderer.root.findByProps({ testID: 'icon-Feed' }).props.style).toEqual(
      expect.objectContaining({ color: dark.ink.action }),
    );
    expect(
      renderer.root.findByProps({ testID: 'tab-label-Messages' }).props.style,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: dark.ink.muted })]),
    );
    expect(
      renderer.root.findByProps({ testID: 'tab-indicator-Feed' }).props.style,
    ).toEqual(expect.objectContaining({ backgroundColor: dark.ink.action }));
    expect(renderer.root.findByProps({ testID: 'icon-Messages' }).props.style).toEqual(
      expect.objectContaining({ color: dark.ink.muted }),
    );
  });

  it('renders Journey with the approved mark and no filled or elevated holder', () => {
    const dark = themeColors('dark');
    const { renderer } = renderTabBar({ focusedIndex: 1 });
    const journey = pressableByLabel(renderer, 'Journey');
    const mark = renderer.root.findByProps({ testID: 'approved-brand-mark' });
    const idleStyles = journey.props.style({ pressed: false });

    expect(mark.props.accessible).toBe(false);
    expect(mark.props.accessibilityLabel).toBeUndefined();
    expect(journey.props.accessibilityRole).toBe('tab');
    expect(journey.props.accessibilityLabel).toBe('Journey');
    expect(mark.props.color).toBe(dark.ink.action);
    expect(idleStyles).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: expect.any(String),
        }),
      ]),
    );
    expect(idleStyles).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elevation: expect.any(Number),
        }),
      ]),
    );
  });

  it('provides 48 by 48 targets and exposes selected state accessibly', () => {
    const { renderer } = renderTabBar({ focusedIndex: 3 });

    expect(
      renderer.root.findByProps({ testID: 'primary-tab-list' }).props
        .accessibilityRole,
    ).toBe('tablist');
    for (const label of VISIBLE_TAB_LABELS) {
      const tab = pressableByLabel(renderer, label);
      const style = tab.props.style({ pressed: false }) as (
        | Record<string, unknown>
        | false
        | undefined
      )[];
      expect(style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            minHeight: spacing.touch,
            minWidth: spacing.touch,
          }),
        ]),
      );
      expect(tab.props.accessibilityRole).toBe('tab');
      expect(tab.props.accessibilityState).toEqual({
        selected: label === 'Messages',
      });
    }
  });

  it('renders Run as the elevated Crown Dock action without a visual label', () => {
    const focused = renderTabBar({ focusedIndex: 2 });
    const run = pressableByLabel(focused.renderer, 'Run');

    expect(
      focused.renderer.root.findByProps({ testID: 'crown-dock-run' }),
    ).toBeTruthy();
    expect(
      focused.renderer.root.findAllByProps({ testID: 'tab-label-Run' }),
    ).toHaveLength(0);
    expect(run.props.accessibilityRole).toBe('tab');
    expect(run.props.accessibilityState).toEqual({ selected: true });

    const unfocused = renderTabBar();
    act(() => pressableByLabel(unfocused.renderer, 'Run').props.onPress());
    expect(unfocused.navigate).toHaveBeenCalledWith('run');
    expect(hapticSelect).toHaveBeenCalledTimes(1);
  });

  it('allows centered two-line labels on a 320dp phone at high font scale', () => {
    const { renderer } = renderTabBar();

    for (const label of VISIBLE_TAB_LABELS.filter((label) => label !== 'Run')) {
      const text = renderer.root.findByProps({ testID: `tab-label-${label}` });
      expect(text.props.numberOfLines).not.toBe(1);
      expect(text.props.numberOfLines).toBe(2);
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            textAlign: 'center',
            flexShrink: 1,
          }),
        ]),
      );
    }
    expect(renderer.root.findAllByProps({ testID: 'tab-label-Run' })).toHaveLength(0);
  });

  it('uses compact visual words at large text while preserving full accessible names', () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    const { renderer } = renderTabBar();
    const expected = {
      Feed: 'Home',
      Journey: 'Path',
      Messages: 'Chat',
    } as const;

    for (const [accessibleName, visualLabel] of Object.entries(expected)) {
      expect(pressableByLabel(renderer, accessibleName).props.accessibilityLabel).toBe(
        accessibleName,
      );
      expect(
        renderer.root.findByProps({ testID: `tab-label-${accessibleName}` }).props.children,
      ).toBe(visualLabel);
    }
    expect(renderer.root.findAllByProps({ testID: 'tab-label-Run' })).toHaveLength(0);
  });

  it('uses compact dock typography while preserving the Feed accessible name', () => {
    const { renderer } = renderTabBar();
    const feed = pressableByLabel(renderer, 'Feed');
    const label = renderer.root.findByProps({ testID: 'tab-label-Feed' });

    expect(StyleSheet.flatten(label.props.style)).toEqual(
      expect.objectContaining({ fontSize: 11, lineHeight: 14 }),
    );
    expect(feed.props.accessibilityLabel).toBe('Feed');
  });

  it('preserves tabPress prevention, navigation, and haptics', () => {
    const prevented = renderTabBar({ preventPress: true });
    act(() => pressableByLabel(prevented.renderer, 'Journey').props.onPress());
    expect(prevented.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'journey',
      canPreventDefault: true,
    });
    expect(prevented.navigate).not.toHaveBeenCalled();
    expect(hapticSelect).not.toHaveBeenCalled();

    const allowed = renderTabBar();
    act(() => pressableByLabel(allowed.renderer, 'Journey').props.onPress());
    expect(allowed.navigate).toHaveBeenCalledWith('activity');
    expect(hapticSelect).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the focused immersive route hides the bar', () => {
    const { renderer } = renderTabBar({ focusedIndex: 2, hideFocused: true });

    expect(renderer.toJSON()).toBeNull();
  });

  it('reserves enough content clearance for the bar and a large Android inset', () => {
    const tabBarContentHeight = (
      floatingTabBar as typeof floatingTabBar & {
        tabBarContentHeight?: (fontScale: number) => number;
      }
    ).tabBarContentHeight;

    expect(typeof tabBarContentHeight).toBe('function');
    expect(tabBarContentHeight?.(1)).toBeLessThan(tabBarContentHeight?.(1.3) ?? 0);
    expect(tabBarContentHeight?.(1.3)).toBeLessThan(tabBarContentHeight?.(2) ?? 0);
    expect(tabBarContentHeight?.(2)).toBe(TAB_BAR_MAX_CONTENT_HEIGHT);
    expect(FLOATING_BAR_CLEARANCE).toBe(
      TAB_BAR_MAX_CONTENT_HEIGHT + TAB_BAR_SAFE_AREA_ALLOWANCE,
    );
    expect(TAB_BAR_MAX_CONTENT_HEIGHT).toBeGreaterThanOrEqual(100);
    expect(TAB_BAR_SAFE_AREA_ALLOWANCE).toBeGreaterThanOrEqual(32);
  });

  it('keeps the underlying native tab bar aligned with the selected appearance', () => {
    const dark = themeColors('dark');
    const style = floatingTabBar.floatingTabBarStyle(320, 16, 1, {
      backgroundColor: dark.surface.raised,
      borderTopColor: dark.border.subtle,
    });

    expect(style).toEqual(
      expect.objectContaining({
        width: 320,
        height: 84,
        backgroundColor: dark.surface.raised,
        borderTopColor: dark.border.subtle,
      }),
    );
  });

  it('opens the existing Menu destination with haptic feedback', () => {
    const { renderer, onMenu } = renderTabBar();

    expect(renderer.root.findByProps({ testID: 'ionicon-menu-outline' })).toBeTruthy();
    act(() => pressableByLabel(renderer, 'Menu').props.onPress());

    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(hapticSelect).toHaveBeenCalledTimes(1);
  });

  it('falls back to dark semantic tab chrome when no palette is supplied', () => {
    const dark = themeColors('dark');

    expect(floatingTabBar.floatingTabBarStyle(320, 16)).toEqual(
      expect.objectContaining({
        backgroundColor: dark.surface.canvas,
        borderTopColor: dark.border.subtle,
      }),
    );
  });
});
