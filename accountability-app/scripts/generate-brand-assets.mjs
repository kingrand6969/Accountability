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
  const isHead = (head) =>
    head &&
    ['cx', 'cy', 'r'].every(
      (key) => typeof head[key] === 'number' && Number.isFinite(head[key]),
    );
  const isColor = (color) =>
    typeof color === 'string' && /^#[0-9A-F]{6}$/.test(color);

  if (
    typeof geometry?.viewBox !== 'string' ||
    typeof geometry?.wordmark !== 'string' ||
    !isColor(geometry?.colors?.cobalt) ||
    !isColor(geometry?.colors?.navy) ||
    !isColor(geometry?.colors?.cream) ||
    geometry?.heads?.length !== 2 ||
    !geometry.heads.every(isHead) ||
    geometry?.ribbons?.length !== 2 ||
    !geometry.ribbons.every(
      (ribbon) => typeof ribbon === 'string' && ribbon.length > 0,
    )
  ) {
    throw new Error('Invalid brand geometry');
  }
  return geometry;
}

function markBody({ heads, ribbons }, fill) {
  return [
    ...heads.map(
      ({ cx, cy, r }) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`,
    ),
    ...ribbons.map((d) => `<path d="${d}" fill="${fill}"/>`),
  ].join('');
}

function createMarkup(geometry) {
  const { colors, viewBox, wordmark: brandWordmark } = geometry;

  function mark(fill = colors.cobalt, background = 'transparent') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${viewBox}">
      <rect width="96" height="88" fill="${background}"/>
      ${markBody(geometry, fill)}
    </svg>`;
  }

  function appIcon(fill = colors.cobalt, background = '#FFFFFC') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 96 96">
      <rect width="96" height="96" fill="${background}"/>
      <g transform="translate(0 4)">${markBody(geometry, fill)}</g>
    </svg>`;
  }

  const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="300" viewBox="0 0 1400 300">
    <g transform="translate(18 22) scale(2.72)">${markBody(geometry, colors.cobalt)}</g>
    <text x="306" y="193" font-family="Arial, Helvetica, sans-serif" font-size="126" font-weight="700" letter-spacing="-4" fill="${colors.navy}">${brandWordmark.slice(0, 7)}<tspan fill="${colors.cobalt}">${brandWordmark.slice(7)}</tspan></text>
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
  const { appIcon, mark, wordmark } = createMarkup(geometry);
  await mkdir(outputDirectory, { recursive: true });

  const assets = [
    ['icon.png', () => sharp(Buffer.from(appIcon())).png()],
    [
      'android-icon-foreground.png',
      () => sharp(Buffer.from(mark())).resize(432, 432).png(),
    ],
    [
      'android-icon-monochrome.png',
      () => sharp(Buffer.from(mark('#000000'))).resize(432, 432).png(),
    ],
    [
      'logo-mark.png',
      () => sharp(Buffer.from(mark())).resize(400, 400).png(),
    ],
    [
      'splash-icon.png',
      () =>
        sharp(Buffer.from(appIcon(geometry.colors.cobalt, geometry.colors.cream)))
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
      () => sharp(Buffer.from(appIcon())).resize(64, 64).png(),
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
