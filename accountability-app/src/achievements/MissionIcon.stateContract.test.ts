import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./MissionIcon'), 'utf8');

describe('MissionIcon animation state contract', () => {
  test('creates stable animation values and a deterministic stagger once per mount', () => {
    expect(source).toContain('const [sheen] = useState(() => new Animated.Value(0));');
    expect(source).toContain('const [aura] = useState(() => new Animated.Value(0));');
    expect(source).toContain('const [seed] = useState(');
    expect(source).not.toContain('useRef(');
  });

  test('keeps reduced-motion resets, cycle timing, and cleanup unchanged', () => {
    expect(source).toContain('sheen.stopAnimation();');
    expect(source).toContain('aura.stopAnimation();');
    expect(source).toContain('duration: 900');
    expect(source).toContain('Animated.delay(4200)');
    expect(source).toContain('duration: 2200');
    expect(source).toContain('}, seed);');
    expect(source).toContain('clearTimeout(t);');
  });
});
