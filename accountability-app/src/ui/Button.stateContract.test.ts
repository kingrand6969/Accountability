import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./Button'), 'utf8');

describe('Button animation state contract', () => {
  test('creates one stable animated scale per mounted button', () => {
    expect(source).toContain('const [scale] = useState(() => new Animated.Value(1));');
    expect(source).not.toContain('useRef(new Animated.Value(1)).current');
  });

  test('keeps the existing press-in and press-out spring behavior', () => {
    expect(source).toContain('Animated.spring(scale, {');
    expect(source).toContain('onPressIn={() => !inactive && pressTo(0.96)}');
    expect(source).toContain('onPressOut={() => pressTo(1)}');
    expect(source).toContain('disabled={inactive}');
  });
});
