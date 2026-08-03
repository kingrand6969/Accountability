import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./RankBadge'), 'utf8');

describe('RankBadge animation state contract', () => {
  test('creates stable shine, flicker, and hover values once per badge', () => {
    expect(source).toContain('const [shine] = useState(() => new Animated.Value(0));');
    expect(source).toContain('const [flick] = useState(() => new Animated.Value(1));');
    expect(source).toContain('const [hover] = useState(() => new Animated.Value(0));');
    expect(source).not.toContain('useRef(');
  });

  test('keeps dynamic effects, timing, hover, and cleanup unchanged', () => {
    expect(source).toContain('const twinkles = useMemo(');
    expect(source).toContain('const puffs = useMemo(');
    expect(source).toContain('if (!motion) return;');
    expect(source).toContain('Animated.delay(900)');
    expect(source).toContain('Animated.delay(1400)');
    expect(source).toContain('duration: 160');
    expect(source).toContain('duration: 220');
    expect(source).toContain('return () => loops.forEach((l) => l.stop());');
  });
});
