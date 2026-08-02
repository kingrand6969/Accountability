import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLocalCliArgs } from './local-canonical-cli.mjs';

test('fixed local CLI accepts only collect plus approved pin path, digest, and evidence path', () => {
  const target = 'C:\\Users\\KinGrand\\New folder\\accountability-app\\.tmp\\local-canonical-evidence\\run-1';
  const pin = 'C:\\review\\approved-local-pin.json';
  const digest = 'a'.repeat(64);
  assert.deepEqual(parseLocalCliArgs(['collect', pin, digest, target]), { command: 'collect', pinPath: pin, approvedDigest: digest, outputDir: target });
  for (const args of [[], ['discover'], ['collect'], ['collect', pin, digest, target, 'extra'], ['collect', '.tmp/pin', digest, target], ['collect', pin, 'bad', target], ['collect', pin, digest, '.tmp/out'], ['--linked', target]]) {
    assert.throws(() => parseLocalCliArgs(args), /Usage:/u);
  }
});
