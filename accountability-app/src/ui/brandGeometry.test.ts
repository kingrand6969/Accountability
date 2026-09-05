import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';

import {
  BRAND_ADAPTIVE_ICON_RENDER_VIEW_BOX,
  BRAND_GENERAL_MARK_RENDER_VIEW_BOX,
  BRAND_GEOMETRY,
  BRAND_LOCKUP_MARK_ASPECT_RATIO,
  BRAND_LOCKUP_MARK_RENDER_VIEW_BOX,
  BRAND_WORDMARK,
  parseBrandGeometry,
} from './brandGeometry';

const projectRoot = path.resolve(__dirname, '../..');
const generatorPath = path.join(projectRoot, 'scripts/generate-brand-assets.mjs');
const committedAssetDirectory = path.join(projectRoot, 'assets/images');

const expectedDimensions = {
  'icon.png': { width: 1024, height: 1024 },
  'android-icon-foreground.png': { width: 432, height: 432 },
  'android-icon-monochrome.png': { width: 432, height: 432 },
  'logo-mark.png': { width: 400, height: 400 },
  'splash-icon.png': { width: 512, height: 512 },
  'logo.png': { width: 900, height: 193 },
  'wordmark.png': { width: 600, height: 129 },
  'favicon.png': { width: 64, height: 64 },
} as const;

const minimumContentPixels = {
  'icon.png': 75_000,
  'android-icon-foreground.png': 5_000,
  'android-icon-monochrome.png': 5_000,
  'logo-mark.png': 10_000,
  'splash-icon.png': 18_000,
  'logo.png': 8_000,
  'wordmark.png': 3_000,
  'favicon.png': 300,
} as const;

const textRegionContracts = {
  'logo.png': {
    region: { left: 190, top: 0, width: 300, height: 193 },
    minimumWidth: 200,
    minimumHeight: 45,
  },
  'wordmark.png': {
    region: { left: 128, top: 0, width: 200, height: 129 },
    minimumWidth: 150,
    minimumHeight: 35,
  },
} as const;

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

async function outerEdgePixels(filePath: string) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels: number[][] = [];
  const addPixel = (x: number, y: number) => {
    const offset = (y * info.width + x) * info.channels;
    pixels.push(Array.from(data.subarray(offset, offset + info.channels)));
  };

  for (let x = 0; x < info.width; x += 1) {
    addPixel(x, 0);
    addPixel(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    addPixel(0, y);
    addPixel(info.width - 1, y);
  }
  return pixels;
}

async function rasterGeometrySummary(
  filePath: string,
  size: number,
  alphaThreshold = 1,
) {
  const { data, info } = await sharp(filePath)
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  let maxRadialDistance = 0;
  let leftNodePixels = 0;
  let rightNodePixels = 0;
  let edgeIsTransparent = true;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = data[(y * size + x) * info.channels + 3];
      if (
        alpha !== 0 &&
        (x === 0 || y === 0 || x === size - 1 || y === size - 1)
      ) {
        edgeIsTransparent = false;
      }
      if (alpha < alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxRadialDistance = Math.max(
        maxRadialDistance,
        Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2),
      );
      if (alpha >= 128 && x < size * 0.3) leftNodePixels += 1;
      if (alpha >= 128 && x > size * 0.7) rightNodePixels += 1;
    }
  }

  return {
    bounds: {
      bottom: size - 1 - maxY,
      height: maxY - minY + 1,
      left: minX,
      right: size - 1 - maxX,
      top: minY,
      width: maxX - minX + 1,
    },
    edgeIsTransparent,
    leftNodePixels,
    maxRadialDistance,
    rightNodePixels,
  };
}

function rgb(hex: string) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

async function countOpaqueRgb(filePath: string, expectedRgb: number[]) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let matchingPixels = 0;

  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (
      data[offset] === expectedRgb[0] &&
      data[offset + 1] === expectedRgb[1] &&
      data[offset + 2] === expectedRgb[2] &&
      data[offset + 3] === 255
    ) {
      matchingPixels += 1;
    }
  }
  return matchingPixels;
}

async function contentSummary(filePath: string) {
  const image = sharp(filePath).ensureAlpha();
  const { data, info } = await image
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stats = await image.stats();
  const background = Array.from(data.subarray(0, info.channels));
  let contentPixels = 0;

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const pixel = Array.from(data.subarray(offset, offset + info.channels));
    const differsFromBackground = pixel.some(
      (channel, channelIndex) => channel !== background[channelIndex],
    );
    const isContent =
      background[3] === 0 ? pixel[3] > 0 : differsFromBackground;
    if (isContent) {
      contentPixels += 1;
    }
  }

  return { alphaMaximum: stats.channels[3].max, contentPixels };
}

