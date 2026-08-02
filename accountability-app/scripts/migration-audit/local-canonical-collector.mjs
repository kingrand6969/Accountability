import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertReadOnlyCatalogSql, assertReadOnlyCurrentStateSql, normalizedJson } from './core.mjs';
import { validateQueryRows } from './one-process-executor.mjs';
import { restrictAndVerifyWindowsAcl } from './collect-readonly.mjs';

export const DISPOSABLE_CONTAINER = 'supabase_db_tmp-ledger-replay-0079';
const DOCKER_EXECUTABLE = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const DOCKER_SHA256 = 'c11b843b727ea76e6c63b393bccb73d957b6fcc12ba871c8265699e3a12e933c';
const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..');
export const LOCAL_EVIDENCE_ROOT = path.join(PROJECT_ROOT, '.tmp', 'local-canonical-evidence');

function cleanMigrationBytes(filename) {
  return execFileSync('git', ['show', `:accountability-app/supabase/migrations/${filename}`], {
    cwd: path.resolve(PROJECT_ROOT, '..'),
    encoding: 'buffer',
    maxBuffer: 2 * 1024 * 1024,
  });
}

export const LOCAL_QUERY_PLAN = Object.freeze([
  Object.freeze({ evidenceType: 'replay-ledger', filename: 'catalog-ledger-readonly.sql' }),
  Object.freeze({ evidenceType: 'catalog', filename: 'catalog-union-readonly.sql' }),
  Object.freeze({ evidenceType: 'deterministic-config', filename: 'deterministic-config-readonly.sql' }),
  Object.freeze({ evidenceType: 'current-state-flags', filename: 'current-state-flags-readonly.sql' }),
  Object.freeze({ evidenceType: 'cron-presence', filename: 'cron-presence-readonly.sql' }),
  Object.freeze({ evidenceType: 'cron-config', filename: 'cron-config-readonly.sql' }),
  Object.freeze({ evidenceType: 'auth-signup-trigger', filename: 'local-auth-signup-trigger-readonly.sql' }),
]);
const LOCAL_PLAN_SHA256 = 'a3dd6e05d9ff13a3752ef9d6d94a191e897b93d1f92edd0e209a4c485160f5d4';
const LOCAL_QUERY_SHA256 = Object.freeze({
  'local-auth-signup-trigger-readonly.sql': '0e5aa23be101209c5aa1c38a18d9a98dcbe862120209ea21620ff78f5fc012a8',
});

export function localPackageIdentity() {
  const collectorSha256 = sha256(readFileSync(fileURLToPath(import.meta.url)));
  const collectorTestSha256 = sha256(readFileSync(path.join(MODULE_DIRECTORY, 'local-canonical-collector.test.mjs')));
  const queryPlanSha256 = sha256(normalizedJson(LOCAL_QUERY_PLAN));
  const packageSha256 = sha256(normalizedJson(localPackageManifest()));
  return { collectorSha256, collectorTestSha256, queryPlanSha256, packageSha256 };
}

