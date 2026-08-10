import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const easConfig = JSON.parse(
  await readFile(new URL('../eas.json', import.meta.url), 'utf8'),
);

test('preview is the only internal release-like staging Android APK build', () => {
  assert.deepEqual(easConfig.build.preview, {
    environment: 'preview',
    developmentClient: false,
    distribution: 'internal',
    channel: 'preview',
    env: {
      APP_VARIANT: 'staging',
    },
    android: {
      buildType: 'apk',
    },
  });
  assert.equal(easConfig.build.staging, undefined);
});

test('development remains a development-client APK profile', () => {
  assert.equal(easConfig.build.development.developmentClient, true);
  assert.equal(easConfig.build.development.distribution, 'internal');
  assert.equal(easConfig.build.development.channel, 'development');
  assert.equal(easConfig.build.development.android.buildType, 'apk');
});

test('production profile retains its existing behavior', () => {
  assert.deepEqual(easConfig.build.production, {
    channel: 'production',
    autoIncrement: true,
  });
});
