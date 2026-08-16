import { describe, expect, it, jest } from '@jest/globals';
import { createElement, type ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable, Text } from 'react-native';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text: NativeText } = require('react-native');
  return function MockIonicon(props: Record<string, unknown>) {
    return React.createElement(NativeText, props, props.name);
  };
});

import { MEDALS, medalState } from '../achievements/catalog';
import { BuddyCardAchievements } from './BuddyCardAchievements';
import { BuddyCardFocus } from './BuddyCardFocus';
import { resolveBuddyCardPalette } from './palette';
import type { BuddyCard } from './card';

const palette = resolveBuddyCardPalette('polar_blue', 'light');

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

function pressables(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) =>
      node.type === Pressable ||
      (node.type as { displayName?: string })?.displayName === 'Pressable' ||
      ((node.type as { name?: string })?.name === 'Pressable' &&
        typeof node.props.style === 'function'),
  );
}

function featuredMedals(renderer: TestRenderer.ReactTestRenderer) {
  const seen = new Set<string>();
  return renderer.root.findAll(
    (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('featured-medal-'),
  ).filter((node) => {
    if (seen.has(node.props.testID)) return false;
    seen.add(node.props.testID);
    return true;
  });
}

function interactiveByLabel(renderer: TestRenderer.ReactTestRenderer, accessibilityLabel: string) {
  return renderer.root.findAllByProps({ accessibilityLabel }).find(
    (node) => typeof node.props.onPress === 'function',
  )!;
}

function earned(id: string, tier = 0) {
  const def = MEDALS.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Missing test medal ${id}`);
  return { id, tier, state: medalState(def, def.tiers[tier].at) };
}

describe('BuddyCardFocus', () => {
  it('omits missing and whitespace-only focus without leaving dead space', () => {
    expect(render(createElement(BuddyCardFocus, { text: null, palette })).toJSON()).toBeNull();
    expect(render(createElement(BuddyCardFocus, { text: '   ', palette })).toJSON()).toBeNull();
  });

  it('is plain profile text with a muted label and no heavy surface treatment', () => {
    const renderer = render(createElement(BuddyCardFocus, { text: 'Morning strength work', palette }));
    const root = renderer.root.findByProps({ testID: 'buddy-card-focus' });
    const label = renderer.root.findByProps({ testID: 'buddy-card-focus-label' });

    expect(label.props.children).toBe('CURRENT FOCUS');
    expect(label.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: palette.textMuted })]),
    );
    expect(root.props.style).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: expect.anything() }),
        expect.objectContaining({ borderRadius: expect.anything() }),
        expect.objectContaining({ shadowColor: expect.anything() }),
      ]),
    );
  });

  it('caps copy at three lines and shows no action when measurement fits', () => {
    const renderer = render(createElement(BuddyCardFocus, { text: 'A short focus', palette }));
    const measurer = renderer.root.findByProps({ testID: 'buddy-card-focus-measurer' });

    act(() => {
      measurer.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } });
    });

    expect(renderer.root.findByProps({ testID: 'buddy-card-focus-copy' }).props.numberOfLines).toBe(3);
    expect(renderer.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('reveals and collapses overflowing copy through an accessible 48-point action', () => {
    const renderer = render(createElement(BuddyCardFocus, {
      text: 'A deliberately long focus that needs more than three rendered lines.',
      palette,
    }));
    const measurer = renderer.root.findByProps({ testID: 'buddy-card-focus-measurer' });

    act(() => {
      measurer.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}, {}] } });
    });

    let action = interactiveByLabel(renderer, 'View full current focus');
    expect(action.props.accessibilityLabel).toBe('View full current focus');
    expect(action.props.accessibilityState).toEqual({ expanded: false });
    expect(action.props.style).toEqual(expect.objectContaining({ minHeight: 48 }));

    act(() => action.props.onPress());
    action = interactiveByLabel(renderer, 'Collapse current focus');
    expect(renderer.root.findByProps({ testID: 'buddy-card-focus-copy' }).props.numberOfLines).toBeUndefined();
    expect(action.props.accessibilityLabel).toBe('Collapse current focus');
    expect(action.props.accessibilityState).toEqual({ expanded: true });

    act(() => action.props.onPress());
    expect(renderer.root.findByProps({ testID: 'buddy-card-focus-copy' }).props.numberOfLines).toBe(3);
  });

  it('reconciles expansion and measurement when the focus text is replaced', () => {
    const renderer = render(createElement(BuddyCardFocus, {
      text: 'The original long focus needs more than three rendered lines.',
      palette,
    }));
    const staleMeasurer = renderer.root.findByProps({ testID: 'buddy-card-focus-measurer' });
    const staleLayoutHandler = staleMeasurer.props.onTextLayout;

    act(() => {
      staleMeasurer.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}, {}] } });
    });
    act(() => interactiveByLabel(renderer, 'View full current focus').props.onPress());
    expect(renderer.root.findByProps({ testID: 'buddy-card-focus-copy' }).props.numberOfLines).toBeUndefined();

    act(() => {
      renderer.update(createElement(BuddyCardFocus, { text: 'A new short focus', palette }));
    });
    expect(renderer.root.findByProps({ testID: 'buddy-card-focus-copy' }).props.numberOfLines).toBe(3);
    expect(renderer.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);

    act(() => {
      staleLayoutHandler({ nativeEvent: { lines: [{}, {}, {}, {}, {}] } });
    });
    expect(renderer.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);

    const currentMeasurer = renderer.root.findByProps({ testID: 'buddy-card-focus-measurer' });
    act(() => {
      currentMeasurer.props.onTextLayout({ nativeEvent: { lines: [{}, {}] } });
    });
    expect(renderer.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);

    act(() => {
      renderer.update(createElement(BuddyCardFocus, { text: '   ', palette }));
    });
    expect(renderer.toJSON()).toBeNull();

    act(() => {
      renderer.update(createElement(BuddyCardFocus, { text: 'Another short focus', palette }));
    });
    expect(renderer.root.findByProps({ testID: 'buddy-card-focus-copy' }).props.numberOfLines).toBe(3);
    expect(renderer.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);
  });
});

describe('BuddyCardAchievements', () => {
  const medalSnapshots = [
    earned('streak'),
    earned('distance'),
    earned('iron'),
    earned('champion'),
    earned('explorer'),
  ];

  function card(overrides: Partial<BuddyCard> = {}): BuddyCard {
    return {
      show_medals: true,
      medals_list: medalSnapshots.map(({ id, tier }) => ({ id, tier })),
      ...overrides,
    };
  }

  it('omits the section when medal visibility is off or there are no earned medals', () => {
    const onPress = jest.fn();
    expect(render(createElement(BuddyCardAchievements, {
      card: card({ show_medals: false }), palette, onPress,
    })).toJSON()).toBeNull();
    expect(render(createElement(BuddyCardAchievements, {
      card: card({ medals_list: [] }), palette, onPress,
    })).toJSON()).toBeNull();
  });

  it('shows at most four real earned medals in requested order and filters invalid choices', () => {
    const renderer = render(createElement(BuddyCardAchievements, {
      card: card({
        featured_medal_ids: ['champion', 'unknown', 'streak', 'champion', 'distance', 'iron', 'explorer'],
      }),
      palette,
      onPress: jest.fn(),
    }));
    const medals = featuredMedals(renderer);

    expect(medals.map((node) => node.props.testID)).toEqual([
      'featured-medal-champion',
      'featured-medal-streak',
      'featured-medal-distance',
      'featured-medal-iron',
    ]);
    expect(medals.map((node) => node.props.accessibilityLabel)).toEqual([
      `${medalSnapshots[3].state.def.title}, ${medalSnapshots[3].state.tierName}`,
      `${medalSnapshots[0].state.def.title}, ${medalSnapshots[0].state.tierName}`,
      `${medalSnapshots[1].state.def.title}, ${medalSnapshots[1].state.tierName}`,
      `${medalSnapshots[2].state.def.title}, ${medalSnapshots[2].state.tierName}`,
    ]);
    medals.forEach((medal) => {
      expect(medal.props.accessibilityRole).toBe('button');
      expect(medal.props.accessibilityHint).toBe('Opens medals and completed challenges');
      expect(medal.props.onPress).toEqual(expect.any(Function));
      expect(medal.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ minHeight: 48, minWidth: 48 })]),
      );
    });
  });

  it('falls back to the first four earned medals for legacy cards', () => {
    const renderer = render(createElement(BuddyCardAchievements, {
      card: card({ featured_medal_ids: undefined }),
      palette,
      onPress: jest.fn(),
    }));
    const medals = featuredMedals(renderer);
    expect(medals.map((node) => node.props.testID)).toEqual([
      'featured-medal-streak',
      'featured-medal-distance',
      'featured-medal-iron',
      'featured-medal-champion',
    ]);
  });

  it('uses the exact gallery title and exposes its gallery action as a 48-point target', () => {
    const onPress = jest.fn();
    const renderer = render(createElement(BuddyCardAchievements, { card: card(), palette, onPress }));
    const action = pressables(renderer)[0];
    const title = renderer.root.findAllByType(Text).find((node) => node.props.children === 'Medals and Challenges');

    expect(title).toBeDefined();
    expect(action.props.accessibilityRole).toBe('button');
    expect(action.props.accessibilityLabel).toBe('View all medals and completed challenges');
    expect(action.props.style({ pressed: false })).toEqual(
      expect.arrayContaining([expect.objectContaining({ minHeight: 48 })]),
    );
    act(() => action.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
