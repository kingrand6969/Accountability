import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html']);
const staleProperName = /AccountAbility|ACCOUNTABILITY|Accountability App/g;

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
    staleProperName.lastIndex = 0;
    if (staleProperName.test(contents)) {
      staleFiles.push(relativePath.split(path.sep).join('/'));
    }
  }

  staleFiles.sort();
  assert.deepEqual(
    staleFiles,
    [],
    `Stale AccountAbility proper name found in:\n${staleFiles.join('\n')}`,
  );
});
