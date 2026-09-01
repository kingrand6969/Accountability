import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html']);
const staleProperName = /AccountAbility|ACCOUNTABILITY|Accountability App/g;
const splitJsxProperName = /Account\s*<Text\b[^>]*>\s*Ability\s*<\/Text>/gs;
const historicalAttribution = 'OpenAI generated for AccountAbility';
const historicalAttributionLines = new Map([
  [
    'src/progress/workoutPhotoLibrary.test.ts',
    `    expect(all.every((photo) => photo.licenseSource === '${historicalAttribution}')).toBe(true);`,
  ],
  [
    'src/progress/workoutPhotoLibrary.ts',
    `const LICENSE_SOURCE = '${historicalAttribution}';`,
  ],
]);

function publicCopyContents(relativePath, contents) {
  const allowedLine = historicalAttributionLines.get(relativePath);
  if (!allowedLine) {
    return contents;
  }

  const lineBreak = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  const matchingLines = lines
    .map((line, index) => line === allowedLine ? index : -1)
    .filter((index) => index >= 0);

  if (matchingLines.length !== 1) {
    return contents;
  }

  lines[matchingLines[0]] = '';
  return lines.join(lineBreak);
}

function containsStaleProperName(contents) {
  staleProperName.lastIndex = 0;
  splitJsxProperName.lastIndex = 0;
  return staleProperName.test(contents) || splitJsxProperName.test(contents);
}

async function collectFiles(relativeDirectory) {
  const directory = path.join(projectRoot, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);

      if (entry.isDirectory()) {
        return collectFiles(relativePath);
      }

      return sourceExtensions.has(path.extname(entry.name)) ? [relativePath] : [];
    }),
  );

  return files.flat();
}

test('active mobile surfaces contain no stale AccountAbility proper name', async () => {
  const sourceFiles = await Promise.all(['src'].map(collectFiles));
  const files = [...sourceFiles.flat(), 'app.json', 'app.config.js'];
  const staleFiles = [];

  for (const relativePath of files) {
    const contents = await readFile(path.join(projectRoot, relativePath), 'utf8');
    const normalizedPath = relativePath.split(path.sep).join('/');
    if (containsStaleProperName(publicCopyContents(normalizedPath, contents))) {
      staleFiles.push(normalizedPath);
    }
  }

  staleFiles.sort();
  assert.deepEqual(
    staleFiles,
    [],
    `Stale AccountAbility proper name found in:\n${staleFiles.join('\n')}`,
  );
});

test('historical attribution exemption is exact and does not hide other stale proper names', () => {
  const attributionPath = 'src/progress/workoutPhotoLibrary.ts';
  const declarationLine = historicalAttributionLines.get(attributionPath);
  assert.equal(typeof declarationLine, 'string');

  assert.equal(publicCopyContents(attributionPath, declarationLine), '');
  assert.equal(
    containsStaleProperName(
      publicCopyContents(attributionPath, `${declarationLine}\nAccountAbility`),
    ),
    true,
  );
  assert.equal(
    containsStaleProperName(
      publicCopyContents(attributionPath, `${declarationLine}\n${declarationLine}`),
    ),
    true,
  );
  assert.equal(
    containsStaleProperName(publicCopyContents('src/example.ts', historicalAttribution)),
    true,
  );
  assert.equal(
    containsStaleProperName(
      publicCopyContents(attributionPath, `${declarationLine} AccountAbility member`),
    ),
    true,
  );
});
