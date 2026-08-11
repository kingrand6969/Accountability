import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

function visibleTabNames(layoutSource: string): string[] {
  const screenBlocks = layoutSource.match(/<Tabs\.Screen\b[\s\S]*?\/>/g) ?? [];

  return screenBlocks.flatMap((block) => {
    const name = block.match(/\bname="([^"]+)"/)?.[1];
    const hidden =
      /\bhref\s*:\s*null\b/.test(block) ||
      /\btabBarItemStyle\s*:\s*\{[\s\S]*?\bdisplay\s*:\s*['"]none['"]/.test(block);

    return name && !hidden ? [name] : [];
  });
}

describe('fitness focus contract', () => {
  test('keeps Feed, Journey, Run and Messages and removes Finance', () => {
    const layoutSource = source('src/app/(app)/_layout.tsx');

    for (const title of ['Feed', 'Journey', 'Run', 'Messages']) {
      expect(layoutSource).toContain(`title: '${title}'`);
    }
    expect(visibleTabNames(layoutSource)).toEqual(['index', 'activity', 'run', 'messages']);
    expect(layoutSource).toContain('name="post/[id]"');
    expect(layoutSource).toMatch(/name="post\/\[id\]"[\s\S]*?href:\s*null/);
  });

  test('removes money from Journey, menu, onboarding and invitations', () => {
    const files = [
      'src/app/(app)/activity.tsx',
      'src/journey/JourneyPathScreen.tsx',
      'src/journey/JournalScreen.tsx',
      'src/journey/data.ts',
      'src/timeline/format.ts',
      'src/timeline/types.ts',
      'src/ui/theme.ts',
      'src/app/add.tsx',
      'src/profiles/api.ts',
      'src/app/menu.tsx',
      'src/app/onboarding.tsx',
      'src/social/invite.ts',
    ];

    for (const file of files) {
      expect(source(file)).not.toMatch(/finance|money|expense|income|save \$|wallet-outline|cash-outline/i);
    }
  });
});
