import { Buffer } from 'node:buffer';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

function sourceUrl(sourceReference) {
  if (sourceReference instanceof URL) return sourceReference;
  return isAbsolute(sourceReference)
    ? pathToFileURL(sourceReference)
    : new URL(sourceReference, import.meta.url);
}

export async function loadBrandGeometry(sourceReference) {
  const resolvedSource = sourceUrl(sourceReference);
  let source;
  try {
    source = await readFile(resolvedSource, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read brand geometry from ${fileURLToPath(resolvedSource)}`,
      { cause: error },
    );
  }

  const match = source.match(
    /parseBrandGeometry\(JSON\.parse\(String\.raw`([\s\S]*?)`\)\)/,
  );
  if (!match) {
    throw new Error(
      `Brand geometry JSON contract not found in ${fileURLToPath(resolvedSource)}`,
    );
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(
      `Brand geometry JSON contract is malformed in ${fileURLToPath(resolvedSource)}`,
      { cause: error },
    );
  }
}

function validateGeometry(geometry) {
  const isColor = (color) =>
    typeof color === 'string' && /^#[0-9A-F]{6}$/.test(color);
  const isFiniteNumber = (value) =>
    typeof value === 'number' && Number.isFinite(value);
  const isNode = (node) =>
    isFiniteNumber(node?.cx) &&
    node.cx >= 0 &&
    isFiniteNumber(node?.cy) &&
    node.cy >= 0 &&
    isFiniteNumber(node?.r) &&
    node.r > 0;

  if (
    typeof geometry?.viewBox !== 'string' ||
    typeof geometry?.wordmark !== 'string' ||
    !isColor(geometry?.colors?.lime) ||
    !isColor(geometry?.colors?.supportingLime) ||
    !isColor(geometry?.colors?.charcoal) ||
    !isColor(geometry?.colors?.cream) ||
    typeof geometry?.mark?.path !== 'string' ||
    geometry.mark.path.length === 0 ||
    !isFiniteNumber(geometry.mark.strokeWidth) ||
    geometry.mark.strokeWidth <= 0 ||
    !Array.isArray(geometry.mark.nodes) ||
    geometry.mark.nodes.length !== 2 ||
    !geometry.mark.nodes.every(isNode)
  ) {
    throw new Error('Invalid brand geometry');
  }
  return geometry;
}

function markBody({ mark }, fill) {
  const nodes = mark.nodes
    .map(
      ({ cx, cy, r }) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`,
    )
    .join('');
  return `<path d="${mark.path}" fill="none" stroke="${fill}" stroke-width="${mark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>${nodes}`;
}

function createMarkup(geometry, brandFontBase64) {
  const { colors, viewBox, wordmark: brandWordmark } = geometry;

  function mark(fill = colors.lime, background = 'transparent') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${viewBox}">
      <rect width="96" height="96" fill="${background}"/>
      ${markBody(geometry, fill)}
    </svg>`;
  }

  function appIcon(fill = colors.lime, background = colors.charcoal) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 96 96">
      <rect width="96" height="96" fill="${background}"/>
      ${markBody(geometry, fill)}
    </svg>`;
  }

  const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="300" viewBox="0 0 1400 300">
    <style>@font-face { font-family: MantleBrand; src: url('data:font/ttf;base64,${brandFontBase64}') format('truetype'); font-weight: 700; }</style>
    <g transform="translate(18 15) scale(2.72)">${markBody(geometry, colors.lime)}</g>
    <text x="306" y="193" font-family="MantleBrand" font-size="126" font-weight="700" letter-spacing="-4" fill="${colors.charcoal}">${brandWordmark}</text>
  </svg>`;

  return { appIcon, mark, wordmark };
}

async function writeAtomically(destination, render) {
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  try {
    await render(temporary);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function generateBrandAssets(outputDirectory) {
  const geometry = validateGeometry(
    await loadBrandGeometry('../src/ui/brandGeometry.ts'),
  );
  const brandFont = await readFile(
    new URL('../node_modules/@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf', import.meta.url),
  );
  const { appIcon, mark, wordmark } = createMarkup(
    geometry,
    brandFont.toString('base64'),
  );
  await mkdir(outputDirectory, { recursive: true });

  const assets = [
    [
      'icon.png',
      () =>
        sharp(
          Buffer.from(
            appIcon(geometry.colors.lime, geometry.colors.charcoal),
          ),
        ).png(),
    ],
    [
      'android-icon-foreground.png',
      () =>
        sharp(Buffer.from(mark(geometry.colors.lime))).resize(432, 432).png(),
    ],
    [
      'android-icon-monochrome.png',
      () =>
        sharp(Buffer.from(mark(geometry.colors.charcoal)))
          .resize(432, 432)
          .png(),
    ],
    [
      'logo-mark.png',
      () =>
        sharp(Buffer.from(mark(geometry.colors.lime))).resize(400, 400).png(),
    ],
    [
      'splash-icon.png',
      () =>
        sharp(Buffer.from(appIcon(geometry.colors.lime, geometry.colors.cream)))
          .resize(512, 512)
          .png(),
    ],
    [
      'logo.png',
      () => sharp(Buffer.from(wordmark)).resize(900, 193).png(),
    ],
    [
      'wordmark.png',
      () => sharp(Buffer.from(wordmark)).resize(600, 129).png(),
    ],
    [
      'favicon.png',
      () =>
        sharp(
          Buffer.from(
            appIcon(geometry.colors.lime, geometry.colors.charcoal),
          ),
        )
          .resize(64, 64)
          .png(),
    ],
  ];

  await Promise.all(
    assets.map(([fileName, pipeline]) => {
      const destination = resolve(outputDirectory, fileName);
      return writeAtomically(destination, (temporary) =>
        pipeline().toFile(temporary),
      );
    }),
  );
}

function outputDirectoryFromArguments(arguments_) {
  const outputIndex = arguments_.indexOf('--output-dir');
  if (outputIndex === -1) {
    return fileURLToPath(new URL('../assets/images/', import.meta.url));
  }
  if (!arguments_[outputIndex + 1]) {
    throw new Error('--output-dir requires a path');
  }
  return resolve(arguments_[outputIndex + 1]);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  await generateBrandAssets(outputDirectoryFromArguments(process.argv.slice(2)));
}
