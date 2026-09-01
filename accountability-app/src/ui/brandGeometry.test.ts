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

const validMantleGeometry = {
  viewBox: '0 0 96 96',
  wordmark: 'Mantle',
  colors: {
    lime: '#B9FF3D',
    supportingLime: '#7FAF1C',
    charcoal: '#111411',
    cream: '#F4F5F1',
  },
  mark: {
    path: 'M20 67C33 41 47 37 58 50C69 63 76 58 87 37',
    strokeWidth: 14,
    nodes: [
      { cx: 11, cy: 77, r: 9 },
      { cx: 91, cy: 24, r: 9 },
    ],
  },
};

describe('Mantle brand geometry contract', () => {
  it('defines the approved canvas, colors, and wordmark capitalization', () => {
    expect(BRAND_GEOMETRY.viewBox).toBe('0 0 96 96');
    expect(BRAND_GEOMETRY.colors).toEqual({
      lime: '#B9FF3D',
      supportingLime: '#7FAF1C',
      charcoal: '#111411',
      cream: '#F4F5F1',
    });
    expect(BRAND_WORDMARK).toBe('Mantle');
  });

  it('contains one rounded path connecting exactly two nodes', () => {
    expect(BRAND_GEOMETRY.mark).toEqual({
      path: 'M20 67C33 41 47 37 58 50C69 63 76 58 87 37',
      strokeWidth: 14,
      nodes: [
        { cx: 11, cy: 77, r: 9 },
        { cx: 91, cy: 24, r: 9 },
      ],
    });
    expect(BRAND_GEOMETRY.mark).not.toHaveProperty('primaryPath');
    expect(BRAND_GEOMETRY.mark).not.toHaveProperty('accentPath');
  });

  it('rejects malformed geometry instead of accepting partial contracts', () => {
    expect(() => parseBrandGeometry({ viewBox: '0 0 96 88' })).toThrow(
      'Invalid brand geometry',
    );
    expect(() =>
      parseBrandGeometry({
        ...validMantleGeometry,
        colors: { ...validMantleGeometry.colors, lime: 'blue' },
      }),
    ).toThrow('Invalid brand geometry');

    const malformedMarks = [
      {
        strokeWidth: validMantleGeometry.mark.strokeWidth,
        nodes: validMantleGeometry.mark.nodes,
      },
      { ...validMantleGeometry.mark, path: '' },
      { ...validMantleGeometry.mark, strokeWidth: 0 },
      { ...validMantleGeometry.mark, strokeWidth: -1 },
      { ...validMantleGeometry.mark, strokeWidth: Number.POSITIVE_INFINITY },
      { ...validMantleGeometry.mark, nodes: [] },
      { ...validMantleGeometry.mark, nodes: [validMantleGeometry.mark.nodes[0]] },
      {
        ...validMantleGeometry.mark,
        nodes: [
          ...validMantleGeometry.mark.nodes,
          { cx: 48, cy: 48, r: 8 },
        ],
      },
      {
        ...validMantleGeometry.mark,
        nodes: [
          { ...validMantleGeometry.mark.nodes[0], cx: -1 },
          validMantleGeometry.mark.nodes[1],
        ],
      },
      {
        ...validMantleGeometry.mark,
        nodes: [
          { ...validMantleGeometry.mark.nodes[0], cy: Number.NaN },
          validMantleGeometry.mark.nodes[1],
        ],
      },
      {
        ...validMantleGeometry.mark,
        nodes: [
          validMantleGeometry.mark.nodes[0],
          { ...validMantleGeometry.mark.nodes[1], cy: -1 },
        ],
      },
      {
        ...validMantleGeometry.mark,
        nodes: [
          validMantleGeometry.mark.nodes[0],
          { ...validMantleGeometry.mark.nodes[1], cx: Number.POSITIVE_INFINITY },
        ],
      },
      {
        ...validMantleGeometry.mark,
        nodes: [
          { ...validMantleGeometry.mark.nodes[0], r: 0 },
          validMantleGeometry.mark.nodes[1],
        ],
      },
      {
        ...validMantleGeometry.mark,
        nodes: [
          validMantleGeometry.mark.nodes[0],
          { ...validMantleGeometry.mark.nodes[1], r: -1 },
        ],
      },
      {
        ...validMantleGeometry.mark,
        nodes: [
          validMantleGeometry.mark.nodes[0],
          { ...validMantleGeometry.mark.nodes[1], r: Number.NaN },
        ],
      },
    ];

    for (const mark of malformedMarks) {
      expect(() =>
        parseBrandGeometry({ ...validMantleGeometry, mark }),
      ).toThrow('Invalid brand geometry');
    }
  });

  it('rejects sparse two-node arrays', () => {
    expect(() =>
      parseBrandGeometry({
        ...validMantleGeometry,
        mark: { ...validMantleGeometry.mark, nodes: new Array(2) },
      }),
    ).toThrow('Invalid brand geometry');
  });

  it('exposes deeply immutable geometry', () => {
    expect(Object.isFrozen(BRAND_GEOMETRY)).toBe(true);
    expect(Object.isFrozen(BRAND_GEOMETRY.colors)).toBe(true);
    expect(Object.isFrozen(BRAND_GEOMETRY.mark)).toBe(true);
    expect(Object.isFrozen(BRAND_GEOMETRY.mark.nodes)).toBe(true);
    expect(Object.isFrozen(BRAND_GEOMETRY.mark.nodes[0])).toBe(true);
    (BRAND_GEOMETRY.colors as { lime: string }).lime = '#000000';
    expect(BRAND_GEOMETRY.colors.lime).toBe('#B9FF3D');
  });

  it('makes the asset generator consume the authoritative TypeScript contract', () => {
    const generator = fs.readFileSync(generatorPath, 'utf8');

    expect(generator).toContain("loadBrandGeometry('../src/ui/brandGeometry.ts')");
    for (const duplicatedLiteral of [
      '#B9FF3D',
      '#111411',
      '#7FAF1C',
      '#F4F5F1',
      'M20 67C33 41',
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
