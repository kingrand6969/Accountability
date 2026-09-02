import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

describe('theme-aware Mantle wordmark', () => {
  test('uses the active semantic ink and neon mark instead of a fixed blue image', () => {
    const source = readFileSync(require.resolve('./BrandWordmark'), 'utf8');

    expect(source).toContain('useAppTheme');
    expect(source).toContain('<BrandMark');
    expect(source).toContain('Mantle');
    expect(source).toContain('font.brand');
    expect(source).toContain('accessibilityLabel="Mantle"');
    expect(source).toContain('theme.border.action');
    expect(source).toContain('theme.ink.primary');
    expect(source).not.toContain('Account<Text');
    expect(source).not.toContain('Ability</Text>');
    expect(source).not.toContain('wordmark.png');
  });

  test('is used by the Feed header so Dark mode never receives a dark fixed-image wordmark', () => {
    const source = readFileSync(require.resolve('../app/(app)/_layout'), 'utf8');

    expect(source).toContain('<BrandWordmark');
    expect(source).not.toContain("require('../../../assets/images/wordmark.png')");
  });

  test.each([
    ['auth shell', require.resolve('./AuthShell'), "import { BRAND_WORDMARK } from './brandGeometry'", 'color={theme.ink.action}', "wordmark: {\n    fontFamily: font.brand", 'color: theme.ink.primary'],
    ['proof capture card', require.resolve('../entry/ProofCaptureCard'), "import { BRAND_WORDMARK } from '../ui/brandGeometry'", 'color="#B9FF3D"', "color: '#F4F5F1'", 'fontFamily: font.brand'],
    ['external share card', require.resolve('../feed/ExternalShareCard'), "import { BRAND_WORDMARK } from '../ui/brandGeometry'", 'color="#B9FF3D"', "color: '#F4F5F1'", 'fontFamily: font.brand'],
    ['progress share card', require.resolve('../progress/ProgressShareCard'), "import { BRAND_WORDMARK } from '../ui/brandGeometry'", 'color="#B9FF3D"', "color: '#F4F5F1'", 'fontFamily: font.brand'],
  ])('%s renders one canonical Mantle lockup', (_surface, sourcePath, expectedImport, markColor, wordColor, brandFont) => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain(expectedImport);
    expect(source.match(/\{BRAND_WORDMARK\}<\/Text>/g)).toHaveLength(1);
    expect(source).toContain(markColor);
    expect(source).toContain(wordColor);
    expect(source).toContain(brandFont);
    expect(source).not.toMatch(/>MANTLE<|>MANTLE<\/Text>/);
    expect(source).not.toMatch(/Account\s*<Text\b[^>]*>\s*Ability\s*<\/Text>/s);
  });
});
