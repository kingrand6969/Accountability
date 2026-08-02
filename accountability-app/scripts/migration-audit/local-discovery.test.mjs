import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalDiscovery, parseDiscoveryArgs } from './local-discovery.mjs';

const container = {
  Id: 'a'.repeat(64),
  Image: `sha256:${'b'.repeat(64)}`,
  Name: '/supabase_db_tmp-ledger-replay-0079',
  Config: {
    Image: 'public.ecr.aws/supabase/postgres:15.8.1.060',
    Labels: { z: 'last', a: 'first' },
    Entrypoint: ['docker-entrypoint.sh'],
    Cmd: ['postgres'],
  },
  Mounts: [{ Type: 'volume', Name: 'db-data', Source: '/host/data', Destination: '/var/lib/postgresql/data', Mode: 'z', RW: true, Propagation: '' }],
  NetworkSettings: { Networks: { default: { NetworkID: 'c'.repeat(64), EndpointID: 'd'.repeat(64), Gateway: '172.18.0.1', IPAddress: '172.18.0.2', IPPrefixLen: 16, MacAddress: '00:00:00:00:00:01', Aliases: ['db'] } } },
  State: { Running: false },
};
const image = [{ Id: `sha256:${'b'.repeat(64)}`, RepoDigests: ['repo/postgres@sha256:' + 'e'.repeat(64)] }];

test('read-only discovery uses only inspect commands and emits deterministic untrusted profile', () => {
  const calls = [];
  const discover = createLocalDiscovery({
    verifyDockerExecutable: () => true,
    runDocker: ({ args }) => {
      calls.push(args);
      if (args[0] === 'container') return { status: 0, stdout: JSON.stringify([container]), stderr: '' };
      return { status: 0, stdout: JSON.stringify(image), stderr: '' };
    },
  });
  const profile = discover();
  assert.deepEqual(calls, [
    ['container', 'inspect', 'supabase_db_tmp-ledger-replay-0079'],
    ['image', 'inspect', `sha256:${'b'.repeat(64)}`],
  ]);
  assert.equal(profile.trust, 'UNTRUSTED_DISCOVERY');
  assert.equal(profile.container.running, false);
  assert.equal(profile.container.id, 'a'.repeat(64));
  assert.deepEqual(Object.keys(profile.container.labels), ['a', 'z']);
  assert.deepEqual(profile.image.repoDigests, image[0].RepoDigests);
  assert.equal(profile.psql.absolutePathCandidate, '/usr/bin/psql');
  assert.match(profile.container.entrypointCommandSha256, /^[0-9a-f]{64}$/u);
  assert.equal(Object.hasOwn(profile.container, 'entrypoint'), false);
  assert.equal(Object.hasOwn(profile.container, 'command'), false);
  assert.equal(Object.hasOwn(profile, 'collector'), false);
});

test('discovery fails closed on wrong identity, malformed inspect data, or any extra CLI authority', () => {
  const wrong = structuredClone(container);
  wrong.Name = '/wrong';
  assert.throws(() => createLocalDiscovery({
    verifyDockerExecutable: () => true,
    runDocker: ({ args }) => ({ status: 0, stdout: JSON.stringify(args[0] === 'container' ? [wrong] : image), stderr: '' }),
  })(), /identity rejected/u);
  for (const args of [[], ['collect'], ['discover', 'extra'], ['--linked'], ['start']]) {
    assert.throws(() => parseDiscoveryArgs(args), /Usage:/u);
  }
  assert.deepEqual(parseDiscoveryArgs(['discover']), { command: 'discover' });
});

test('discovery never proceeds after Docker executable verification failure', () => {
  let calls = 0;
  assert.throws(() => createLocalDiscovery({
    verifyDockerExecutable: () => false,
    runDocker: () => { calls += 1; return {}; },
  })(), /Docker executable hash mismatch/u);
  assert.equal(calls, 0);
});
