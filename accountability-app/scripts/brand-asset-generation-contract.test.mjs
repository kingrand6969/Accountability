import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { generateBrandAssets } from './generate-brand-assets.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const committedAssetDirectory = path.join(projectRoot, 'assets/images');
const assetNames = [
  'android-icon-foreground.png',
  'android-icon-monochrome.png',
  'favicon.png',
  'icon.png',
  'logo-mark.png',
  'logo.png',
  'splash-icon.png',
  'wordmark.png',
];

test('checked-in Mantle rasters exactly match the canonical generator', async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'mantle-brand-assets-'));

  try {
    await generateBrandAssets(outputDirectory);
    assert.deepEqual((await readdir(outputDirectory)).sort(), assetNames);

    for (const assetName of assetNames) {
      const [committed, generated] = await Promise.all([
        readFile(path.join(committedAssetDirectory, assetName)),
        readFile(path.join(outputDirectory, assetName)),
      ]);

      // Sharp is pinned and the wordmark uses a repository-bundled Sora fontfile,
      // so byte equality is intentional for both geometry-only and text rasters.
      assert.ok(
        committed.equals(generated),
        `${assetName} has drifted; run the canonical generator and review the asset change`,
      );
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test('the deterministic asset contract is available as a focused CI command', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
  );

  assert.equal(
    packageJson.scripts?.['test:brand-assets'],
    'node --test scripts/brand-asset-generation-contract.test.mjs',
  );
  assert.equal(
    packageJson.scripts?.['test:brand'],
    'npm run test:brand-public-copy && npm run test:brand-assets',
  );
});
