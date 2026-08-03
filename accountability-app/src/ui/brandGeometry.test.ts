import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from '@jest/globals';

import {
  BRAND_GEOMETRY,
  BRAND_WORDMARK,
  parseBrandGeometry,
} from './brandGeometry';

const projectRoot = path.resolve(__dirname, '../..');
const generatorPath = path.join(projectRoot, 'scripts/generate-brand-assets.mjs');

function loaderError(sourcePath: string) {
  const expression = `
    import { loadBrandGeometry } from ${JSON.stringify(pathToFileURL(generatorPath).href)};
    try {
      await loadBrandGeometry(${JSON.stringify(sourcePath)});
    } catch (error) {
      process.stdout.write(error.message);
    }
  `;
  return execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', expression],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
}

function pngDimensions(filePath: string) {
  const png = fs.readFileSync(filePath);
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

describe('AccountAbility brand geometry contract', () => {
  it('defines the approved canvas, colors, and wordmark capitalization', () => {
    expect(BRAND_GEOMETRY.viewBox).toBe('0 0 96 88');
    expect(BRAND_GEOMETRY.colors).toEqual({
      cobalt: '#155EEF',
      navy: '#081A3A',
      cream: '#F7F4EC',
    });
    expect(BRAND_WORDMARK).toBe('AccountAbility');
  });

  it('contains exactly two heads and two asymmetric open-centre ribbons', () => {
    expect(BRAND_GEOMETRY.heads).toHaveLength(2);
    expect(BRAND_GEOMETRY.ribbons).toHaveLength(2);
    expect({
      heads: BRAND_GEOMETRY.heads,
      ribbons: BRAND_GEOMETRY.ribbons,
    }).toMatchInlineSnapshot(`
      {
        "heads": [
          {
            "cx": 27,
            "cy": 15,
            "r": 10,
          },
          {
            "cx": 69,
            "cy": 15,
            "r": 10,
          },
        ],
        "ribbons": [
          "M5 78 20 33c2-7 11-10 17-5l22 22-14 17-13-15-10 30H9c-3 0-5-2-4-4Z",
          "m91 78-15-45c-2-7-11-10-17-5L37 50l14 17 13-15 10 30h13c3 0 5-2 4-4Z",
        ],
      }
    `);
  });

  it('rejects malformed geometry instead of accepting partial contracts', () => {
    expect(() => parseBrandGeometry({ viewBox: '0 0 96 88' })).toThrow(
      'Invalid brand geometry',
    );
    expect(() =>
      parseBrandGeometry({
        ...BRAND_GEOMETRY,
        colors: { ...BRAND_GEOMETRY.colors, cobalt: 'blue' },
      }),
    ).toThrow('Invalid brand geometry');
  });

  it('exposes deeply immutable geometry', () => {
    expect(Object.isFrozen(BRAND_GEOMETRY)).toBe(true);
    expect(Object.isFrozen(BRAND_GEOMETRY.colors)).toBe(true);
    expect(Object.isFrozen(BRAND_GEOMETRY.heads)).toBe(true);
    expect(Object.isFrozen(BRAND_GEOMETRY.heads[0])).toBe(true);
    expect(Object.isFrozen(BRAND_GEOMETRY.ribbons)).toBe(true);
    (BRAND_GEOMETRY.colors as { cobalt: string }).cobalt = '#000000';
    expect(BRAND_GEOMETRY.colors.cobalt).toBe('#155EEF');
  });

  it('makes the asset generator consume the authoritative TypeScript contract', () => {
    const generator = fs.readFileSync(generatorPath, 'utf8');

    expect(generator).toContain("loadBrandGeometry('../src/ui/brandGeometry.ts')");
    for (const duplicatedLiteral of [
      '#155EEF',
      '#081A3A',
      '#F7F4EC',
      'M5 78 20 33',
      'm91 78-15-45',
    ]) {
      expect(generator).not.toContain(duplicatedLiteral);
    }
  });

  it('reports missing and malformed geometry source files', () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'brand-loader-'),
    );
    const malformedPath = path.join(fixtureDirectory, 'malformed.ts');
    fs.writeFileSync(
      malformedPath,
      'parseBrandGeometry(JSON.parse(String.raw`{ nope }`))',
    );

    expect(loaderError(path.join(fixtureDirectory, 'missing.ts'))).toContain(
      'Unable to read brand geometry',
    );
    expect(loaderError(malformedPath)).toContain(
      'Brand geometry JSON contract is malformed',
    );
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  });

  it('generates all eight PNGs at approved dimensions in an isolated directory', () => {
    const outputDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'brand-assets-'),
    );
    execFileSync(
      process.execPath,
      [generatorPath, '--output-dir', outputDirectory],
      { cwd: projectRoot, stdio: 'pipe' },
    );

    const expectedDimensions = {
      'icon.png': { width: 1024, height: 1024 },
      'android-icon-foreground.png': { width: 432, height: 432 },
      'android-icon-monochrome.png': { width: 432, height: 432 },
      'logo-mark.png': { width: 400, height: 400 },
      'splash-icon.png': { width: 512, height: 512 },
      'logo.png': { width: 900, height: 193 },
      'wordmark.png': { width: 600, height: 129 },
      'favicon.png': { width: 64, height: 64 },
    };

    expect(fs.readdirSync(outputDirectory).sort()).toEqual(
      Object.keys(expectedDimensions).sort(),
    );
    for (const [fileName, dimensions] of Object.entries(expectedDimensions)) {
      expect(pngDimensions(path.join(outputDirectory, fileName))).toEqual(
        dimensions,
      );
    }
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  });
});
