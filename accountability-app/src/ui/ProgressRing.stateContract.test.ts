import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./ProgressRing'), 'utf8');

describe('ProgressRing animation state contract', () => {
  test('creates one stable animated value for the component lifetime', () => {
    expect(source).toContain('const [anim] = useState(() => new Animated.Value(0));');
    expect(source).not.toContain('const anim = useRef(new Animated.Value(0)).current;');
  });

  test('keeps the SVG listener lifecycle and sweep timing unchanged', () => {
    expect(source).toContain('const id = anim.addListener');
    expect(source).toContain('duration: 700');
    expect(source).toContain('useNativeDriver: false');
    expect(source).toContain('return () => anim.removeListener(id);');
  });
});
