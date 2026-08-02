import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compareEvidenceBundles } from './canonical-evidence-compare.mjs';
import { normalizedJson } from './core.mjs';
import { DISPOSABLE_CONTAINER, LOCAL_QUERY_PLAN, localPackageIdentity, replayProvenance } from './local-canonical-collector.mjs';

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'ksvcjvwawamwyquzsizk';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const frozen = JSON.parse(readFileSync(path.join(DIRECTORY, 'frozen-artifacts.json'), 'utf8'));
const packageFiles = [
  'audit.mjs', 'core.mjs', 'core.test.mjs', 'frozen-artifacts.json', 'one-process-executor.mjs',
  'bounded-subprocess.mjs', 'collector.test.mjs', 'collect-readonly.mjs', 'inspect-windows-acl.ps1',
  '0095-postconditions-readonly.sql', '0096-postconditions-readonly.sql',
  'moderate-content-bundle-manifest.json', 'admin-actions-bundle-manifest.json',
  'supabase-2.110.0-json-envelope-provenance.json',
];
const queryFiles = {
  'replay-ledger': 'catalog-ledger-readonly.sql', 'ledger-presence': 'catalog-presence-readonly.sql',
  catalog: 'catalog-union-readonly.sql', 'deterministic-config': 'deterministic-config-readonly.sql',
  'current-state-flags': 'current-state-flags-readonly.sql', 'cron-presence': 'cron-presence-readonly.sql',
  'cron-config': 'cron-config-readonly.sql', 'auth-signup-trigger': 'auth-signup-trigger-readonly.sql',
  'server-version': 'server-version-readonly.sql', 'operational-counts': 'catalog-operational-readonly.sql',
};
const json = normalizedJson;

function authority(root) {
  const now = Date.now();
  const packageSha256 = Object.fromEntries(packageFiles.map((filename) => [filename, sha256(readFileSync(path.join(DIRECTORY, filename)))]));
  const ledgerVersions = Array.from({ length: 96 }, (_, index) => String(index + 1).padStart(4, '0'));
  const pin = {
    formatVersion: 1, status: 'APPROVED', reviewer: 'fixture-reviewer', scope: 'LOCAL_CANONICAL_REPLAY_0001_0096_ONLY',
    approvedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
    docker: { executableSha256: '1'.repeat(64) }, package: localPackageIdentity(),
    container: { id: '2'.repeat(64), stableProjectionSha256: '3'.repeat(64), entrypointCommandSha256: '4'.repeat(64) },
    psql: { absolutePath: '/nix/store/d43fya852vmrp5hws2lrw47ccq1ngakz-postgresql-17.6/bin/psql', executableSha256: '5'.repeat(64), version: 'psql (PostgreSQL) 17.6' },
    database: { serverVersionNum: '170006', currentDatabase: 'postgres', databaseOid: '5', systemIdentifier: '123456' }, ledgerVersions,
  };
  const anchor = {
    formatVersion: 1, approval: 'APPROVED', reviewer: 'fixture-reviewer', authority: 'fixture-authority',
    approvedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
    projectRef: PROJECT_REF, accountSlug: 'kingrand', scope: 'STAGING_READ_ONLY_MIGRATION_AUDIT',
    singleUsePolicy: 'ONE_PROCESS_FRESH_PREFLIGHT',
    windowsTrust: { systemRoot: 'C:\\WINDOWS', toolSha256: { icacls: '6'.repeat(64), powershell: '7'.repeat(64), whoami: '8'.repeat(64) } },
    packageDigest: sha256(json(packageSha256)), packageSha256,
  };
  const pinPath = path.join(root, 'approved-local-pin.json');
  const anchorPath = path.join(root, 'approved-staging-anchor.json');
  const pinBytes = Buffer.from(json(pin)); const anchorBytes = Buffer.from(json(anchor));
  writeFileSync(pinPath, pinBytes); writeFileSync(anchorPath, anchorBytes);
  return { pin, pinPath, pinDigest: sha256(pinBytes), anchor, anchorPath, anchorDigest: sha256(anchorBytes), packageSha256 };
}

function commonRows(type) {
  if (type === 'catalog') return [{ category: 'relation', object_key: 'public.x', definition: { rls: true } }];
  if (type === 'deterministic-config') return [{ category: 'rate_limit_config', object_key: 'posts', definition: { maximum_rows: 30 } }];
  if (type === 'current-state-flags') return [{ category: 'current_state_flag', object_key: '0078_posts_photo_type_mismatch', definition: { present: false } }];
  if (type === 'cron-presence') return [{ category: 'cron_presence', object_key: 'cron.job', definition: { relation: 'cron.job' } }];
  if (type === 'cron-config') return [{ category: 'cron_job_config', object_key: 'purge-old-messages', definition: { schedule: '17 3 * * *' } }];
  return [{ category: 'auth_signup_trigger', object_key: 'auth.users.on_auth_user_created', definition: { definition_sha256: 'a'.repeat(64), enabled: 'O', function: 'public.handle_new_user' } }];
}

