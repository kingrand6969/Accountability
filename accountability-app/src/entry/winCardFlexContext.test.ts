import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Win Card Flex context integration', () => {
  test('uses the strict Flex parser for achievement identity and display copy', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/win-card.tsx'), 'utf8');

    expect(source).toContain("import { parseFlexContext");
    expect(source).toContain('parseFlexContext(params)');
    expect(source).toContain('flexContext.sourceId');
    expect(source).toContain('flexContext.title');
    expect(source).toContain('flexContext.body');
    expect(source).not.toContain('sanitizeProofParam(params.achievementSourceId)');
  });
});
