import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const easConfig = JSON.parse(
  await readFile(new URL('../eas.json', import.meta.url), 'utf8'),
);

test('staging is an internal release-like Android APK build', () => {
  assert.deepEqual(easConfig.build.staging, {
    environment: 'preview',
    developmentClient: false,
    distribution: 'internal',
    channel: 'staging',
    env: {
      APP_VARIANT: 'staging',
    },
    android: {
      buildType: 'apk',
    },
  });
});

test('development remains a development-client APK profile', () => {
  assert.equal(easConfig.build.development.developmentClient, true);
  assert.equal(easConfig.build.development.distribution, 'internal');
  assert.equal(easConfig.build.development.channel, 'development');
  assert.equal(easConfig.build.development.android.buildType, 'apk');
});

test('preview and production profiles retain their existing behavior', () => {
  assert.deepEqual(easConfig.build.preview, {
    environment: 'preview',
    distribution: 'internal',
    channel: 'preview',
    env: {
      APP_VARIANT: 'staging',
    },
    android: {
      buildType: 'apk',
    },
  });
  assert.deepEqual(easConfig.build.production, {
    channel: 'production',
    autoIncrement: true,
  });
});
