import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const configure = require('../app.config.js');
const base = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;
const originalVariant = process.env.APP_VARIANT;

function resolve(variant) {
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  return configure({ config: structuredClone(base) });
}

function assertIdentity(config, expected) {
  assert.equal(config.name, expected.name);
  assert.equal(config.scheme, expected.scheme);
  assert.equal(config.android.package, expected.id);
  assert.equal(config.ios.bundleIdentifier, expected.id);
  assert.equal(config.extra.appVariant, expected.appVariant);
  assert.equal(config.extra.eas.projectId, 'f91c0791-4a6e-4080-88fd-5cc9a4e720bf');
}

test.after(() => {
  if (originalVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = originalVariant;
});

for (const variant of [undefined, 'staging']) {
  test(`${variant ?? 'missing'} APP_VARIANT resolves the complete staging identity`, () => {
    assertIdentity(resolve(variant), {
      name: 'Mantle Staging',
      scheme: 'accountabilityapp-staging',
      id: 'com.awldesk.accountability.staging',
      appVariant: 'preview',
    });
  });
}

test('explicit production APP_VARIANT resolves the complete production identity', () => {
  assertIdentity(resolve('production'), {
    name: 'Mantle',
    scheme: 'accountabilityapp',
    id: 'com.awldesk.accountability',
    appVariant: 'production',
  });
});

test('mistyped non-empty APP_VARIANT throws before resolving an identity', () => {
  assert.throws(
    () => resolve('stagng'),
    /APP_VARIANT must be either "staging" or "production"/,
  );
});
