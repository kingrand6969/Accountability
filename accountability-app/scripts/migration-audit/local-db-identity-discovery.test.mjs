import assert from 'node:assert/strict';
import test from 'node:test';

import { createDbIdentityDiscovery, parseDbIdentityArgs } from './local-db-identity-discovery.mjs';

const ID = 'a3b32ba43af8cff550d1e23b41cdd8c69f40c7faf5da1e4697c41780e228cf57';
const PSQL = '/nix/store/d43fya852vmrp5hws2lrw47ccq1ngakz-postgresql-17.6/bin/psql';

test('database identity discovery verifies fixed psql then uses only local Unix socket read-only SQL', () => {
  const calls = [];
  const resultRow = {
    server_version_num: '170006', current_database: 'postgres', database_oid: '5',
    system_identifier: '1234567890', ledger_versions: Array.from({ length: 96 }, (_, i) => String(i + 1).padStart(4, '0')),
  };
  const discover = createDbIdentityDiscovery({
    verifyDockerExecutable: () => true,
    runDocker: ({ args }) => {
      calls.push(args);
      if (calls.length === 1) return { status: 0, stdout: '', stderr: '' };
      if (calls.length === 2 || calls.length === 3) return { status: 0, stdout: '', stderr: '' };
      if (calls.length === 4) return { status: 0, stdout: `${'a'.repeat(64)}  ${PSQL}\n`, stderr: '' };
      if (calls.length === 5) return { status: 0, stdout: 'psql (PostgreSQL) 17.6\n', stderr: '' };
      return { status: 0, stdout: `${JSON.stringify(resultRow)}\n`, stderr: '' };
    },
  });
  const profile = discover();
  assert.equal(profile.trust, 'UNTRUSTED_DISCOVERY');
  assert.equal(profile.psql.absolutePath, PSQL);
  assert.equal(profile.psql.executableSha256, 'a'.repeat(64));
  assert.equal(profile.database.systemIdentifier, '1234567890');
  assert.deepEqual(calls[0], ['exec', ID, '/usr/bin/test', '-f', PSQL]);
  assert.deepEqual(calls[1], ['exec', ID, '/usr/bin/test', '-x', PSQL]);
  assert.deepEqual(calls[2], ['exec', ID, '/usr/bin/test', '!', '-L', PSQL]);
  assert.deepEqual(calls[3], ['exec', ID, '/usr/bin/sha256sum', '--', PSQL]);
  assert.deepEqual(calls[4], ['exec', ID, PSQL, '--version']);
  assert.deepEqual(calls[5].slice(0, 8), ['exec', '-i', ID, PSQL, '-h', '/var/run/postgresql', '-U', 'postgres']);
  assert.equal(calls[5].includes('-c'), true);
  assert.match(calls[5].at(-1), /^begin read only;/u);
  assert.match(calls[5].at(-1), /rollback;$/u);
  assert.equal(calls.flat().some((arg) => /supabase\.co|https?:|--linked/u.test(arg)), false);
});

test('identity discovery requires exact 0001 through 0096 ledger and fixed CLI command', () => {
  assert.deepEqual(parseDbIdentityArgs(['discover-db-identity']), { command: 'discover-db-identity' });
  assert.throws(() => parseDbIdentityArgs(['collect']), /Usage:/u);
  let call = 0;
  assert.throws(() => createDbIdentityDiscovery({
    verifyDockerExecutable: () => true,
    runDocker: () => {
      call += 1;
      if (call < 6) return { status: 0, stdout: call === 4 ? `${'a'.repeat(64)}  ${PSQL}\n` : call === 5 ? 'psql (PostgreSQL) 17.6\n' : '', stderr: '' };
      return { status: 0, stdout: JSON.stringify({
        server_version_num: '170006', current_database: 'postgres', database_oid: '5',
        system_identifier: '1', ledger_versions: ['0001'],
      }), stderr: '' };
    },
  })(), /exactly 0001 through 0096/u);
});

test('identity discovery runs nothing when pinned Docker verification fails', () => {
  let calls = 0;
  assert.throws(() => createDbIdentityDiscovery({
    verifyDockerExecutable: () => false,
    runDocker: () => { calls += 1; return {}; },
  })(), /Docker executable hash mismatch/u);
  assert.equal(calls, 0);
});
