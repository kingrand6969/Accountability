import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const momentum = readFileSync(require.resolve('./MomentumScreen'), 'utf8');

describe('Journey Momentum athlete workspace design', () => {
  test('uses a compact weekly performance panel instead of decorative orbit artwork', () => {
    expect(momentum).toContain('styles.momentumPanel');
    expect(momentum).toContain('styles.pillarTrack');
    expect(momentum).toContain('styles.pillarProgress');
    expect(momentum).toContain('7-DAY MOMENTUM');
    expect(momentum).not.toContain('styles.orbit');
    expect(momentum).not.toContain('styles.glowOne');
    expect(momentum).not.toContain('styles.glowTwo');
    expect(momentum).not.toContain("fontFamily: 'Georgia'");
  });
});
