import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.html',
  '.bat',
  '.md',
  '.sql',
]);
const staleProperName = /AccountAbility|ACCOUNTABILITY|Accountability App/g;
const splitJsxProperName = /Account\s*<Text\b[^>]*>\s*Ability\s*<\/Text>/gs;
const splitInlineProperName =
  /\bAccount\s*(?:<\/?(?:b|strong|span|em|i|small|mark|u|s)\b[^>]*>\s*)+\s*Ability\b/gis;
const historicalAttribution = 'OpenAI generated for AccountAbility';
const exactLegacyCopyLines = new Map([
  [
    'src/progress/workoutPhotoLibrary.test.ts',
    [
      `    expect(all.every((photo) => photo.licenseSource === '${historicalAttribution}')).toBe(true);`,
    ],
  ],
  [
    'src/progress/workoutPhotoLibrary.ts',
    [`const LICENSE_SOURCE = '${historicalAttribution}';`],
  ],
  [
    'supabase/migrations/0118_reconcile_mantle_public_share_descriptions.sql',
    [
      "  and description = 'Shared from AccountAbility';",
      "  and description = 'A progress update shared with permission from AccountAbility.';",
    ],
  ],
]);

function publicCopyContents(relativePath, contents) {
  const allowedLines = exactLegacyCopyLines.get(relativePath);
  if (!allowedLines) {
    return contents;
  }

  const lineBreak = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  for (const allowedLine of allowedLines) {
    const matchingLines = lines
      .map((line, index) => (line === allowedLine ? index : -1))
      .filter((index) => index >= 0);

    if (matchingLines.length !== 1) {
      continue;
    }

    lines[matchingLines[0]] = '';
  }
  return lines.join(lineBreak);
}

function containsStaleProperName(contents) {
  staleProperName.lastIndex = 0;
  splitJsxProperName.lastIndex = 0;
  splitInlineProperName.lastIndex = 0;
  return (
    staleProperName.test(contents) ||
    splitJsxProperName.test(contents) ||
    splitInlineProperName.test(contents)
  );
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

test('active public surfaces contain no stale AccountAbility proper name', async () => {
  const sourceFiles = await Promise.all(
    [
      'src',
      'admin',
      'admin-site/app',
      'admin-site/public',
      'share-site/app',
      'legal-web',
    ].map(collectFiles),
  );
  const migrationFiles = (await collectFiles('supabase/migrations')).filter(
    (relativePath) => {
      const migrationNumber = Number.parseInt(path.basename(relativePath), 10);
      return Number.isFinite(migrationNumber) && migrationNumber >= 117;
    },
  );
  const files = [
    ...sourceFiles.flat(),
    ...migrationFiles,
    'app.json',
    'app.config.js',
    'LAUNCH.md',
  ];
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
  const declarationLine = exactLegacyCopyLines.get(attributionPath)?.[0];
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

test('the Mantle reconciliation migration exempts only its two exact legacy predicates', () => {
  const migrationPath =
    'supabase/migrations/0118_reconcile_mantle_public_share_descriptions.sql';
  const legacyPredicates = exactLegacyCopyLines.get(migrationPath);
  assert.equal(legacyPredicates?.length, 2);

  assert.equal(
    containsStaleProperName(
      publicCopyContents(migrationPath, legacyPredicates.join('\n')),
    ),
    false,
  );
  assert.equal(
    containsStaleProperName(
      publicCopyContents(
        migrationPath,
        `${legacyPredicates.join('\n')}\n-- AccountAbility ships here`,
      ),
    ),
    true,
  );
  assert.equal(
    containsStaleProperName(
      publicCopyContents(
        migrationPath,
        `${legacyPredicates.join('\n')}\n${legacyPredicates[0]}`,
      ),
    ),
    true,
  );
});

test('split inline markup cannot hide a stale proper name', () => {
  assert.equal(containsStaleProperName('Account<b>Ability</b>'), true);

  for (const tag of ['strong', 'span', 'em', 'i', 'small', 'mark', 'u', 's']) {
    assert.equal(
      containsStaleProperName(`Account <${tag} class="wordmark-part">\n Ability</${tag}>`),
      true,
      `detects a stale proper name split by <${tag}>`,
    );
  }

  assert.equal(containsStaleProperName('Account <Text style={styles.brand}> Ability </Text>'), true);
  assert.equal(containsStaleProperName('Account<div>Ability</div>'), false);
});