export function localPackageManifest() {
  const frozen = JSON.parse(readFileSync(path.join(MODULE_DIRECTORY, 'frozen-ledger.json'), 'utf8'));
  const migrations = frozen.migrations.slice(0, 96);
  if (migrations.length !== 96 || migrations[0]?.filename.slice(0, 4) !== '0001' || migrations.at(-1)?.filename.slice(0, 4) !== '0096') {
    throw new Error('Local package migration inventory must be exactly 0001 through 0096.');
  }
  const relativeFiles = [
    'scripts/migration-audit/local-canonical-collector.mjs',
    'scripts/migration-audit/local-canonical-collector.test.mjs',
    'scripts/migration-audit/local-canonical-cli.mjs',
    'scripts/migration-audit/local-reviewed-pin.mjs',
    'scripts/migration-audit/core.mjs',
    'scripts/migration-audit/one-process-executor.mjs',
    'scripts/migration-audit/collect-readonly.mjs',
    'scripts/migration-audit/bounded-subprocess.mjs',
    'scripts/migration-audit/inspect-windows-acl.ps1',
    'scripts/migration-audit/frozen-ledger.json',
    'scripts/migration-audit/frozen-artifacts.json',
    'scripts/migration-audit/0095-postconditions-readonly.sql',
    'scripts/migration-audit/0096-postconditions-readonly.sql',
    'scripts/migration-audit/moderate-content-bundle-manifest.json',
    'scripts/migration-audit/admin-actions-bundle-manifest.json',
    'supabase/functions/moderate-content/index.ts',
    'supabase/functions/moderate-content/index.test.ts',
    'supabase/functions/admin-actions/index.ts',
    ...LOCAL_QUERY_PLAN.map(({ filename }) => `scripts/migration-audit/${filename}`),
    ...migrations.map(({ filename }) => `supabase/migrations/${filename}`),
  ];
  if (new Set(relativeFiles).size !== relativeFiles.length) throw new Error('Local package file inventory contains duplicates.');
  const files = relativeFiles.sort().map((filename) => {
    const absolute = path.join(PROJECT_ROOT, ...filename.split('/'));
    const info = lstatSync(absolute);
    if (!info.isFile() || info.isSymbolicLink() || realpathSync.native(absolute).toLowerCase() !== path.resolve(absolute).toLowerCase()) {
      throw new Error(`Local package input must be a canonical regular file: ${filename}.`);
    }
    const bytes = filename.startsWith('supabase/migrations/')
      ? cleanMigrationBytes(path.basename(filename))
      : readFileSync(absolute);
    return { filename, sha256: sha256(bytes) };
  });
  return { formatVersion: 1, scope: 'LOCAL_CANONICAL_REPLAY_0001_0096_ONLY', files };
}

export function replayProvenance() {
  const frozen = JSON.parse(readFileSync(path.join(MODULE_DIRECTORY, 'frozen-ledger.json'), 'utf8'));
  const migrations = frozen.migrations.slice(0, 96);
  if (migrations.length !== 96 || migrations.at(-1)?.filename.slice(0, 4) !== '0096') {
    throw new Error('Frozen replay provenance does not end at 0096.');
  }
  for (const migration of migrations) {
    const actual = cleanMigrationBytes(migration.filename);
    if (sha256(actual) !== migration.sha256) throw new Error(`Migration provenance drift: ${migration.filename}.`);
  }
  return { formatVersion: 1, range: '0001-0096', migrations };
}

export function validateReplayLedger(rows) {
  const expected = Array.from({ length: 96 }, (_, index) => String(index + 1).padStart(4, '0'));
  const actual = rows.map((row) => row.object_key);
  if (rows.length !== 96 || actual.some((value, index) => value !== expected[index]) ||
      rows.some((row) => row.definition.version !== row.object_key)) {
    throw new Error('Replay ledger must contain exactly 0001 through 0096 in order.');
  }
  return actual;
}

function validateAuthTrigger(rows) {
  if (rows.length !== 1) throw new Error('Auth signup trigger proof must contain exactly one row.');
  const row = rows[0];
  if (row.category !== 'auth_signup_trigger' || row.object_key !== 'auth.users.on_auth_user_created' ||
      Object.keys(row.definition).sort().join(',') !== 'definition_sha256,enabled,function' ||
      row.definition.enabled !== 'O' || row.definition.function !== 'public.handle_new_user' ||
      !/^[0-9a-f]{64}$/.test(row.definition.definition_sha256)) {
    throw new Error('Auth signup trigger proof rejected.');
  }
  return rows;
}

