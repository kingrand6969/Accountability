import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./BusinessPane'), 'utf8');

describe('Business modal state contract', () => {
  test('mounts fresh forms only while their modal is open', () => {
    expect(source).toContain('{lossFor ? (');
    expect(source).toContain('{showCost ? (');
    expect(source).toContain('{(showItemNew || editItem) && biz ? (');
    expect(source).toContain('{showTenantNew && biz ? (');
    expect(source).toContain('{showFixed && biz ? (');
  });

  test('keys item-owned forms and seeds edit fields before first render', () => {
    expect(source).toContain('key={lossFor.id}');
    expect(source).toContain("key={editItem?.id ?? 'new'}");
    expect(source).toContain("const [name, setName] = useState(item?.name ?? '')");
    expect(source).toContain('const [savedId, setSavedId] = useState<string | null>(item?.id ?? null)');
  });

  test('keeps recipe loading asynchronous and removes modal reset effects', () => {
    expect(source).toContain('if (active) setSupplies(next)');
    expect(source).toContain('if (active) setLines(next)');
    expect(source).not.toContain("if (item) setQty('1')");
    expect(source).not.toMatch(/if \(visible\) \{ set(?:Amount|Name)\(/);
  });
});
