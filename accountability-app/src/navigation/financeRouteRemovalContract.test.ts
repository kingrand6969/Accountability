import fs from 'fs';
import path from 'path';
import { describe, expect, test } from '@jest/globals';
import { EFFECTIVE_DATE, LEGAL_VERSION, PRIVACY, TERMS } from '../legal/content';

const root = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const normalizeLegalText = (value: string) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

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

  test('proof, win-card, and auth intent surfaces have no finance-only amount path', () => {
    const live = [
      'src/app/win-card.tsx',
      'src/entry/proofExport.ts',
      'src/entry/ProofCaptureCard.tsx',
      'src/entry/proofPrivacy.ts',
      'src/navigation/authRouteIntent.ts',
      'src/navigation/authRouteIntent.test.ts',
    ].map(read).join('\n');

    expect(live).not.toMatch(/amountDisplay|hideAmounts|['"]amount['"]|\bamount\??:|cash-outline|Hide amounts/i);
  });

  test('launch copy describes the four-tab fitness and social app', () => {
    const launch = read('LAUNCH.md');

    expect(launch).not.toMatch(/5 pillars|five pillars|finance|business tracker|budgets|debts/i);
    expect(launch).toMatch(/four tabs|Feed, Journey, Run, and Messages/i);
  });

  test('hosted legal documents contain every in-app section title and body', () => {
    for (const [file, doc] of [
      ['legal-web/terms.html', TERMS],
      ['legal-web/privacy.html', PRIVACY],
    ] as const) {
      const hosted = read(file);
      const hostedText = normalizeLegalText(hosted);
      expect(hosted).toContain(`Version ${LEGAL_VERSION}`);
      expect(hosted).toContain(`Effective ${EFFECTIVE_DATE}`);
      expect(hosted).not.toMatch(/finance tracker|business tracker|receipt scanner|read a receipt|credit-card debt|savings goals/i);
      for (const section of doc.sections) {
        expect(hostedText).toContain(normalizeLegalText(section.h));
        for (const paragraph of section.p) {
          expect(hostedText).toContain(normalizeLegalText(paragraph));
        }
      }
    }
  });

  test('the Mantle legal text change advances one synchronized consent version', () => {
    expect(LEGAL_VERSION).toBe('2026-09-02');
    expect(EFFECTIVE_DATE).toBe('September 2, 2026');
    expect(Date.parse(`${LEGAL_VERSION}T00:00:00Z`))
      .toBeGreaterThan(Date.parse('2026-08-10T00:00:00Z'));

    const expectedMeta = `Effective ${EFFECTIVE_DATE} · Version ${LEGAL_VERSION}`;
    for (const file of ['legal-web/index.html', 'legal-web/terms.html', 'legal-web/privacy.html']) {
      const hosted = read(file);
      expect(hosted.match(new RegExp(expectedMeta, 'g'))).toHaveLength(1);
      expect(hosted).not.toMatch(/Effective August 10, 2026|Version 2026-08-10/);
    }
  });

  test('the hosted legal generator uses the canonical operator identity', () => {
    const generator = read('scripts/build-legal.mjs');
    expect(generator).toContain('<div class="logo">${esc(OPERATOR)}</div>');
    expect(generator).not.toContain(['Account', '<span>Ability</span>'].join(''));
  });

  test('hosted legal surfaces use the current public operator name', () => {
    const staleHostedName = new RegExp(
      ['Account', 'Ability|ACCOUNT', 'ABILITY|Accountability', ' App'].join(''),
    );
    for (const file of ['legal-web/index.html', 'legal-web/terms.html', 'legal-web/privacy.html']) {
      const hosted = read(file);
      expect(hosted).toContain('Mantle');
      expect(hosted).not.toMatch(staleHostedName);
      expect(hosted).not.toMatch(/Account\s*<span\b[^>]*>\s*Ability\s*<\/span>/s);
    }
  });

  test('Terms section headings are sequential', () => {
    expect(TERMS.sections.map((section) => Number(section.h.match(/^(\d+)\./)?.[1])))
      .toEqual(TERMS.sections.map((_, index) => index + 1));
  });
});