function runtime(pin) {
  return {
    containerId: pin.container.id, containerProjectionSha256: pin.container.stableProjectionSha256,
    entrypointCommandSha256: pin.container.entrypointCommandSha256, psqlAbsolutePath: pin.psql.absolutePath,
    psqlSha256: pin.psql.executableSha256, psqlVersion: pin.psql.version,
    connection: { transport: 'local-unix-socket', socket: '/var/run/postgresql', database: 'postgres', user: 'postgres' },
    database: { server_version_num: pin.database.serverVersionNum, current_database: pin.database.currentDatabase,
      database_oid: pin.database.databaseOid, system_identifier: pin.database.systemIdentifier, ledger_versions: pin.ledgerVersions },
  };
}

function writeLocal(root, pin) {
  mkdirSync(root);
  const evidence = {};
  for (const type of ['replay-ledger', 'catalog', 'deterministic-config', 'current-state-flags', 'cron-presence', 'cron-config', 'auth-signup-trigger']) {
    const rows = type === 'replay-ledger' ? pin.ledgerVersions.map((version) => ({ category: 'ledger_version', object_key: version, definition: { version } })) : commonRows(type);
    const queryFilename = type === 'auth-signup-trigger' ? 'local-auth-signup-trigger-readonly.sql' : queryFiles[type];
    const bytes = Buffer.from(json({ formatVersion: 1, evidenceType: type, container: DISPOSABLE_CONTAINER, queryFilename,
      querySha256: sha256(readFileSync(path.join(DIRECTORY, queryFilename))), rows }));
    const filename = `${type}.json`; writeFileSync(path.join(root, filename), bytes);
    evidence[type] = { filename, sha256: sha256(bytes), rowCount: rows.length };
  }
  const provenance = replayProvenance(); const observed = runtime(pin);
  const manifest = { formatVersion: 1, source: 'disposable-local-supabase', container: DISPOSABLE_CONTAINER,
    pinSha256: null, claim: 'canonical-replay-0001-0096', observedIdentityBefore: observed, observedIdentityAfter: observed,
    replayProvenance: provenance, replayProvenanceSha256: sha256(json(provenance)),
    planSha256: sha256(json(LOCAL_QUERY_PLAN)), evidence };
  return manifest;
}

function finalizeLocal(root, manifest, pinDigest) {
  manifest.pinSha256 = pinDigest;
  const bytes = Buffer.from(json(manifest)); writeFileSync(path.join(root, 'manifest.json'), bytes);
  writeFileSync(path.join(root, 'manifest.sha256'), `${sha256(bytes)}\n`);
}

function stagingArtifacts(packageSha256) {
  return { ...frozen.artifactSha256, ...packageSha256 };
}

function writeStaging(root, packageSha256, anchor, mutate = () => {}) {
  mkdirSync(root);
  const provenance = JSON.parse(readFileSync(path.join(DIRECTORY, 'supabase-2.110.0-json-envelope-provenance.json'), 'utf8'));
  const issued = Date.parse(anchor.approvedAt) + 1_000;
  const cli = { executable: provenance.cli.canonicalPath, version: provenance.cli.version, sha256: provenance.cli.sha256 };
  const body = { formatVersion: 1, projectRef: PROJECT_REF, cli, artifacts: stagingArtifacts(packageSha256),
    nonce: 'a'.repeat(32), issuedAt: new Date(issued).toISOString(), expiresAt: new Date(issued + 300_000).toISOString() };
  const receipt = { ...body, receiptSha256: sha256(json(body)) };
  writeFileSync(path.join(root, 'receipt.json'), json(receipt));
  for (const type of ['ledger-presence', 'cron-presence', 'catalog', 'deterministic-config', 'current-state-flags', 'auth-signup-trigger', 'server-version', 'operational-counts', 'cron-config']) {
    const records = type === 'ledger-presence' ? [{ category: 'ledger_presence', object_key: 'supabase_migrations.schema_migrations', definition: { relation: null } }]
      : type === 'server-version' ? [{ category: 'postgres_server_version', object_key: 'server', definition: { server_version_num: '170006' } }]
      : type === 'operational-counts' ? [] : commonRows(type);
    const querySha256 = frozen.artifactSha256[queryFiles[type]];
    const envelopeBody = { formatVersion: 1, evidenceType: type, receiptSha256: receipt.receiptSha256, projectRef: PROJECT_REF,
      nonce: receipt.nonce, querySha256, collectedAt: new Date(issued + 60_000).toISOString(), records };
    const envelope = { ...envelopeBody, evidenceSha256: sha256(json(envelopeBody)) };
    const command = { executableSha256: receipt.cli.sha256,
      args: ['db', 'query', '--linked', '--file', `C:\\frozen\\${querySha256}.sql`, '--output-format', 'json'],
      status: 0, stdoutSha256: '9'.repeat(64), stderrSha256: '0'.repeat(64) };
    writeFileSync(path.join(root, `${type}.json`), json({ envelope, command }));
  }
  mutate({ root, receipt });
}

