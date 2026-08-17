import { describe, expect, it, jest } from '@jest/globals';
import { createElement, type ReactElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable, StyleSheet, Text, View } from 'react-native';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  const { Text: NativeText } = require('react-native');
  return function MockIonicon(props: Record<string, unknown>) {
    return React.createElement(NativeText, props, props.name);
  };
});
jest.mock('../achievements/RankBadge', () => {
  const React = require('react');
  const { Text: NativeText } = require('react-native');
  return {
    RankBadge: (props: Record<string, unknown>) =>
      React.createElement(NativeText, { ...props, testID: 'buddy-card-rank-badge' }, 'rank crest'),
  };
});
jest.mock('../ui/CachedImage', () => {
  const React = require('react');
  const { View: NativeView } = require('react-native');
  return {
    CachedImage: (props: Record<string, unknown>) => React.createElement(NativeView, props),
  };
});

import { MEDALS, medalState } from '../achievements/catalog';
import { Medal } from '../achievements/Medal';
import { BuddyCardAchievements } from './BuddyCardAchievements';
import { BuddyCardFocus } from './BuddyCardFocus';
import { resolveBuddyCardPalette } from './palette';
import type { BuddyCard } from './card';
import { PublicBuddyCardFace } from './PublicBuddyCardFace';

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

  function expectTruthfulEmptyAchievements(renderer: TestRenderer.ReactTestRenderer, onPress: jest.Mock) {
    expect(renderer.root.findByProps({ testID: 'buddy-card-achievements' })).toBeDefined();
    expect(featuredMedals(renderer)).toHaveLength(0);
    expect(renderer.root.findAllByType(Medal)).toHaveLength(0);
    expect(renderer.root.findAllByType(Text).map((node) => node.props.children)).toEqual(
      expect.arrayContaining(['Medals and Challenges', 'No earned medals shared yet']),
    );

    const action = interactiveByLabel(renderer, 'View all medals and completed challenges');
    act(() => action.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  }

  it('keeps the gallery action and truthful empty state when earned medals are not shared', () => {
    const onPress = jest.fn();
    const renderer = render(createElement(BuddyCardAchievements, {
      card: card({ show_medals: false }), palette, onPress,
    }));

    expectTruthfulEmptyAchievements(renderer, onPress);
  });

  it('keeps the gallery action and truthful empty state when no medals have been earned', () => {
    const onPress = jest.fn();
    const renderer = render(createElement(BuddyCardAchievements, {
      card: card({ medals_list: [] }), palette, onPress,
    }));

    expectTruthfulEmptyAchievements(renderer, onPress);
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

describe('PublicBuddyCardFace clean composition', () => {
  const publicFaceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/buddy/PublicBuddyCardFace.tsx'),
    'utf8',
  );
  const completeCard: BuddyCard = {
    palette_key: 'power_violet',
    show_headline: true,
    show_traits: true,
    traits: ['Encouraging', 'Running'],
    show_rank: true,
    rank_name: 'Mythical',
    show_medals: true,
    medals_list: [{ id: 'streak', tier: 0 }],
    featured_medal_ids: ['streak'],
    show_area: true,
    show_last_active: true,
    show_consistency: true,
    show_points: true,
    show_distance: true,
    show_challenge_wins: true,
    show_city_rank: true,
    show_country_rank: true,
  };
  const metrics = {
    consistency: 87.6,
    points: 1234,
    avgkm: 4.25,
    distance: 321.8,
    chwin: 7,
    buddiesRank: 3,
    buddiesTotal: 18,
  };
  const boardRank = {
    city: 'Perth',
    country: 'Australia',
    cityRank: 4,
    countryRank: null,
  };
  const stats = { buddies: 42, km: 300, stars: 99, cheers: 215 };
  const privateCard: BuddyCard = {
    palette_key: 'polar_blue',
    show_area: false,
    show_rank: false,
    rank_name: 'Mythical',
    show_challenge_wins: false,
    show_country_rank: false,
    show_city_rank: false,
    show_consistency: false,
    show_points: false,
    show_medals: false,
    medals_list: [{ id: 'streak', tier: 0 }],
    featured_medal_ids: ['streak'],
  };
  const privateBoardRank = {
    city: 'Perth',
    country: 'Australia',
    cityRank: 4,
    countryRank: 8,
  };

  function publicCard(overrides: Record<string, unknown> = {}) {
    return render(createElement(PublicBuddyCardFace, {
      name: 'Kin Grand',
      area: 'Perth, Australia',
      avatar: 'https://example.com/avatar.jpg',
      memberSince: 'Jan 2025',
      lastActive: '2026-08-17T08:00:00.000Z',
      headline: 'Build a stronger morning routine.',
      card: completeCard,
      metrics,
      boardRank,
      stats,
      mutualBuddiesCount: 0,
      onPressMedals: jest.fn(),
      ...overrides,
    }));
  }

  function renderedText(renderer: TestRenderer.ReactTestRenderer) {
    return renderer.root.findAllByType(Text).map((node) =>
      Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children ?? ''),
    );
  }

  function rankingCells(renderer: TestRenderer.ReactTestRenderer) {
    const rankings = renderer.root.findByProps({ testID: 'buddy-card-rankings' });
    const cells = rankings.findAllByType(View).filter(
      (node) => node.findAllByType(Text).length === 2,
    ).map((cell) => {
      const [value, label] = cell.findAllByType(Text);
      return {
        label: String(label.props.children),
        value: String(value.props.children),
      };
    });
    return cells.filter(
      (cell, index) =>
        cells.findIndex(
          (candidate) => candidate.label === cell.label && candidate.value === cell.value,
        ) === index,
    );
  }

  function rankingAccessibilityCells(renderer: TestRenderer.ReactTestRenderer) {
    const rankings = renderer.root.findByProps({ testID: 'buddy-card-rankings' });
    return rankings.findAllByType(View).filter((node) => node.props.accessible === true);
  }

  it('follows the approved clean information order without a photo-led hero', () => {
    const order = [
      'BuddyCardIdentity',
      'BuddyCardFocus',
      'BuddyCardRankings',
      'BuddyCardAchievements',
      'BuddyCardSocialProof',
      'BuddyCardFitnessMetrics',
    ].map((name) => publicFaceSource.indexOf(`<${name}`));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(publicFaceSource).not.toContain('LinearGradient');
    expect(publicFaceSource).not.toContain('resolvedHero');
    expect(publicFaceSource).not.toContain('Top achievements');
    expect(publicFaceSource).not.toContain('Rank 10 of 10');
  });

  it('retains authorized identity, ranking, medal, social, and fitness information', () => {
    const renderer = publicCard();
    const copy = renderedText(renderer);

    expect(copy).toEqual(expect.arrayContaining([
      'Kin Grand',
      expect.stringContaining('Perth, Australia'),
      'Member since Jan 2025',
      'Mythical',
      'Challenges won · 7',
      'Cheering',
      'Running',
      'CURRENT FOCUS',
      'Build a stronger morning routine.',
      'Rankings',
      'Country',
      '—',
      'City',
      '#4',
      'Buddies',
      '#3',
      'Points',
      '1,234',
      'Medals and Challenges',
      'Cheers',
      '215',
      'Fitness',
      'Consistency',
      '88%',
      'Avg km/day',
      '4.25 km',
      'Distance',
      '321.8 km',
    ]));
    expect(rankingCells(renderer)).toEqual([
      { label: 'Country', value: '—' },
      { label: 'City', value: '#4' },
      { label: 'Buddies', value: '#3' },
      { label: 'Points', value: '1,234' },
    ]);
  });

  it('keeps the official compact rank crest immediately left of the rank name', () => {
    const renderer = publicCard();
    const row = renderer.root.findByProps({ testID: 'buddy-card-rank-inline' });
    const badge = renderer.root.findByProps({ testID: 'buddy-card-rank-badge' });
    const rankLabel = row.findAllByType(Text).find((node) => node.props.children === 'Mythical');

    expect(StyleSheet.flatten(row.props.style)).toEqual(expect.objectContaining({
      flexDirection: 'row',
      alignItems: 'center',
    }));
    expect(badge.props.rank).toBe('Mythical');
    expect(badge.props.size).toBe(24);
    expect(badge.props.animated).toBe(false);
    expect(badge.props.variant).toBe('crest');
    expect(StyleSheet.flatten(rankLabel!.props.style)).toEqual(expect.objectContaining({
      color: resolveBuddyCardPalette('power_violet', 'light').accent,
      fontSize: 13,
    }));
    expect(row.findAllByType(Text).map((node) => node.props.children)).toEqual([
      'rank crest',
      'Mythical',
    ]);
  });

  it('uses the approved light Buddy Card palette instead of the phone system appearance', () => {
    const renderer = publicCard();
    const frame = renderer.root.findByProps({ testID: 'public-buddy-card' });
    const selected = resolveBuddyCardPalette('power_violet', 'light');

    expect(publicFaceSource).not.toContain('useColorScheme');
    expect(StyleSheet.flatten(frame.props.style)).toEqual(expect.objectContaining({
      backgroundColor: selected.surface,
      borderColor: selected.border,
    }));
  });

  it('keeps challenge wins directly below the inline rank without a horizontal offset', () => {
    const renderer = publicCard();
    const challengeWins = renderer.root.findAllByType(Text).find(
      (node) => node.props.children?.[0] === 'Challenges won · ',
    );

    expect(challengeWins).toBeDefined();
    expect(StyleSheet.flatten(challengeWins!.props.style).marginLeft ?? 0).toBe(0);
  });

  it('uses a contained palette glow instead of a fixed full-width identity band', () => {
    const renderer = publicCard();
    const atmosphere = renderer.root.findByProps({ testID: 'buddy-card-atmosphere' });
    const layout = StyleSheet.flatten(atmosphere.props.style);

    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(layout.borderRadius).toBeGreaterThan(0);
    expect(layout.left).toBeUndefined();
    expect(layout.right).toBeLessThan(0);
  });

  it('does not invent a rank when the shared rank is missing or unknown', () => {
    const missingRank = publicCard({
      card: { ...completeCard, rank_name: undefined, show_challenge_wins: true },
    });
    const unknownRank = publicCard({
      card: { ...completeCard, rank_name: 'Cosmic', show_challenge_wins: true },
    });

    expect(missingRank.root.findAllByProps({ testID: 'buddy-card-rank-inline' })).toHaveLength(0);
    expect(unknownRank.root.findAllByProps({ testID: 'buddy-card-rank-inline' })).toHaveLength(0);
    expect(renderedText(missingRank)).toContain('Challenges won · 7');
    expect(renderedText(unknownRank)).toContain('Challenges won · 7');
  });

  it('keeps an independently shared challenge-win count aligned when rank is hidden', () => {
    const renderer = publicCard({
      card: { ...completeCard, show_rank: false, show_challenge_wins: true },
    });
    const challengeWins = renderer.root.findAllByType(Text).find(
      (node) => node.props.children?.[0] === 'Challenges won · ',
    );

    expect(challengeWins).toBeDefined();
    expect(StyleSheet.flatten(challengeWins!.props.style).marginLeft).toBe(0);
  });

  it('separates rank-crest consent from buddies-ranking consent', () => {
    const crestOnly = publicCard({
      card: {
        ...completeCard,
        show_rank: true,
        show_consistency: false,
        show_country_rank: false,
        show_city_rank: false,
        show_points: false,
      },
    });
    expect(crestOnly.root.findByProps({ testID: 'buddy-card-rank-inline' })).toBeDefined();
    expect(crestOnly.root.findByProps({ testID: 'buddy-card-rankings' })).toBeDefined();
    expect(rankingCells(crestOnly)).toEqual([
      { label: 'Country', value: '—' },
      { label: 'City', value: '—' },
      { label: 'Buddies', value: '—' },
      { label: 'Points', value: '—' },
    ]);

    const buddiesRankingOnly = publicCard({
      card: {
        ...completeCard,
        show_rank: false,
        show_consistency: true,
        show_country_rank: false,
        show_city_rank: false,
        show_points: false,
      },
    });
    expect(buddiesRankingOnly.root.findAllByProps({ testID: 'buddy-card-rank-inline' })).toHaveLength(0);
    expect(rankingCells(buddiesRankingOnly)).toEqual([
      { label: 'Country', value: '—' },
      { label: 'City', value: '—' },
      { label: 'Buddies', value: '#3' },
      { label: 'Points', value: '—' },
    ]);
  });

  it('keeps stable country and city columns while applying their consent independently', () => {
    const countryOnly = publicCard({
      card: {
        ...completeCard,
        show_country_rank: true,
        show_city_rank: false,
        show_consistency: false,
        show_points: false,
      },
    });
    expect(rankingCells(countryOnly)).toEqual([
      { label: 'Country', value: '—' },
      { label: 'City', value: '—' },
      { label: 'Buddies', value: '—' },
      { label: 'Points', value: '—' },
    ]);

    const cityOnly = publicCard({
      card: {
        ...completeCard,
        show_country_rank: false,
        show_city_rank: true,
        show_consistency: false,
        show_points: false,
      },
    });
    expect(rankingCells(cityOnly)).toEqual([
      { label: 'Country', value: '—' },
      { label: 'City', value: '#4' },
      { label: 'Buddies', value: '—' },
      { label: 'Points', value: '—' },
    ]);
  });

  it('keeps all four ranking columns on one non-wrapping row without changing other metric grids', () => {
    const renderer = publicCard();
    const rankingRow = renderer.root.findByProps({ testID: 'buddy-card-ranking-row' });
    const rankingLayout = StyleSheet.flatten(rankingRow.props.style);

    expect(rankingLayout.flexDirection).toBe('row');
    expect(rankingLayout.flexWrap).not.toBe('wrap');
    expect(rankingAccessibilityCells(renderer)).toHaveLength(4);
    rankingAccessibilityCells(renderer).forEach((cell) => {
      expect(StyleSheet.flatten(cell.props.style)).toEqual(expect.objectContaining({
        flex: 1,
        minWidth: 0,
      }));
    });

    expect(StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'buddy-card-social-proof' }).findAllByType(View)[1].props.style,
    ).flexWrap).toBe('wrap');
    expect(StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'buddy-card-fitness' }).findAllByType(View)[1].props.style,
    ).flexWrap).toBe('wrap');
  });

  it('groups ranking values with scope-aware accessible labels and hides descendant announcements', () => {
    const owner = publicCard({
      ownerView: true,
      card: privateCard,
      boardRank: privateBoardRank,
    });
    const visitor = publicCard({
      ownerView: false,
      card: privateCard,
      boardRank: privateBoardRank,
    });

    expect(rankingAccessibilityCells(owner).map((cell) => cell.props.accessibilityLabel)).toEqual([
      'Country ranking, #8',
      'City ranking, #4',
      'Buddies ranking, #3',
      'Points, 1,234',
    ]);
    expect(rankingAccessibilityCells(visitor).map((cell) => cell.props.accessibilityLabel)).toEqual([
      'Country ranking, unavailable',
      'City ranking, unavailable',
      'Buddies ranking, unavailable',
      'Points, unavailable',
    ]);
    [...rankingAccessibilityCells(owner), ...rankingAccessibilityCells(visitor)].forEach((cell) => {
      expect(cell.findAllByType(Text).every((text) => text.props.accessible === false)).toBe(true);
    });
  });

  it('shows unavailable for invalid ranks and rounds valid positive ranks', () => {
    for (const invalidRank of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0, 0.49]) {
      const renderer = publicCard({
        boardRank: { ...boardRank, countryRank: invalidRank },
      });
      expect(rankingCells(renderer)[0]).toEqual({ label: 'Country', value: '—' });
    }

    const renderer = publicCard({
      boardRank: { ...boardRank, countryRank: 0.5, cityRank: 4.4 },
    });
    expect(rankingCells(renderer).slice(0, 2)).toEqual([
      { label: 'Country', value: '#1' },
      { label: 'City', value: '#4' },
    ]);
  });

  it('keeps Cheers and Buddies visible with unavailable values when social stats are missing', () => {
    const renderer = publicCard({
      stats: null,
      ownerView: false,
      mutualBuddiesCount: null,
    });
    const social = renderer.root.findByProps({ testID: 'buddy-card-social-proof' });
    const copy = social.findAllByType(Text).map((node) => String(node.props.children));

    expect(copy).toEqual([
      'Social',
      '—',
      'Cheers',
      '—',
      'Buddies',
    ]);
  });

  it('shows Mutual to another viewer only when the actual count is positive', () => {
    const zeroCopy = renderedText(publicCard({ ownerView: false, mutualBuddiesCount: 0 }));
    const positiveCopy = renderedText(publicCard({ ownerView: false, mutualBuddiesCount: 5 }));

    expect(zeroCopy).not.toContain('Mutual');
    expect(positiveCopy).toContain('Mutual');
    expect(positiveCopy).toContain('5');
  });

  it('uses Groups for the owner without exposing Mutual', () => {
    const ownerCopy = renderedText(publicCard({ ownerView: true, groupsCount: 6 }));

    expect(ownerCopy).toContain('Groups');
    expect(ownerCopy).toContain('6');
    expect(ownerCopy).not.toContain('Mutual');
  });

  it('applies the selected palette only to card atmosphere and leaves rank artwork uncoloured', () => {
    const selected = resolveBuddyCardPalette('power_violet', 'light');
    const renderer = publicCard();
    const frame = renderer.root.findByProps({ testID: 'public-buddy-card' });
    const accent = renderer.root.findByProps({ testID: 'buddy-card-accent' });
    const badge = renderer.root.findByProps({ testID: 'buddy-card-rank-badge' });

    expect(StyleSheet.flatten(frame.props.style)).toEqual(expect.objectContaining({
      backgroundColor: selected.surface,
      borderColor: selected.border,
    }));
    expect(StyleSheet.flatten(accent.props.style)).toEqual(expect.objectContaining({
      backgroundColor: selected.accent,
    }));
    expect(badge.props.color).toBeUndefined();
    expect(badge.props.tintColor).toBeUndefined();
    expect(badge.props.effects).toBe('none');
  });

  it('preserves the approved required structure on a minimal public card', () => {
    const renderer = publicCard({
      card: { palette_key: 'polar_blue', show_medals: false },
      metrics: null,
      stats: null,
      boardRank: null,
      mutualBuddiesCount: null,
      groupsCount: null,
    });
    const copy = renderedText(renderer);

    expect(renderer.root.findByProps({ testID: 'public-buddy-card' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'buddy-card-rankings' })).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'buddy-card-achievements' })).toBeDefined();
    expect(copy).toEqual(expect.arrayContaining([
      'Challenges won · —',
      'Rankings',
      'Country',
      'City',
      'Buddies',
      'Points',
      'Medals and Challenges',
    ]));
    expect(rankingCells(renderer)).toEqual([
      { label: 'Country', value: '—' },
      { label: 'City', value: '—' },
      { label: 'Buddies', value: '—' },
      { label: 'Points', value: '—' },
    ]);
  });

  it('shows owner-authorized area, rank, challenge wins, rankings, and points', () => {
    const owner = publicCard({
      ownerView: true,
      card: privateCard,
      boardRank: privateBoardRank,
    });
    const ownerCopy = renderedText(owner);

    expect(ownerCopy).toEqual(expect.arrayContaining([
      expect.stringContaining('Perth, Australia'),
      'Mythical',
      'Challenges won · 7',
    ]));
    expect(rankingCells(owner)).toEqual([
      { label: 'Country', value: '#8' },
      { label: 'City', value: '#4' },
      { label: 'Buddies', value: '#3' },
      { label: 'Points', value: '1,234' },
    ]);
  });

  it('keeps visitor-private values hidden behind stable labels and placeholders', () => {
    const visitor = publicCard({
      ownerView: false,
      card: privateCard,
      boardRank: privateBoardRank,
    });
    const visitorCopy = renderedText(visitor);

    for (const privateLocation of ['Perth', 'Australia']) {
      expect(visitorCopy.some((value) => value.includes(privateLocation))).toBe(false);
    }
    for (const privateValue of ['Mythical', 'Challenges won · 7', '#8', '#4', '#3', '1,234']) {
      expect(visitorCopy).not.toContain(privateValue);
    }
    expect(visitorCopy).toContain('Challenges won · —');
    expect(rankingCells(visitor)).toEqual([
      { label: 'Country', value: '—' },
      { label: 'City', value: '—' },
      { label: 'Buddies', value: '—' },
      { label: 'Points', value: '—' },
    ]);
  });

  it('shows a real earned medal to the owner without leaking unshared artwork to visitors', () => {
    const owner = publicCard({ ownerView: true, card: privateCard });
    const visitor = publicCard({ ownerView: false, card: privateCard });

    expect(featuredMedals(visitor)).toHaveLength(0);
    expect(featuredMedals(owner).map((node) => node.props.testID)).toEqual([
      'featured-medal-streak',
    ]);
  });
});

