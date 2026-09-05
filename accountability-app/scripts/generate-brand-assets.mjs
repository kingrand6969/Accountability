import { Buffer } from 'node:buffer';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

const MONOCHROME_FOREGROUND = '#000000';

function sourceUrl(sourceReference) {
  if (sourceReference instanceof URL) return sourceReference;
  return isAbsolute(sourceReference)
    ? pathToFileURL(sourceReference)
    : new URL(sourceReference, import.meta.url);
}

async function readBrandSource(sourceReference) {
  const resolvedSource = sourceUrl(sourceReference);
  try {
    return await readFile(resolvedSource, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read brand geometry from ${fileURLToPath(resolvedSource)}`,
      { cause: error },
    );
  }
}

export async function loadBrandGeometry(sourceReference) {
  const resolvedSource = sourceUrl(sourceReference);
  const source = await readBrandSource(resolvedSource);

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

export async function loadBrandRenderViewBoxes(sourceReference) {
  const resolvedSource = sourceUrl(sourceReference);
  const source = await readBrandSource(resolvedSource);
  const load = (constantName) => {
    const match = source.match(
      new RegExp(`export const ${constantName} = '([^']+)'`),
    );
    if (!match) {
      throw new Error(
        `Brand mark render viewBox ${constantName} not found in ${fileURLToPath(resolvedSource)}`,
      );
    }
    return match[1];
  };
  return {
    adaptive: load('BRAND_ADAPTIVE_ICON_RENDER_VIEW_BOX'),
    general: load('BRAND_GENERAL_MARK_RENDER_VIEW_BOX'),
  };
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
    !Array.isArray(geometry?.mark?.paths) ||
    geometry.mark.paths.length !== 2 ||
    !geometry.mark.paths.every(
      (path) => typeof path === 'string' && path.length > 0,
    ) ||
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
  const paths = mark.paths
    .map(
      (path) =>
        `<path d="${path}" fill="none" stroke="${fill}" stroke-width="${mark.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  const nodes = mark.nodes
    .map(
      ({ cx, cy, r }) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`,
    )
    .join('');
  return `${paths}${nodes}`;
}

function parseViewBox(viewBox) {
  const [x, y, width, height, ...rest] = viewBox.split(/\s+/).map(Number);
  if (
    rest.length > 0 ||
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Invalid brand mark render viewBox');
  }
  return { x, y, width, height };
}

function createMarkup(geometry, renderViewBoxes) {
  const { colors } = geometry;
  const generalFrame = parseViewBox(renderViewBoxes.general);
  parseViewBox(renderViewBoxes.adaptive);

  function mark(fill = colors.lime) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${renderViewBoxes.general}">
      ${markBody(geometry, fill)}
    </svg>`;
  }

  function adaptiveMark(fill = colors.lime) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${renderViewBoxes.adaptive}">
      ${markBody(geometry, fill)}
    </svg>`;
  }

  function appIcon(fill = colors.lime, background = colors.charcoal) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${renderViewBoxes.general}">
      <rect x="${generalFrame.x}" y="${generalFrame.y}" width="${generalFrame.width}" height="${generalFrame.height}" fill="${background}"/>
      ${markBody(geometry, fill)}
    </svg>`;
  }

  const wordmarkMark = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="300" viewBox="0 0 1400 300">
    <g transform="translate(18 20) scale(2.15)">${markBody(geometry, colors.lime)}</g>
  </svg>`;

  return { adaptiveMark, appIcon, mark, wordmarkMark };
}

async function renderWordmark(markup, brandWordmark, color, brandFontPath) {
  const { data: textLayer, info: textInfo } = await sharp({
    text: {
      text: `<span foreground="${color}" letter_spacing="-4096">${brandWordmark}</span>`,
      font: 'Sora 126',
      fontfile: brandFontPath,
      dpi: 72,
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });

  return sharp(Buffer.from(markup))
    .composite([
      {
        input: textLayer,
        left: 306,
        top: 193 - textInfo.height,
      },
    ])
    .png()
    .toBuffer();
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
  const [loadedGeometry, renderViewBoxes] = await Promise.all([
    loadBrandGeometry('../src/ui/brandGeometry.ts'),
    loadBrandRenderViewBoxes('../src/ui/brandGeometry.ts'),
  ]);
  const geometry = validateGeometry(loadedGeometry);
  const brandFontPath = fileURLToPath(
    new URL('../node_modules/@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf', import.meta.url),
  );
  const { adaptiveMark, appIcon, mark, wordmarkMark } = createMarkup(
    geometry,
    renderViewBoxes,
  );
  const wordmark = await renderWordmark(
    wordmarkMark,
    geometry.wordmark,
    geometry.colors.cream,
    brandFontPath,
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
        sharp(Buffer.from(adaptiveMark(geometry.colors.lime)))
          .resize(432, 432)
          .png(),
    ],
    [
      'android-icon-monochrome.png',
      () =>
        sharp(Buffer.from(adaptiveMark(MONOCHROME_FOREGROUND)))
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
      () => sharp(wordmark).resize(900, 193).png(),
    ],
    [
      'wordmark.png',
      () => sharp(wordmark).resize(600, 129).png(),
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