async function monochromeSummary(filePath: string) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let visiblePixels = 0;
  let nonBlackVisiblePixels = 0;

  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] === 0) continue;
    visiblePixels += 1;
    if (
      data[offset] !== 0 ||
      data[offset + 1] !== 0 ||
      data[offset + 2] !== 0
    ) {
      nonBlackVisiblePixels += 1;
    }
  }

  return { nonBlackVisiblePixels, visiblePixels };
}

async function textRegionSummary(
  filePath: string,
  region: { left: number; top: number; width: number; height: number },
) {
  const image = sharp(filePath).extract(region).ensureAlpha();
  const { data, info } = await image
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stats = await image.stats();
  const wordmarkColor = rgb(BRAND_GEOMETRY.colors.cream);
  const lime = rgb(BRAND_GEOMETRY.colors.lime);
  let wordmarkPixels = 0;
  let limePixels = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset + 3] === 0) continue;
      const pixelRgb = Array.from(data.subarray(offset, offset + 3));
      if (pixelRgb.join() === wordmarkColor.join()) {
        wordmarkPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (pixelRgb.join() === lime.join()) limePixels += 1;
    }
  }

  return {
    alphaMaximum: stats.channels[3].max,
    bounds:
      maxX < 0
        ? null
        : { width: maxX - minX + 1, height: maxY - minY + 1 },
    wordmarkPixels,
    limePixels,
  };
}

async function expectAssetContracts(assetDirectory: string) {
  for (const [fileName, dimensions] of Object.entries(expectedDimensions)) {
    const filePath = path.join(assetDirectory, fileName);
    expect(pngDimensions(filePath)).toEqual(dimensions);
    await expect(sharp(filePath).metadata()).resolves.toMatchObject({
      format: 'png',
      ...dimensions,
    });

    const summary = await contentSummary(filePath);
    expect(summary.alphaMaximum).toBe(255);
    expect(summary.contentPixels).toBeGreaterThan(
      minimumContentPixels[fileName as keyof typeof minimumContentPixels],
    );
  }

  for (const fileName of [
    'icon.png',
    'android-icon-foreground.png',
    'logo-mark.png',
    'splash-icon.png',
    'logo.png',
    'wordmark.png',
    'favicon.png',
  ]) {
    await expect(
      countOpaqueRgb(
        path.join(assetDirectory, fileName),
        rgb(BRAND_GEOMETRY.colors.lime),
      ),
    ).resolves.toBeGreaterThan(50);
  }

  const monochrome = await monochromeSummary(
    path.join(assetDirectory, 'android-icon-monochrome.png'),
  );
  expect(monochrome.visiblePixels).toBeGreaterThan(5_000);
  expect(monochrome.nonBlackVisiblePixels).toBe(0);

  for (const [fileName, contract] of Object.entries(textRegionContracts)) {
    const summary = await textRegionSummary(
      path.join(assetDirectory, fileName),
      contract.region,
    );
    expect(summary.alphaMaximum).toBe(255);
    expect(summary.limePixels).toBe(0);
    expect(summary.wordmarkPixels).toBeGreaterThan(1_000);
    expect(summary.bounds).not.toBeNull();
    expect(summary.bounds!.width).toBeGreaterThan(contract.minimumWidth);
    expect(summary.bounds!.height).toBeGreaterThan(contract.minimumHeight);
  }
}

async function expectSafeRasterEdges(assetDirectory: string) {
  for (const fileName of [
    'android-icon-foreground.png',
    'android-icon-monochrome.png',
    'logo-mark.png',
    'logo.png',
    'wordmark.png',
  ]) {
    const edge = await outerEdgePixels(path.join(assetDirectory, fileName));
    expect(edge.every((pixel) => pixel[3] === 0)).toBe(true);
  }

  for (const [fileName, background] of [
    ['icon.png', BRAND_GEOMETRY.colors.charcoal],
    ['splash-icon.png', BRAND_GEOMETRY.colors.cream],
    ['favicon.png', BRAND_GEOMETRY.colors.charcoal],
  ] as const) {
    const backgroundPixel = [...rgb(background), 255];
    const edge = await outerEdgePixels(path.join(assetDirectory, fileName));
    expect(edge.every((pixel) => pixel.join() === backgroundPixel.join())).toBe(
      true,
    );
  }
}