describe('PublicBuddyCardFace runtime wiring', () => {
  const screenSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/buddy-card/[id].tsx'),
    'utf8',
  );
  const editorSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/buddy-card-edit.tsx'),
    'utf8',
  );

  function publicFaceInvocation(source: string) {
    const start = source.indexOf('<PublicBuddyCardFace');
    return source.slice(start, source.indexOf('/>', start));
  }

  it('loads authorized public social data and passes all available visitor values', () => {
    const invocation = publicFaceInvocation(screenSource);

    expect(screenSource).toMatch(
      /getBuddyStats\(targetId\)\s*\.then\(\(nextStats\) => commitOptional\(setStats, nextStats\)\)/,
    );
    expect(screenSource).not.toMatch(/if \(buddy\) \{\s*getBuddyStats\(id\)/);
    expect(invocation).toContain('memberSince={memberSince}');
    expect(invocation).toContain('stats={stats}');
    expect(invocation).toContain('boardRank={boardRank}');
    expect(invocation).toContain('metrics={metrics}');
    expect(invocation).toContain('ownerView={ownerView}');
  });

  it('clears viewer-bound state and guards every asynchronous profile load', () => {
    expect(screenSource).toContain('new BuddyCardLoadGuard()');
    expect(screenSource).toContain('const targetToken = guard.begin(targetId)');
    expect(screenSource).toContain('setStats(null)');
    expect(screenSource).toContain('setBoardRank(null)');
    expect(screenSource).toContain('setMetrics(null)');
    expect(screenSource).toContain('setPosts(null)');
    expect(screenSource).toContain('guard.bindViewer(targetToken, viewerId)');
    expect(screenSource).toContain('if (!loadContextIsCurrent(token)) return');
    expect(screenSource).toContain('guard.cancel(activeToken ?? targetToken)');
    expect(screenSource).not.toMatch(/\.then\(set(?:View|Stats|BoardRank|Metrics|Posts|IsBuddy|Loading)/);
    expect(screenSource).not.toContain('catch(() => setPosts([]))');
  });

  it('clears an account-changed view while its viewer token still owns the target', () => {
    const authStart = screenSource.indexOf('supabase.auth.onAuthStateChange');
    const authEnd = screenSource.indexOf('authResult.data.subscription', authStart);
    const authChangeHandler = screenSource.slice(authStart, authEnd);

    expect(authChangeHandler.indexOf('if (!loadContextIsCurrent(token)) return')).toBeGreaterThanOrEqual(0);
    expect(authChangeHandler.indexOf('setView(null)')).toBeGreaterThanOrEqual(0);
    expect(authChangeHandler.indexOf('setLoading(true)')).toBeGreaterThanOrEqual(0);
    expect(authChangeHandler.indexOf('guard.cancel(token)')).toBeGreaterThan(
      authChangeHandler.indexOf('setLoading(true)'),
    );
  });

  it('loads and passes the same available owner data into the editor visitor preview', () => {
    const invocation = publicFaceInvocation(editorSource);

    expect(editorSource).toContain('stats: getBuddyStats');
    expect(editorSource).toContain('boardRank: getBoardRank');
    expect(editorSource).toContain('setMyStats(stats)');
    expect(editorSource).toContain('setMyBoardRank(boardRank)');
    expect(editorSource).toContain('setMyMemberSince(');
    expect(invocation).toContain('memberSince={myMemberSince}');
    expect(invocation).toContain('lastActive={myLastActive}');
    expect(invocation).toContain('stats={myStats}');
    expect(invocation).toContain('boardRank={myBoardRank}');
    expect(invocation).toContain('metrics={myMetrics}');
  });
});
