import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./FinancePanes'), 'utf8');

describe('Finance modal state contract', () => {
  test('mounts card forms only while their modal is open', () => {
    expect(source).toContain('{payFor ? (');
    expect(source).toContain('{showAddCard ? (');
    expect(source).toContain('key={payFor.id}');
  });

  test('seeds payment state before first render', () => {
    expect(source).toContain(
      "const [amount, setAmount] = useState(card.monthly_payment ? String(card.monthly_payment) : '')",
    );
    expect(source).toContain('const attemptKey = useRef<string | null>(null)');
  });

  test('does not reset Finance form state from effects', () => {
    expect(source).not.toContain('useEffect');
    expect(source).not.toContain('visible={showAddCard}');
  });
});