function assertCompleteness(type, rows) {
  if (type === 'current-state-flags' && rows.length !== 7) throw new Error('Current state proof must contain seven flags.');
  if (type === 'cron-presence' && rows.length !== 1) throw new Error('Cron presence proof must contain one row.');
  if (type === 'cron-config') {
    const expected = rows.find((row) => row.object_key === 'purge-old-messages');
    if (!expected || expected.definition.schedule !== '17 3 * * *' ||
        expected.definition.command_sha256 !== 'c9258a59aa0e7449631eb5b4cbc76adebcf982c8ea00808779d29147ee2acb7d') {
      throw new Error('Required purge-old-messages cron configuration missing or changed.');
    }
  }
  // Catalog query-section coverage is bound by the frozen union query hash and
  // plan hash; requiring a row in every category would reject valid empty kinds.
  if (type === 'deterministic-config') {
    const records = new Map(rows.map((row) => [`${row.category}:${row.object_key}`, row.definition]));
    for (const [key, isPublic] of [['avatars', true], ['post-images', true], ['memories', false]]) {
      const value = records.get(`storage_bucket_config:${key}`);
      if (!value || value.public !== isPublic || value.file_size_limit !== null || value.allowed_mime_types !== null) {
        throw new Error(`Required bucket seed missing or changed: ${key}.`);
      }
    }
    const rates = {
      posts: ['user_id',30,3600], post_comments: ['user_id',60,600], post_likes: ['user_id',150,600],
      buddy_messages: ['sender',90,60], buddy_requests: ['from_user',30,3600], stories: ['user_id',30,86400],
      buddy_reports: ['reporter',20,86400], memories: ['user_id',120,3600], search_history: ['user_id',200,600],
      r2_sign_log: ['user_id',60,3600], support_messages: ['user_id',20,3600],
    };
    for (const [key, [owner_column, maximum_rows, window_seconds]] of Object.entries(rates)) {
      const value = records.get(`rate_limit_config:${key}`);
      if (!value || value.owner_column !== owner_column || value.maximum_rows !== maximum_rows || value.window_seconds !== window_seconds) {
        throw new Error(`Required rate limit seed missing or changed: ${key}.`);
      }
    }
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function defaultRunDocker({ args, input = undefined }) {
  const result = spawnSync(DOCKER_EXECUTABLE, args, {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function canonicalRegularFile(candidate, label) {
  const info = lstatSync(candidate);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular non-link file.`);
  const canonical = realpathSync.native(candidate);
  if (canonical.toLowerCase() !== path.resolve(candidate).toLowerCase()) throw new Error(`${label} canonical path rejected.`);
  return canonical;
}

function defaultProtectEvidence(target) {
  if (process.platform !== 'win32') throw new Error('Local evidence ACL requires Windows.');
  const system = realpathSync.native('C:\\WINDOWS\\System32');
  const tools = {
    systemDirectory: system,
    powershell: canonicalRegularFile(path.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), 'PowerShell'),
    icacls: canonicalRegularFile(path.join(system, 'icacls.exe'), 'icacls'),
    whoami: canonicalRegularFile(path.join(system, 'whoami.exe'), 'whoami'),
  };
  const expected = {
    icacls: 'cb9e55d4c02f4e55100724d2da9a1267f49e196bd39fcdf36cec6ea6314fad2a',
    powershell: '7600ffe12da441fe89d035b13801e8e91d064bc544a27b19a5cf49f6ab8b18f5',
    whoami: '23240ef9f8b0a9a324110b1c2331de31dc1b0e08f5359cb707e51a939af56cd3',
  };
  for (const name of ['icacls', 'powershell', 'whoami']) if (sha256(readFileSync(tools[name])) !== expected[name]) throw new Error(`Pinned Windows ${name} hash mismatch.`);
  const who = spawnSync(tools.whoami, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 3_000 });
  const sid = who.stdout?.match(/"[^"]*","(S-[0-9-]+)"/iu)?.[1];
  if (who.status !== 0 || who.error || !sid) throw new Error('Windows account SID unavailable for local evidence ACL.');
  const helper = canonicalRegularFile(path.join(MODULE_DIRECTORY, 'inspect-windows-acl.ps1'), 'Windows ACL inspector');
  const frozen = JSON.parse(readFileSync(path.join(MODULE_DIRECTORY, 'frozen-artifacts.json'), 'utf8'));
  if (sha256(readFileSync(helper)) !== frozen.artifactSha256['inspect-windows-acl.ps1']) throw new Error('Windows ACL inspector hash mismatch.');
  restrictAndVerifyWindowsAcl(target, `*${sid}`, spawnSync, '(OI)(CI)F', helper, tools);
}

function parseCsv(raw) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted) {
      if (character === '"' && raw[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      records.push(record);
      record = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('psql CSV has an unterminated quoted field.');
  if (field.length || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function parsePsqlCsvRows(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 16 * 1024 * 1024) {
    throw new Error('psql CSV output size rejected.');
  }
  const records = parseCsv(raw);
  const header = records.shift();
  if (!header || header.join(',') !== 'category,object_key,definition') {
    throw new Error('psql CSV header rejected.');
  }
  return records.filter((record) => !(record.length === 1 && record[0] === '')).map((record) => {
    if (record.length !== 3) throw new Error('psql CSV rows must contain exactly three columns.');
    let definition;
    try {
      definition = JSON.parse(record[2]);
    } catch {
      throw new Error('psql CSV definition is not JSON.');
    }
    return { category: record[0], object_key: record[1], definition };
  });
}

function assertOutputTarget(outputDir) {
  if (typeof outputDir !== 'string' || !path.isAbsolute(outputDir)) {
    throw new Error('Local evidence output must be an absolute path.');
  }
  const evidenceRoot = realpathSync(LOCAL_EVIDENCE_ROOT);
  if (lstatSync(evidenceRoot).isSymbolicLink() || (lstatSync(evidenceRoot).mode & 0o170000) !== 0o040000) {
    throw new Error('Fixed local evidence root is not a regular directory.');
  }
  const resolved = path.resolve(outputDir);
  if (!resolved.startsWith(`${evidenceRoot}${path.sep}`)) throw new Error('Output must be beneath the fixed local evidence root.');
  if (existsSync(outputDir)) throw new Error('Local evidence output directory must not already exist.');
  const parent = path.dirname(outputDir);
  if (!existsSync(parent)) throw new Error('Local evidence output parent must already exist.');
  const canonicalParent = realpathSync(parent);
  if (!canonicalParent.startsWith(`${evidenceRoot}${path.sep}`) || lstatSync(parent).isSymbolicLink()) {
    throw new Error('Output parent must be a real directory beneath the fixed local evidence root.');
  }
  return path.resolve(outputDir);
}

function assertSuccessful(result, operation) {
  if (!result || result.status !== 0 || result.error) {
    throw new Error(`Local Docker ${operation} failed.`);
  }
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

export function stableContainerProjection(container) {
  if (!container || typeof container !== 'object' || Array.isArray(container)) throw new Error('Pinned container inspect shape rejected.');
  const config = container.Config ?? {};
  const projection = {
    id: container.Id, name: container.Name, imageId: container.Image, configuredImage: config.Image,
    running: container.State?.Running === true,
    labels: sortedObject(config.Labels), entrypoint: config.Entrypoint ?? null, command: config.Cmd ?? null,
    mounts: (container.Mounts ?? []).map((mount) => ({
      destination: mount.Destination ?? '', mode: mount.Mode ?? '', name: mount.Name ?? '',
      propagation: mount.Propagation ?? '', readWrite: mount.RW === true, source: mount.Source ?? '', type: mount.Type ?? '',
    })).sort((left, right) => left.destination.localeCompare(right.destination)),
    networks: Object.fromEntries(Object.entries(container.NetworkSettings?.Networks ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([name, network]) => [name, {
      aliases: Array.isArray(network.Aliases) ? [...network.Aliases].sort() : [],
    }])),
  };
  return projection;
}

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

function exactIdentity(raw, pin) {
  let value;
  try { value = JSON.parse(raw.trim()); } catch { throw new Error('Pinned database identity JSON rejected.'); }
  const expected = {
    server_version_num: pin.database.serverVersionNum, current_database: pin.database.currentDatabase,
    database_oid: pin.database.databaseOid, system_identifier: pin.database.systemIdentifier,
    ledger_versions: pin.ledgerVersions,
  };
  if (normalizedJson(value) !== normalizedJson(expected)) throw new Error('Pinned database identity or ledger mismatch.');
  return value;
}

export function verifyPinnedLocalRuntime(pin, runDocker) {
  const id = pin.container.id;
  const inspect = runDocker({ args: ['container', 'inspect', id] });
  assertSuccessful(inspect, 'container inspection');
  let containers;
  try { containers = JSON.parse(inspect.stdout); } catch { throw new Error('Pinned container inspect JSON rejected.'); }
  if (!Array.isArray(containers) || containers.length !== 1 || containers[0].Id !== id) throw new Error('Pinned full container ID mismatch.');
  const projection = stableContainerProjection(containers[0]);
  const projectionSha256 = sha256(normalizedJson(projection));
  const entrypointCommandSha256 = sha256(normalizedJson({ entrypoint: projection.entrypoint, command: projection.command }));
  if (!projection.running || projectionSha256 !== pin.container.stableProjectionSha256 || entrypointCommandSha256 !== pin.container.entrypointCommandSha256) {
    throw new Error('Pinned container stable projection mismatch.');
  }
  const psql = pin.psql.absolutePath;
  for (const [args, label] of [
    [['exec', id, '/usr/bin/test', '-f', psql], 'psql regular-file verification'],
    [['exec', id, '/usr/bin/test', '-x', psql], 'psql executable verification'],
    [['exec', id, '/usr/bin/test', '!', '-L', psql], 'psql symlink rejection'],
  ]) assertSuccessful(runDocker({ args }), label);
  const hashResult = runDocker({ args: ['exec', id, '/usr/bin/sha256sum', '--', psql] });
  assertSuccessful(hashResult, 'psql hash verification');
  if (hashResult.stdout.trim() !== `${pin.psql.executableSha256}  ${psql}`) throw new Error('Pinned psql SHA-256 mismatch.');
  const version = runDocker({ args: ['exec', id, psql, '--version'] });
  assertSuccessful(version, 'psql version verification');
  if (version.stdout.trim() !== pin.psql.version) throw new Error('Pinned psql version mismatch.');
  const identity = runDocker({ args: ['exec', '-i', id, psql, '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', IDENTITY_SQL] });
  assertSuccessful(identity, 'database identity verification');
  return {
    containerId: id, containerProjectionSha256: projectionSha256, entrypointCommandSha256,
    psqlAbsolutePath: psql, psqlSha256: pin.psql.executableSha256, psqlVersion: pin.psql.version,
    connection: { transport: 'local-unix-socket', socket: '/var/run/postgresql', database: 'postgres', user: 'postgres' },
    database: exactIdentity(identity.stdout, pin),
  };
}

export function createLocalCanonicalCollector({
  runDocker = defaultRunDocker, approvedPin,
  verifyRuntime = verifyPinnedLocalRuntime,
  protectEvidence = defaultProtectEvidence,
} = {}) {
  if (typeof runDocker !== 'function') throw new Error('Local Docker runner is required.');
  if (!approvedPin || approvedPin.status !== 'APPROVED' || !/^[0-9a-f]{64}$/u.test(approvedPin.pinSha256 ?? '')) throw new Error('Validated approved local pin is required.');
  if (normalizedJson(approvedPin.package) !== normalizedJson(localPackageIdentity())) throw new Error('Approved local package hash mismatch.');
  return async function collect({ outputDir }) {
    if (normalizedJson(approvedPin.package) !== normalizedJson(localPackageIdentity())) throw new Error('Approved local package changed before collection.');
    const absoluteOutput = assertOutputTarget(outputDir);
    if (sha256(readFileSync(DOCKER_EXECUTABLE)) !== DOCKER_SHA256) throw new Error('Pinned Docker executable hash mismatch.');
    const frozenArtifacts = JSON.parse(readFileSync(path.join(MODULE_DIRECTORY, 'frozen-artifacts.json'), 'utf8'));
    const provenance = replayProvenance();
    const actualPlanSha256 = sha256(normalizedJson(LOCAL_QUERY_PLAN));
    if (actualPlanSha256 !== LOCAL_PLAN_SHA256) throw new Error('Pinned local collector plan hash mismatch.');
    const identityBefore = verifyRuntime(approvedPin, runDocker);

    const evidence = {};
    for (const query of LOCAL_QUERY_PLAN) {
      const sqlPath = path.join(MODULE_DIRECTORY, query.filename);
      const sql = readFileSync(sqlPath, 'utf8');
      const expectedQuerySha256 = query.filename.startsWith('local-')
        ? LOCAL_QUERY_SHA256[query.filename]
        : frozenArtifacts.artifactSha256[query.filename];
      if (expectedQuerySha256 !== sha256(sql)) {
        throw new Error(`Frozen query hash mismatch: ${query.filename}.`);
      }
      if (query.evidenceType === 'current-state-flags') assertReadOnlyCurrentStateSql(sql);
      else assertReadOnlyCatalogSql(sql);
      const result = runDocker({
        args: [
          'exec', '-i', approvedPin.container.id, approvedPin.psql.absolutePath,
          '-h', '/var/run/postgresql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
          '-U', 'postgres', '-d', 'postgres', '--csv', '-f', '-',
        ],
        input: sql,
      });
      assertSuccessful(result, `query ${query.filename}`);
      const parsed = parsePsqlCsvRows(result.stdout);
      const rows = query.evidenceType === 'auth-signup-trigger'
        ? validateAuthTrigger(parsed)
        : validateQueryRows(parsed, query.filename, query.evidenceType === 'replay-ledger' ? 'ledger' : query.evidenceType);
      if (query.evidenceType === 'replay-ledger') validateReplayLedger(rows);
      else assertCompleteness(query.evidenceType, rows);
      evidence[query.evidenceType] = {
        filename: query.filename,
        querySha256: sha256(sql),
        rows,
      };
    }
    const identityAfter = verifyRuntime(approvedPin, runDocker);
    if (normalizedJson(identityBefore) !== normalizedJson(identityAfter)) throw new Error('Pinned runtime identity changed during collection.');

    const temporary = `${absoluteOutput}.partial-${process.pid}`;
    if (existsSync(temporary)) throw new Error('Local evidence temporary directory already exists.');
    try {
      mkdirSync(temporary);
      chmodSync(temporary, 0o700);
      protectEvidence(temporary);
      const manifestEvidence = {};
      for (const [evidenceType, entry] of Object.entries(evidence)) {
        const body = normalizedJson({
          formatVersion: 1,
          evidenceType,
          container: DISPOSABLE_CONTAINER,
          queryFilename: entry.filename,
          querySha256: entry.querySha256,
          rows: entry.rows,
        });
        const outputFilename = `${evidenceType}.json`;
        writeFileSync(path.join(temporary, outputFilename), body, { encoding: 'utf8', flag: 'wx' });
        chmodSync(path.join(temporary, outputFilename), 0o600);
        manifestEvidence[evidenceType] = {
          filename: outputFilename,
          sha256: sha256(body),
          rowCount: entry.rows.length,
        };
      }
      const manifest = normalizedJson({
        formatVersion: 1,
        source: 'disposable-local-supabase',
        container: DISPOSABLE_CONTAINER, pinSha256: approvedPin.pinSha256,
        claim: 'canonical-replay-0001-0096',
        observedIdentityBefore: identityBefore, observedIdentityAfter: identityAfter,
        replayProvenance: provenance, replayProvenanceSha256: sha256(normalizedJson(provenance)),
        planSha256: actualPlanSha256,
        evidence: manifestEvidence,
      });
      writeFileSync(path.join(temporary, 'manifest.json'), manifest, { encoding: 'utf8', flag: 'wx' });
      chmodSync(path.join(temporary, 'manifest.json'), 0o600);
      const manifestSha256 = sha256(manifest);
      writeFileSync(path.join(temporary, 'manifest.sha256'), `${manifestSha256}\n`, { encoding: 'utf8', flag: 'wx' });
      chmodSync(path.join(temporary, 'manifest.sha256'), 0o600);
      protectEvidence(temporary);
      renameSync(temporary, absoluteOutput);
    } catch (error) {
      rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
    return { outputDir: absoluteOutput, manifestPath: path.join(absoluteOutput, 'manifest.json'), manifestSha256: readFileSync(path.join(absoluteOutput, 'manifest.sha256'), 'utf8').trim() };
  };
}
