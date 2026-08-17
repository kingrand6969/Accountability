import { describe, expect, test } from '@jest/globals';
import { becameCompleteChecklist } from './completion';

describe('becameCompleteChecklist', () => {
  test('detects only the transition from incomplete to fully complete', () => {
    expect(
      becameCompleteChecklist(
        [{ text: 'Squats', done: false }],
        [{ text: 'Squats', done: true }],
      ),
    ).toBe(true);
    expect(
      becameCompleteChecklist(
        [{ text: 'Squats', done: true }],
        [{ text: 'Squats', done: true }],
      ),
    ).toBe(false);
  });

  test('does not treat empty or partly complete lists as completion', () => {
    expect(becameCompleteChecklist([], [])).toBe(false);
    expect(
      becameCompleteChecklist(
        [
          { text: 'Squats', done: false },
          { text: 'Rows', done: false },
        ],
        [
          { text: 'Squats', done: true },
          { text: 'Rows', done: false },
        ],
      ),
    ).toBe(false);
  });
});
