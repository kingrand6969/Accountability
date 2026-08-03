import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./Medal'), 'utf8');

describe('Medal animation state contract', () => {
  test('creates stable shine, pulse, and float values once per fallback medal', () => {
    expect(source).toContain('const [shine] = useState(() => new Animated.Value(0));');
    expect(source).toContain('const [pulse] = useState(() => new Animated.Value(0));');
    expect(source).toContain('const [float] = useState(() => new Animated.Value(0));');
    expect(source).not.toContain('useRef(');
  });

  test('keeps animation guards, timing, interpolation, and cleanup unchanged', () => {
    expect(source).toContain('if (!animate || !state.unlocked) return;');
    expect(source).toContain('Animated.delay(1400)');
    expect(source).toContain('duration: 850');
    expect(source).toContain('duration: 1500');
    expect(source).toContain('duration: 2000');
    expect(source).toContain('outputRange: [0, -5]');
    expect(source).toContain('return () => loops.forEach((l) => l.stop());');
  });
});
