import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./MedalIcon'), 'utf8');

describe('MedalIcon animation state contract', () => {
  test('creates stable halo, glint, drift, and orbit values once per medal', () => {
    expect(source).toContain('const [halo] = useState(() => new Animated.Value(0));');
    expect(source).toContain('const [glint] = useState(() => new Animated.Value(0));');
    expect(source).toContain('const [driftV] = useState(() => new Animated.Value(0));');
    expect(source).toContain('const [orbitV] = useState(() => new Animated.Value(0));');
    expect(source).not.toContain('useRef(');
  });

  test('keeps dynamic effects, motion guards, timing, and cleanup unchanged', () => {
    expect(source).toContain('const embers = useMemo(');
    expect(source).toContain('const sparks = useMemo(');
    expect(source).toContain('if (!motion) return;');
    expect(source).toContain('duration: 3400');
    expect(source).toContain('duration: fx.orbit.ms');
    expect(source).toContain('const t = setTimeout(() => loops.forEach((l) => l.start()), stagger);');
    expect(source).toContain('clearTimeout(t);');
    expect(source).toContain('loops.forEach((l) => l.stop());');
  });
});
