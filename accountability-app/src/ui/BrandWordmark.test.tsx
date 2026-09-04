import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

function runtimeSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(entryPath);
    if (
      !entry.isFile() ||
      !/\.tsx?$/.test(entry.name) ||
      /\.(?:test|spec)\.tsx?$/.test(entry.name)
    ) {
      return [];
    }
    return [entryPath];
  });
}

describe('theme-aware Mantle wordmark', () => {
  test('uses the active semantic ink and neon mark instead of a fixed blue image', () => {
    const source = readFileSync(require.resolve('./BrandWordmark'), 'utf8');

    expect(source).toContain('useAppTheme');
    expect(source).toContain('<BrandMark');
    expect(source).toContain('Mantle');
    expect(source).toContain('font.brand');
    expect(source).toContain('accessibilityLabel="Mantle"');
    expect(source).toMatch(
      /<View\s+style=\{styles\.row\}\s+accessible\s+accessibilityRole="image"\s+accessibilityLabel="Mantle"/,
    );
    expect(source).toMatch(
      /accessibilityLabel="Mantle"\s*>\s*<BrandMark[\s\S]*?<Text[\s\S]*?<\/Text>\s*<\/View>/,
    );
    expect(source).toMatch(
      /<BrandMark\s+size=\{markSize\}\s+color=\{theme\.border\.action\}\s+accessible=\{false\}\s*\/>/,
    );
    expect(source).not.toMatch(/<BrandMark[^>]*accessibilityLabel=/);
    expect(source).toContain('theme.border.action');
    expect(source).toContain('theme.ink.primary');
    expect(source).not.toContain('Account<Text');
    expect(source).not.toContain('Ability</Text>');
    expect(source).not.toContain('wordmark.png');
  });

  test('uses the approved compact horizontal lockup proportions', () => {
    const source = readFileSync(require.resolve('./BrandWordmark'), 'utf8');

    expect(source).toContain('const markSize = compact ? 32 : 38');
    expect(source).toContain('gap: 6');
    expect(source).toContain('fontSize: 21');
    expect(source).toContain('fontSize: 18');
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

  test.each([
    [
      'feed header',
      require.resolve('../app/(app)/_layout'),
      "import { BrandWordmark } from '../../ui/BrandWordmark'",
      '<BrandWordmark',
    ],
    [
      'auth shell',
      require.resolve('./AuthShell'),
      "import { BrandMark } from './BrandMark'",
      '<BrandMark',
    ],
    [
      'proof capture card',
      require.resolve('../entry/ProofCaptureCard'),
      "import { BrandMark } from '../ui/BrandMark'",
      '<BrandMark',
    ],
    [
      'external share card',
      require.resolve('../feed/ExternalShareCard'),
      "import { BrandMark } from '../ui/BrandMark'",
      '<BrandMark',
    ],
    [
      'progress share card',
      require.resolve('../progress/ProgressShareCard'),
      "import { BrandMark } from '../ui/BrandMark'",
      '<BrandMark',
    ],
    [
      'glass tab bar',
      require.resolve('./GlassTabBar'),
      "import { BrandMark } from './BrandMark'",
      '<BrandMark',
    ],
  ])('%s consumes the shared Mantle mark', (_surface, sourcePath, expectedImport, expectedJsx) => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain(expectedImport);
    expect(source).toContain(expectedJsx);
    expect(source).not.toMatch(/primaryPath|accentPath/);
    expect(source).not.toMatch(/M25 51C37 43|M51 54C62 65/);
  });

  test('runtime source contains no retired geometry or fixed logo assets', () => {
    const runtimeFiles = runtimeSourceFiles(path.resolve(__dirname, '..'));

    for (const sourcePath of runtimeFiles) {
      const source = readFileSync(sourcePath, 'utf8');
      expect(source).not.toMatch(/M25 51C37 43|M51 54C62 65/);
      expect(source).not.toMatch(/wordmark\.png|logo-mark\.png/);
    }
  });
});
