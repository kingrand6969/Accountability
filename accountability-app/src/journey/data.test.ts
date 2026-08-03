import { describe, expect, it, jest } from '@jest/globals';
import type { TimelineItem, TimelineType } from '../timeline/types';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

// The module must be imported after the Supabase mock so native storage is not
// initialized in the unit-test environment.
// eslint-disable-next-line import/first
import { hasCompletionProof, pillarActiveDays, pillarCompletion, timelinePillar } from './data';

function item(
  id: string,
  type: TimelineItem['type'],
  starts_at: string,
  checklist: TimelineItem['checklist'] = null,
): TimelineItem {
  return {
    id,
    type,
    starts_at,
    checklist,
    user_id: 'user',
    title: id,
    note: null,
    reminder_id: null,
    created_at: starts_at,
  };
}

describe('Journey real-data summaries', () => {
  const proofCases: [TimelineType, boolean][] = [
    ['activity', true],
    ['expense', true],
    ['income', true],
    ['grocery', false],
    ['meal', true],
    ['task', false],
    ['event', false],
    ['workout', false],
    ['other', false],
  ];

  it.each(proofCases)('defines proof semantics for %s', (type, recordedIsProof) => {
    expect(hasCompletionProof(item(type, type, '2026-07-28T10:00:00Z'))).toBe(recordedIsProof);
    expect(
      hasCompletionProof(item(`${type}-done`, type, '2026-07-28T10:00:00Z', [{ text: 'one', done: true }])),
    ).toBe(true);
    if (!recordedIsProof) {
      expect(
        hasCompletionProof(item(`${type}-partial`, type, '2026-07-28T10:00:00Z', [{ text: 'one', done: false }])),
      ).toBe(false);
    }
  });

  it('returns zero rather than an invented baseline when a pillar has no data', () => {
    expect(pillarCompletion([], 'body')).toEqual({ total: 0, complete: 0, score: 0 });
  });

  it('derives completion and active days from categorized timeline records', () => {
    const items = [
      item('run', 'activity', '2026-07-27T10:00:00Z'),
      item('workout', 'workout', '2026-07-28T10:00:00Z', [{ text: 'set', done: false }]),
      item('saving', 'income', '2026-07-28T11:00:00Z', [{ text: 'save', done: true }]),
    ];
    expect(timelinePillar(items[0].type)).toBe('body');
    expect(pillarCompletion(items, 'body')).toEqual({ total: 2, complete: 1, score: 50 });
    expect(pillarActiveDays(items, 'body')).toBe(1);
  });

  it('does not unlock pillar days from scheduled entries without proof', () => {
    const items = [
      item('scheduled', 'workout', '2026-07-27T10:00:00Z'),
      item('complete', 'workout', '2026-07-28T10:00:00Z', [{ text: 'set', done: true }]),
    ];
    expect(pillarActiveDays(items, 'body')).toBe(1);
  });

  it('groups active days by local calendar boundaries rather than UTC slices', () => {
    const beforeLocalMidnight = new Date(2026, 6, 28, 23, 30).toISOString();
    const afterLocalMidnight = new Date(2026, 6, 29, 0, 30).toISOString();
    const items = [
      item('first', 'activity', beforeLocalMidnight),
      item('second', 'activity', afterLocalMidnight),
    ];
    expect(pillarActiveDays(items, 'body')).toBe(2);
  });
});
