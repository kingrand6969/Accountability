import { describe, expect, test } from '@jest/globals';
import {
  FLEX_BODY_MAX_LENGTH,
  FLEX_SOURCE_ID_MAX_LENGTH,
  FLEX_TITLE_MAX_LENGTH,
  parseFlexContext,
  type FlexContextParams,
  type FlexKind,
} from './flexContext';

const UUID = '68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a';

describe('Flex context parsing', () => {
  test.each<FlexKind>([
    'manual',
    'streak',
    'workout',
    'challenge',
    'medal',
    'rank',
    'leaderboard',
    'run',
  ])('accepts the exact supported kind %s with a UUID source', (kind) => {
    expect(parseFlexContext({
      achievementKind: kind,
      achievementSourceId: UUID,
      achievementTitle: 'Morning milestone',
    })).toEqual({
      kind,
      sourceId: UUID,
      title: 'Morning milestone',
      body: 'Morning milestone completed on AccountAbility. I showed up today.',
      showPublicly: false,
    });
  });

  test('preserves a display-safe custom body and the single public choice', () => {
    expect(parseFlexContext({
      achievementKind: 'challenge',
      achievementSourceId: UUID,
      achievementTitle: '  First 10K  ',
      achievementText: '  Finished strong   with my buddies.  ',
      audience: 'public',
      showOnCard: '1',
    })).toEqual({
      kind: 'challenge',
      sourceId: UUID,
      title: 'First 10K',
      body: 'Finished strong with my buddies.',
      showPublicly: true,
    });
  });

  test('normalizes every mismatched legacy pair to Buddies only', () => {
    expect(parseFlexContext({
      achievementKind: 'workout',
      achievementSourceId: UUID,
      achievementTitle: 'Strength session',
      audience: 'buddies',
      showOnCard: '1',
    })).toMatchObject({ showPublicly: false });
    expect(parseFlexContext({
      achievementKind: 'workout',
      achievementSourceId: UUID,
      achievementTitle: 'Strength session',
      audience: 'public',
    })).toMatchObject({ showPublicly: false });
  });

  test('accepts one scalar showPublicly value for new Flex routes', () => {
    expect(parseFlexContext({
      achievementKind: 'medal',
      achievementSourceId: UUID,
      achievementTitle: 'Trailblazer',
      showPublicly: '1',
    })).toMatchObject({ showPublicly: true });
  });

  const invalidCases: [string, FlexContextParams][] = [
    ['unknown kind', { achievementKind: 'achievement', achievementSourceId: UUID, achievementTitle: 'Title' }],
    ['array kind', { achievementKind: ['run'], achievementSourceId: UUID, achievementTitle: 'Title' }],
    ['missing source', { achievementKind: 'run', achievementTitle: 'Title' }],
    ['nested source', { achievementKind: 'run', achievementSourceId: 'runs/secret', achievementTitle: 'Title' }],
    ['encoded source', { achievementKind: 'run', achievementSourceId: 'run%2Fsecret', achievementTitle: 'Title' }],
    ['oversized source', { achievementKind: 'run', achievementSourceId: `r${'x'.repeat(FLEX_SOURCE_ID_MAX_LENGTH)}`, achievementTitle: 'Title' }],
    ['oversized title', { achievementKind: 'run', achievementSourceId: UUID, achievementTitle: 'x'.repeat(FLEX_TITLE_MAX_LENGTH + 1) }],
    ['unsafe body', { achievementKind: 'run', achievementSourceId: UUID, achievementTitle: 'Title', achievementText: 'hello\nworld' }],
    ['oversized body', { achievementKind: 'run', achievementSourceId: UUID, achievementTitle: 'Title', achievementText: 'x'.repeat(FLEX_BODY_MAX_LENGTH + 1) }],
  ];

  for (const [label, params] of invalidCases) {
    test(`rejects ${label}`, () => {
      expect(parseFlexContext(params)).toBeNull();
    });
  }
});