function fixture(mutateStaging) {
  const root = mkdtempSync(path.join(tmpdir(), 'canonical-authority-'));
  const approved = authority(root); const localRoot = path.join(root, 'local'); const stagingRoot = path.join(root, 'staging');
  const manifest = writeLocal(localRoot, approved.pin); finalizeLocal(localRoot, manifest, approved.pinDigest);
  writeStaging(stagingRoot, approved.packageSha256, approved.anchor, mutateStaging);
  return { root, localRoot, stagingRoot, approved, manifest };
}

function compare(value) {
  return compareEvidenceBundles(value.localRoot, value.stagingRoot,
    value.approved.pinPath, value.approved.pinDigest, value.approved.anchorPath, value.approved.anchorDigest);
}

test('requires both external approved authorities and reports bound server versions', () => {
  const value = fixture();
  try {
    assert.throws(() => compareEvidenceBundles(value.localRoot, value.stagingRoot), /approved|authority|pin/iu);
    const report = compare(value);
    assert.equal(report.status, 'EQUIVALENT');
    assert.deepEqual(report.serverVersions, { canonical: '170006', staging: '170006' });
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('rejects local pin digest and runtime, plan, provenance, or package drift', () => {
  const value = fixture();
  try {
    assert.throws(() => compareEvidenceBundles(value.localRoot, value.stagingRoot, value.approved.pinPath, 'f'.repeat(64), value.approved.anchorPath, value.approved.anchorDigest), /digest/iu);
    value.manifest.planSha256 = 'f'.repeat(64); finalizeLocal(value.localRoot, value.manifest, value.approved.pinDigest);
    assert.throws(() => compare(value), /plan/iu);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('rejects staging receipt, anchor package, collection-window, and envelope binding drift', () => {
  const value = fixture();
  try {
    assert.equal(compare(value).status, 'EQUIVALENT');
    const receiptPath = path.join(value.stagingRoot, 'receipt.json');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')); receipt.artifacts['core.mjs'] = 'f'.repeat(64);
    const { receiptSha256: ignored, ...body } = receipt; receipt.receiptSha256 = sha256(json(body)); writeFileSync(receiptPath, json(receipt));
    assert.throws(() => compare(value), /artifact|receipt|package/iu);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('requires exact root/envelope/command shapes, exact auth identity, and one server-version record', () => {
  const value = fixture();
  try {
    const authPath = path.join(value.stagingRoot, 'auth-signup-trigger.json');
    const auth = JSON.parse(readFileSync(authPath, 'utf8')); auth.envelope.records[0].object_key = 'auth.users.fake';
    const { evidenceSha256: ignored, ...body } = auth.envelope; auth.envelope.evidenceSha256 = sha256(json(body)); writeFileSync(authPath, json(auth));
    assert.throws(() => compare(value), /auth/iu);
  } finally { rmSync(value.root, { recursive: true, force: true }); }

  const commandValue = fixture();
  try {
    const catalogPath = path.join(commandValue.stagingRoot, 'catalog.json');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')); catalog.command.unapproved = true; writeFileSync(catalogPath, json(catalog));
    assert.throws(() => compare(commandValue), /command.*shape/iu);
  } finally { rmSync(commandValue.root, { recursive: true, force: true }); }

  const versionValue = fixture();
  try {
    const versionPath = path.join(versionValue.stagingRoot, 'server-version.json');
    const version = JSON.parse(readFileSync(versionPath, 'utf8')); version.envelope.records.push(version.envelope.records[0]);
    const { evidenceSha256: ignored, ...body } = version.envelope; version.envelope.evidenceSha256 = sha256(json(body)); writeFileSync(versionPath, json(version));
    assert.throws(() => compare(versionValue), /server-version/iu);
  } finally { rmSync(versionValue.root, { recursive: true, force: true }); }
});

test('rejects extras and treats stdout hashes only as supporting evidence', () => {
  const value = fixture();
  try {
    const catalogPath = path.join(value.stagingRoot, 'catalog.json');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')); catalog.command.stdoutSha256 = 'e'.repeat(64); writeFileSync(catalogPath, json(catalog));
    assert.equal(compare(value).status, 'EQUIVALENT');
    writeFileSync(path.join(value.stagingRoot, 'extra.json'), '{}\n');
    assert.throws(() => compare(value), /unexpected file/iu);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
