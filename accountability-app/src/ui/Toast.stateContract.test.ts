import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./Toast'), 'utf8');

describe('Toast animation state contract', () => {
  test('creates one stable animated opacity for the root host', () => {
    expect(source).toContain('const [opacity] = useState(() => new Animated.Value(0));');
    expect(source).not.toContain('const opacity = useRef(new Animated.Value(0)).current;');
  });

  test('keeps dismissal timing and timer cleanup unchanged', () => {
    expect(source).toContain('duration: 180');
    expect(source).toContain('duration: 220');
    expect(source).toContain('}, 2600);');
    expect(source).toContain('if (hideTimer.current) clearTimeout(hideTimer.current);');
    expect(source).toContain(
      'const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);',
    );
  });
});