const validMantleGeometry = {
  viewBox: '0 0 124 80',
  wordmark: 'Mantle',
  colors: {
    lime: '#B9FF3D',
    supportingLime: '#7FAF1C',
    charcoal: '#111411',
    cream: '#F4F5F1',
  },
  mark: {
    paths: [
      'M13 49C28 49 31 27 45 27C56 27 60 42 70 42',
      'M53 48C63 58 76 57 84 44C93 30 99 25 111 25',
    ],
    strokeWidth: 12,
    nodes: [
      { cx: 13, cy: 49, r: 6 },
      { cx: 111, cy: 25, r: 6 },
    ],
  },
};

describe('Mantle brand geometry contract', () => {
  it('defines the approved canvas, colors, and wordmark capitalization', () => {
    expect(BRAND_GEOMETRY.viewBox).toBe('0 0 124 80');
    expect(BRAND_GEOMETRY.colors).toEqual({
      lime: '#B9FF3D',
      supportingLime: '#7FAF1C',
      charcoal: '#111411',
      cream: '#F4F5F1',
    });
    expect(BRAND_WORDMARK).toBe('Mantle');
    expect(BRAND_LOCKUP_MARK_ASPECT_RATIO).toBe(1.55);
    expect(BRAND_LOCKUP_MARK_RENDER_VIEW_BOX).toBe('0 0 124 80');
  });

  it('matches the approved two-ribbon silhouette and two endpoint nodes', () => {
    expect(BRAND_GEOMETRY.mark).toEqual({
      paths: [
        'M13 49C28 49 31 27 45 27C56 27 60 42 70 42',
        'M53 48C63 58 76 57 84 44C93 30 99 25 111 25',
      ],
      strokeWidth: 12,
      nodes: [
        { cx: 13, cy: 49, r: 6 },
        { cx: 111, cy: 25, r: 6 },
      ],
    });
    expect(BRAND_GEOMETRY.mark.paths).toHaveLength(2);
    expect(new Set(BRAND_GEOMETRY.mark.paths).size).toBe(2);
    expect(BRAND_GEOMETRY.mark.nodes).toHaveLength(2);
    expect(
      new Set(BRAND_GEOMETRY.mark.nodes.map((node) => `${node.cx}-${node.cy}`))
        .size,
    ).toBe(2);
    for (const node of BRAND_GEOMETRY.mark.nodes) {
      expect(node.r).toBe(BRAND_GEOMETRY.mark.strokeWidth / 2);
    }
    expect(BRAND_GEOMETRY.mark).not.toHaveProperty('primaryPath');
    expect(BRAND_GEOMETRY.mark).not.toHaveProperty('accentPath');
  });

  it('frames every node with visible breathing room without changing canonical geometry', () => {
    const [x, y, width, height] = BRAND_GENERAL_MARK_RENDER_VIEW_BOX.split(
      ' ',
    ).map(Number);

    expect(BRAND_GEOMETRY.viewBox).toBe('0 0 124 80');
    for (const node of BRAND_GEOMETRY.mark.nodes) {
      expect(node.cx - node.r).toBeGreaterThan(x);
      expect(node.cx + node.r).toBeLessThan(x + width);
      expect(node.cy - node.r).toBeGreaterThan(y);
      expect(node.cy + node.r).toBeLessThan(y + height);
    }
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
      { ...validMantleGeometry.mark, paths: [] },
      { ...validMantleGeometry.mark, paths: [validMantleGeometry.mark.paths[0]] },
      { ...validMantleGeometry.mark, paths: ['', validMantleGeometry.mark.paths[1]] },
      { ...validMantleGeometry.mark, paths: [validMantleGeometry.mark.paths[0], ''] },
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
    expect(generator).toContain('BRAND_GENERAL_MARK_RENDER_VIEW_BOX');
    expect(generator).toContain('BRAND_ADAPTIVE_ICON_RENDER_VIEW_BOX');
    expect(BRAND_GENERAL_MARK_RENDER_VIEW_BOX).toBe('-18 -40 160 160');
    expect(BRAND_ADAPTIVE_ICON_RENDER_VIEW_BOX).toBe('-63 -85 250 250');
    for (const duplicatedLiteral of [
      '#B9FF3D',
      '#111411',
      '#7FAF1C',
      '#F4F5F1',
      'M13 49C28 49',
      'M53 48C63 58',
    ]) {
      expect(generator).not.toContain(duplicatedLiteral);
    }
  });

  it('renders the wordmark with Sharp and the bundled Sora fontfile', () => {
    const generator = fs.readFileSync(generatorPath, 'utf8');

    expect(generator).toContain('fontfile: brandFontPath');
    expect(generator).toContain(
      "new URL('../node_modules/@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf', import.meta.url)",
    );
    expect(generator).toContain('.composite([');
    expect(generator).toContain(
      '<g transform="translate(18 20) scale(2.15)">',
    );
    expect(generator).not.toContain('@font-face');
    expect(generator).not.toContain('data:font');
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

  it('rejects a monochrome raster containing any visible non-black pixel', async () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'brand-monochrome-'),
    );
    const fixturePath = path.join(fixtureDirectory, 'mixed.png');

    try {
      await sharp(
        Buffer.from([
          0, 0, 0, 255,
          185, 255, 61, 255,
        ]),
        { raw: { width: 2, height: 1, channels: 4 } },
      )
        .png()
        .toFile(fixturePath);

      await expect(monochromeSummary(fixturePath)).resolves.toEqual({
        visiblePixels: 2,
        nonBlackVisiblePixels: 1,
      });
    } finally {
      fs.rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it('generates all eight PNGs at approved dimensions and with visible brand content in an isolated directory', async () => {
    const outputDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'brand-assets-'),
    );
    try {
      execFileSync(
        process.execPath,
        [generatorPath, '--output-dir', outputDirectory],
        { cwd: projectRoot, stdio: 'pipe' },
      );

      expect(fs.readdirSync(outputDirectory).sort()).toEqual(
        Object.keys(expectedDimensions).sort(),
      );
      await expectAssetContracts(outputDirectory);
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it('keeps the checked-in eight-file raster inventory semantically valid', async () => {
    await expectAssetContracts(committedAssetDirectory);
    await expectSafeRasterEdges(committedAssetDirectory);
  });

  it('keeps generated foreground geometry away from every raster edge', async () => {
    const outputDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'brand-edges-'),
    );
    try {
      execFileSync(
        process.execPath,
        [generatorPath, '--output-dir', outputDirectory],
        { cwd: projectRoot, stdio: 'pipe' },
      );
      await expectSafeRasterEdges(outputDirectory);
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it('keeps every adaptive foreground pixel inside the circular Android safe zone', async () => {
    const outputDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'brand-adaptive-safe-zone-'),
    );
    try {
      execFileSync(
        process.execPath,
        [generatorPath, '--output-dir', outputDirectory],
        { cwd: projectRoot, stdio: 'pipe' },
      );

      const safeZoneRadius = (432 * 33) / 108;
      const antialiasMargin = 4;
      for (const fileName of [
        'android-icon-foreground.png',
        'android-icon-monochrome.png',
      ]) {
        const summary = await rasterGeometrySummary(
          path.join(outputDirectory, fileName),
          432,
        );
        expect(summary.maxRadialDistance).toBeLessThanOrEqual(
          safeZoneRadius - antialiasMargin,
        );
        expect(summary.bounds.width).toBeGreaterThan(180);
        expect(summary.leftNodePixels).toBeGreaterThan(100);
        expect(summary.rightNodePixels).toBeGreaterThan(100);
      }
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });

  it.each([24, 32, 64])(
    'keeps a fully transparent boundary and visible nodes when independently rasterized at %d px',
    async (size) => {
      const summary = await rasterGeometrySummary(
        path.join(committedAssetDirectory, 'logo-mark.png'),
        size,
        1,
      );
      const meaningful = await rasterGeometrySummary(
        path.join(committedAssetDirectory, 'logo-mark.png'),
        size,
        32,
      );

      expect(summary.edgeIsTransparent).toBe(true);
      expect(meaningful.bounds.left).toBeGreaterThanOrEqual(1);
      expect(meaningful.bounds.top).toBeGreaterThanOrEqual(1);
      expect(meaningful.bounds.right).toBeGreaterThanOrEqual(1);
      expect(meaningful.bounds.bottom).toBeGreaterThanOrEqual(1);
      expect(meaningful.bounds.width).toBeGreaterThan(size * 0.68);
      expect(meaningful.bounds.height).toBeGreaterThan(size * 0.26);
      expect(meaningful.leftNodePixels).toBeGreaterThan(1);
      expect(meaningful.rightNodePixels).toBeGreaterThan(1);
    },
  );
});
