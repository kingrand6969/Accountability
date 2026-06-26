import { describe, it, expect } from '@jest/globals';
import { buildSession, sessionSummary } from './session';

describe('buildSession', () => {
  it('applies the strength goal (5x5, 120s rest) to every exercise', () => {
    const s = buildSession('arms_chest', 'strength');
    expect(s.length).toBeGreaterThan(0);
    for (const ex of s) {
      expect(ex.sets).toBe(5);
      expect(ex.reps).toBe('5');
      expect(ex.restSec).toBe(120);
    }
  });

  it('applies the muscle goal (4 sets, 8–12 reps)', () => {
    const s = buildSession('legs', 'muscle');
    expect(s[0].sets).toBe(4);
    expect(s[0].reps).toBe('8–12');
  });

  it('keeps the focus’s exercises in order', () => {
    const s = buildSession('back', 'endurance');
    expect(s[0].name).toBe('Pull-ups');
  });
});

describe('sessionSummary', () => {
  it('summarises sets x reps per exercise', () => {
    const s = buildSession('arms_chest', 'strength');
    expect(sessionSummary(s)).toContain('Bench Press 5×5');
  });
});
