import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PixelRatio, Text } from 'react-native';

import { GlassTabBar, VISIBLE_TAB_LABELS } from './GlassTabBar';
import {
  FLOATING_BAR_CLEARANCE,
  TAB_BAR_MAX_CONTENT_HEIGHT,
  TAB_BAR_SAFE_AREA_ALLOWANCE,
} from './floatingTabBar';
import * as floatingTabBar from './floatingTabBar';
import { colors, spacing } from './theme';
import { hapticSelect } from './haptics';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 16, left: 0 }),
}));

jest.mock('./haptics', () => ({
  hapticSelect: jest.fn(),
}));

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
  { key: 'finance', name: 'finance' },
  { key: 'journey', name: 'activity' },
  { key: 'run', name: 'run' },
  { key: 'messages', name: 'messages' },
  { key: 'notifications', name: 'notifications' },
  { key: 'today', name: 'today' },
  { key: 'profile', name: 'profile' },
];

const titles: Record<string, string> = {
  feed: 'Feed',
  finance: 'Finance',
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
  const descriptors = Object.fromEntries(
    routes.map((route, index) => [
      route.key,
      {
        options: {
          title: titles[route.key],
          tabBarIcon: index < 5 ? icon(titles[route.key]) : undefined,
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
      }),
    );
  });
  return { renderer, emit, navigate };
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
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('shows exactly the approved five destinations in order', () => {
    const { renderer } = renderTabBar();

    expect(VISIBLE_TAB_LABELS).toEqual([
      'Feed',
      'Finance',
      'Journey',
      'Run',
      'Messages',
    ]);
    expect(visibleLabels(renderer)).toEqual(VISIBLE_TAB_LABELS);
    expect(visibleLabels(renderer)).not.toEqual(
      expect.arrayContaining(['Today', 'Profile', 'Notifications']),
    );
  });

  it('uses quiet ink and a restrained indicator for the selected destination', () => {
    const { renderer } = renderTabBar({ focusedIndex: 1 });
    const finance = pressableByLabel(renderer, 'Finance');

    expect(finance.props.accessibilityRole).toBe('tab');
    expect(finance.props.accessibilityState).toEqual({ selected: true });
    expect(
      renderer.root.findByProps({ testID: 'tab-label-Finance' }).props.style,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: colors.navy })]),
    );
    expect(
      renderer.root.findByProps({ testID: 'tab-indicator-Finance' }).props.style,
    ).toEqual(
      expect.objectContaining({
        backgroundColor: colors.navy,
        position: 'absolute',
        bottom: 3,
      }),
    );
  });

  it('renders Journey with the approved mark and no filled or elevated holder', () => {
    const { renderer } = renderTabBar({ focusedIndex: 2 });
    const journey = pressableByLabel(renderer, 'Journey');
    const mark = renderer.root.findByProps({ testID: 'approved-brand-mark' });
    const idleStyles = journey.props.style({ pressed: false });

    expect(mark.props.accessibilityLabel).toBe('Journey');
    expect(mark.props.color).toBe(colors.navy);
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

  it('provides 44 by 44 targets and exposes selected state accessibly', () => {
    const { renderer } = renderTabBar({ focusedIndex: 4 });

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

  it('allows centered two-line labels on a 320dp phone at high font scale', () => {
    const { renderer } = renderTabBar();

    for (const label of VISIBLE_TAB_LABELS) {
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
  });

  it('uses compact visual words at large text while preserving full accessible names', () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    const { renderer } = renderTabBar();
    const expected = {
      Feed: 'Home',
      Finance: 'Cash',
      Journey: 'Path',
      Run: 'Run',
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
  });

  it('preserves tabPress prevention, navigation, and haptics', () => {
    const prevented = renderTabBar({ preventPress: true });
    act(() => pressableByLabel(prevented.renderer, 'Finance').props.onPress());
    expect(prevented.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'finance',
      canPreventDefault: true,
    });
    expect(prevented.navigate).not.toHaveBeenCalled();
    expect(hapticSelect).not.toHaveBeenCalled();

    const allowed = renderTabBar();
    act(() => pressableByLabel(allowed.renderer, 'Finance').props.onPress());
    expect(allowed.navigate).toHaveBeenCalledWith('finance');
    expect(hapticSelect).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the focused immersive route hides the bar', () => {
    const { renderer } = renderTabBar({ focusedIndex: 3, hideFocused: true });

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
});
