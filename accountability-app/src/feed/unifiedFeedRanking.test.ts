import { describe, expect, test } from '@jest/globals';
import {
  interleaveUnifiedFeed,
  type RankedFeedCandidate,
  type UnifiedFeedSource,
} from './unifiedFeedRanking';

type Candidate = RankedFeedCandidate & { marker?: string };

const item = (
  id: string,
  source: UnifiedFeedSource,
  createdAt = '2026-08-10T12:00:00.000Z',
  score = 0,
  marker?: string,
): Candidate => ({ id, source, createdAt, score, marker });

const ids = (rows: readonly RankedFeedCandidate[]) => rows.map(({ id }) => id);

describe('interleaveUnifiedFeed', () => {
  test('orders connection sources by relationship tier before freshness or score', () => {
    const connections = [
      item('page', 'followed_page', '2026-08-11T12:00:00Z', 999),
      item('group', 'joined_group'),
      item('person', 'followed_person'),
      item('buddy', 'buddy'),
      item('self', 'self', '2020-01-01T00:00:00Z'),
    ];

    expect(ids(interleaveUnifiedFeed({ connections, suggestions: [], limit: 20 })))
      .toEqual(['self', 'buddy', 'person', 'group', 'page']);
  });

  test('uses freshness, then score, then stable ID within a source tier', () => {
    const connections = [
      item('older-high', 'buddy', '2026-08-09T12:00:00Z', 100),
      item('newer-low', 'buddy', '2026-08-10T12:00:00Z', 0),
      item('b', 'buddy', '2026-08-08T12:00:00Z', 5),
      item('a', 'buddy', '2026-08-08T12:00:00Z', 5),
      item('higher-score', 'buddy', '2026-08-08T12:00:00Z', 6),
    ];

    expect(ids(interleaveUnifiedFeed({ connections, suggestions: [], limit: 20 })))
      .toEqual(['newer-low', 'older-high', 'higher-score', 'a', 'b']);
  });

  test('sorts invalid timestamps oldest, including after valid pre-1970 dates', () => {
    const connections = [
      item('invalid-b', 'buddy', 'not-a-date'),
      item('epoch', 'buddy', '1970-01-01T00:00:00Z'),
      item('pre-epoch', 'buddy', '1960-01-01T00:00:00Z'),
      item('invalid-a', 'buddy', 'also-invalid'),
    ];

    expect(ids(interleaveUnifiedFeed({ connections, suggestions: [], limit: 20 })))
      .toEqual(['epoch', 'pre-epoch', 'invalid-a', 'invalid-b']);
  });

  test('places at most one suggestion after each four connection rows', () => {
    const connections = Array.from({ length: 9 }, (_, index) =>
      item(`c${index + 1}`, 'buddy', `2026-08-${String(10 - index).padStart(2, '0')}T12:00:00Z`));
    const suggestions = [item('s2', 'suggested', '2026-08-09T12:00:00Z'), item('s1', 'suggested')];

    expect(ids(interleaveUnifiedFeed({ connections, suggestions, limit: 20 })))
      .toEqual(['c1', 'c2', 'c3', 'c4', 's1', 'c5', 'c6', 'c7', 'c8', 's2', 'c9']);
  });

  test('never leads with or returns only suggestions', () => {
    const suggestions = [item('suggestion', 'suggested')];
    expect(interleaveUnifiedFeed({ connections: [], suggestions, limit: 20 })).toEqual([]);
    expect(ids(interleaveUnifiedFeed({
      connections: [item('connection', 'buddy')], suggestions, limit: 20,
    }))).toEqual(['connection']);
  });

  test('deduplicates IDs with connection content taking precedence', () => {
    const connections = [item('same', 'buddy', undefined, 0, 'connection')];
    const suggestions = [item('same', 'suggested', undefined, 999, 'suggestion')];
    expect(interleaveUnifiedFeed({ connections, suggestions, limit: 20 }))
      .toEqual([expect.objectContaining({ id: 'same', marker: 'connection', source: 'buddy' })]);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns an empty result for unsafe limit %p',
    (limit) => expect(interleaveUnifiedFeed({
      connections: [item('connection', 'buddy')], suggestions: [], limit,
    })).toEqual([]),
  );

  test('floors a finite limit and preserves candidate metadata', () => {
    const connections = [
      item('a', 'buddy', '2026-08-10T12:00:00Z', 0, 'kept'),
      item('b', 'buddy', '2026-08-09T12:00:00Z'),
    ];
    expect(interleaveUnifiedFeed({ connections, suggestions: [], limit: 1.9 }))
      .toEqual([expect.objectContaining({ id: 'a', marker: 'kept' })]);
  });

  test('does not mutate either input array or its candidate objects', () => {
    const connection = Object.freeze(item('b', 'buddy'));
    const suggestion = Object.freeze(item('s', 'suggested'));
    const connections = Object.freeze([connection]);
    const suggestions = Object.freeze([suggestion]);

    expect(() => interleaveUnifiedFeed({ connections, suggestions, limit: 10 })).not.toThrow();
    expect(connections).toEqual([connection]);
    expect(suggestions).toEqual([suggestion]);
  });
});
