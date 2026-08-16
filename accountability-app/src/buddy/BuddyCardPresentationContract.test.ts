import { describe, expect, it, jest } from '@jest/globals';
import { createElement, type ReactElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable, StyleSheet, Text } from 'react-native';

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
      onPressMedals: jest.fn(),
      ...overrides,
    }));
  }

  function renderedText(renderer: TestRenderer.ReactTestRenderer) {
    return renderer.root.findAllByType(Text).map((node) =>
      Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children ?? ''),
    );
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
      'Encouraging',
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
  });

  it('keeps the official compact rank crest immediately left of the rank name', () => {
    const renderer = publicCard();
    const row = renderer.root.findByProps({ testID: 'buddy-card-rank-inline' });
    const badge = renderer.root.findByProps({ testID: 'buddy-card-rank-badge' });

    expect(StyleSheet.flatten(row.props.style)).toEqual(expect.objectContaining({
      flexDirection: 'row',
      alignItems: 'center',
    }));
    expect(badge.props.rank).toBe('Mythical');
    expect(badge.props.size).toBeLessThanOrEqual(36);
    expect(badge.props.animated).toBe(false);
    expect(badge.props.variant).toBe('crest');
    expect(row.findAllByType(Text).map((node) => node.props.children)).toEqual([
      'rank crest',
      'Mythical',
    ]);
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
    expect(crestOnly.root.findAllByProps({ testID: 'buddy-card-rankings' })).toHaveLength(0);

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
    expect(renderedText(buddiesRankingOnly)).toEqual(expect.arrayContaining(['Buddies', '#3']));
  });

  it('uses Mutual for another viewer and Groups for the owner', () => {
    const visitorCopy = renderedText(publicCard({ ownerView: false }));
    const ownerCopy = renderedText(publicCard({ ownerView: true, groupsCount: 6 }));

    expect(visitorCopy).toContain('Mutual');
    expect(visitorCopy).not.toContain('Groups');
    expect(visitorCopy).not.toContain('99');
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

  it('omits optional metric sections when no authorized values are supplied', () => {
    const renderer = publicCard({
      card: { palette_key: 'polar_blue', show_medals: false },
      metrics: null,
      stats: null,
      boardRank: null,
      groupsCount: null,
    });

    expect(renderer.root.findAllByProps({ testID: 'buddy-card-rankings' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'buddy-card-social-proof' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'buddy-card-fitness' })).toHaveLength(0);
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
