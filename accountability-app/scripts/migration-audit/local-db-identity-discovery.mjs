import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizedJson } from './core.mjs';

const CONTAINER_ID = 'a3b32ba43af8cff550d1e23b41cdd8c69f40c7faf5da1e4697c41780e228cf57';
const DOCKER = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const DOCKER_SHA256 = 'c11b843b727ea76e6c63b393bccb73d957b6fcc12ba871c8265699e3a12e933c';
const PSQL = '/nix/store/d43fya852vmrp5hws2lrw47ccq1ngakz-postgresql-17.6/bin/psql';
const SOCKET = '/var/run/postgresql';
const USAGE = 'Usage: node local-db-identity-discovery.mjs discover-db-identity';
const IDENTITY_SQL = `begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
select json_build_object(
  'server_version_num', current_setting('server_version_num'),
  'current_database', current_database(),
  'database_oid', (select oid::text from pg_database where datname = current_database()),
  'system_identifier', (select system_identifier::text from pg_control_system()),
  'ledger_versions', (select json_agg(version::text order by version::text) from supabase_migrations.schema_migrations)
)::text;
rollback;`;

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function verifyDocker() { return sha256(readFileSync(DOCKER)) === DOCKER_SHA256; }
function run({ args }) {
  const result = spawnSync(DOCKER, args, { encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error };
}
function success(result, label) {
  if (!result || result.status !== 0 || result.error || Buffer.byteLength(result.stdout ?? '', 'utf8') > 1024 * 1024) {
    throw new Error(`${label} failed.`);
  }
  return result.stdout.trim();
}
function exactLedger(versions) {
  const expected = Array.from({ length: 96 }, (_, index) => String(index + 1).padStart(4, '0'));
  if (!Array.isArray(versions) || versions.length !== 96 || versions.some((version, index) => version !== expected[index])) {
    throw new Error('Database identity ledger must contain exactly 0001 through 0096.');
  }
  return versions;
}

export function parseDbIdentityArgs(args) {
  if (args.length !== 1 || args[0] !== 'discover-db-identity') throw new Error(USAGE);
  return { command: 'discover-db-identity' };
}

export function createDbIdentityDiscovery({ runDocker = run, verifyDockerExecutable = verifyDocker } = {}) {
  return function discover() {
    if (!verifyDockerExecutable()) throw new Error('Pinned Docker executable hash mismatch.');
    success(runDocker({ args: ['exec', CONTAINER_ID, '/usr/bin/test', '-f', PSQL] }), 'Pinned psql regular-file verification');
    success(runDocker({ args: ['exec', CONTAINER_ID, '/usr/bin/test', '-x', PSQL] }), 'Pinned psql executable verification');
    success(runDocker({ args: ['exec', CONTAINER_ID, '/usr/bin/test', '!', '-L', PSQL] }), 'Pinned psql symlink rejection');
    const hashLine = success(runDocker({ args: ['exec', CONTAINER_ID, '/usr/bin/sha256sum', '--', PSQL] }), 'psql SHA-256 discovery');
    const hashMatch = hashLine.match(/^([0-9a-f]{64})  (\/[a-zA-Z0-9._/+\-]+)$/u);
    const psqlSha256 = hashMatch?.[2] === PSQL ? hashMatch[1] : undefined;
    if (!psqlSha256) throw new Error('psql SHA-256 output rejected.');
    const psqlVersion = success(runDocker({ args: ['exec', CONTAINER_ID, PSQL, '--version'] }), 'psql version discovery');
    if (!/^psql \(PostgreSQL\) \d+(?:\.\d+)+$/u.test(psqlVersion)) throw new Error('psql version output rejected.');
    const raw = success(runDocker({ args: [
      'exec', '-i', CONTAINER_ID, PSQL, '-h', SOCKET, '-U', 'postgres', '-d', 'postgres',
      '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', IDENTITY_SQL,
    ] }), 'Database identity discovery');
    let row;
    try { row = JSON.parse(raw); } catch { throw new Error('Database identity JSON rejected.'); }
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        Object.keys(row).sort().join(',') !== 'current_database,database_oid,ledger_versions,server_version_num,system_identifier' ||
        !/^\d{6}$/.test(row.server_version_num) || row.current_database !== 'postgres' || !/^\d+$/.test(row.database_oid) ||
        !/^\d+$/.test(row.system_identifier)) throw new Error('Database identity fields rejected.');
    exactLedger(row.ledger_versions);
    return {
      formatVersion: 1, trust: 'UNTRUSTED_DISCOVERY',
      warning: 'Review and pin every identity field before trusted collection.',
      containerId: CONTAINER_ID,
      psql: { absolutePath: PSQL, version: psqlVersion, executableVerified: true, executableSha256: psqlSha256 },
      connection: { transport: 'local-unix-socket', socket: SOCKET, database: 'postgres', user: 'postgres' },
      database: {
        serverVersionNum: row.server_version_num, currentDatabase: row.current_database,
        databaseOid: row.database_oid, systemIdentifier: row.system_identifier,
        ledgerVersions: row.ledger_versions,
      },
    };
  };
}

async function main() {
  parseDbIdentityArgs(process.argv.slice(2));
  process.stdout.write(normalizedJson(createDbIdentityDiscovery()()));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
