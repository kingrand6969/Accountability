import fs from 'fs';
import path from 'path';
import { describe, expect, test } from '@jest/globals';

const root = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const removedPaths = [
  'src/app/(app)/finance.tsx', 'src/app/money-add.tsx', 'src/app/bill-new.tsx',
  'src/app/account-new.tsx', 'src/app/saving-new.tsx', 'src/app/debt-new.tsx',
  'src/app/shared-goal-new.tsx', 'src/app/shared-goal/[id].tsx', 'src/app/business.tsx',
  'src/money', 'src/business',
];

describe('finance and business removal contract', () => {
  test.each(removedPaths)('%s is not shipped', (relative) => {
    expect(fs.existsSync(path.join(root, relative))).toBe(false);
  });

  test('navigation and shared client modules have no finance feature references', () => {
    const live = [
      'src/app/_layout.tsx', 'src/home/api.ts', 'src/home/HomeHeader.tsx',
      'src/feed/types.ts', 'src/achievements/api.ts', 'src/achievements/catalog.ts',
      'src/achievements/medalArt.ts',
    ].map(read).join('\n');
    expect(live).not.toMatch(/money-add|bill-new|account-new|saving-new|debt-new|shared-goal|goalsHit|goals_hit|goalcrusher|Goal Crusher|money_transactions|\.\.\/money|['"]savings['"]/);
  });

  test('hosted legal documents match the in-app version and effective date', () => {
    const inApp = read('src/legal/content.ts');
    const version = inApp.match(/LEGAL_VERSION = '([^']+)'/)?.[1];
    const effective = inApp.match(/EFFECTIVE_DATE = '([^']+)'/)?.[1];
    expect(version).toBeTruthy();
    expect(effective).toBeTruthy();
    for (const hosted of ['legal-web/terms.html', 'legal-web/privacy.html'].map(read)) {
      expect(hosted).toContain(`Version ${version}`);
      expect(hosted).toContain(`Effective ${effective}`);
      expect(hosted).not.toMatch(/finance tracker|business tracker|receipt scanner|read a receipt|credit-card debt|savings goals/i);
    }
  });
});
