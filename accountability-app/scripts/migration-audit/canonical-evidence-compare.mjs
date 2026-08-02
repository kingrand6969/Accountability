#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { normalizedJson, validateExternalApproval } from './core.mjs';
import { DISPOSABLE_CONTAINER, LOCAL_QUERY_PLAN, localPackageIdentity, replayProvenance } from './local-canonical-collector.mjs';
import { validateApprovedLocalPin } from './local-reviewed-pin.mjs';

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'ksvcjvwawamwyquzsizk';
const DIGEST = /^[0-9a-f]{64}$/u;
const COMPARISON_TYPES = Object.freeze(['catalog', 'deterministic-config', 'current-state-flags', 'cron-presence', 'cron-config', 'auth-signup-trigger']);
const LOCAL_TYPES = Object.freeze(['replay-ledger', ...COMPARISON_TYPES]);
const STAGING_REQUIRED = Object.freeze(['ledger-presence', 'cron-presence', 'catalog', 'deterministic-config', 'current-state-flags', 'auth-signup-trigger', 'server-version', 'operational-counts']);
const STAGING_OPTIONAL = Object.freeze(['ledger', 'cron-config']);
const PACKAGE_FILES = Object.freeze([
  'audit.mjs', 'core.mjs', 'core.test.mjs', 'frozen-artifacts.json', 'one-process-executor.mjs',
  'bounded-subprocess.mjs', 'collector.test.mjs', 'collect-readonly.mjs', 'inspect-windows-acl.ps1',
  '0095-postconditions-readonly.sql', '0096-postconditions-readonly.sql',
  'moderate-content-bundle-manifest.json', 'admin-actions-bundle-manifest.json',
  'supabase-2.110.0-json-envelope-provenance.json',
]);
const QUERY_FILES = Object.freeze({
  'replay-ledger': 'catalog-ledger-readonly.sql', ledger: 'catalog-ledger-readonly.sql',
  'ledger-presence': 'catalog-presence-readonly.sql', catalog: 'catalog-union-readonly.sql',
  'deterministic-config': 'deterministic-config-readonly.sql', 'current-state-flags': 'current-state-flags-readonly.sql',
  'cron-presence': 'cron-presence-readonly.sql', 'cron-config': 'cron-config-readonly.sql',
  'auth-signup-trigger': 'auth-signup-trigger-readonly.sql', 'server-version': 'server-version-readonly.sql',
  'operational-counts': 'catalog-operational-readonly.sql',
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const keys = (value) => Object.keys(value).sort().join(',');
function exact(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || keys(value) !== expected.slice().sort().join(',')) {
    throw new Error(`${label} shape rejected.`);
  }
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
function canonicalRows(rows) {
  return rows.map(canonicalize).sort((left, right) => `${left.category}\0${left.object_key}`.localeCompare(`${right.category}\0${right.object_key}`));
}

function canonicalFile(filename, label) {
  const target = path.join(DIRECTORY, filename);
  if (filename !== path.basename(filename) || !existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile() ||
      realpathSync.native(target).toLowerCase() !== path.resolve(target).toLowerCase()) throw new Error(`${label} canonical package file rejected: ${filename}.`);
  return readFileSync(target);
}
function authorityFile(input, approvedDigest, label) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || !DIGEST.test(approvedDigest ?? '') || !existsSync(input) ||
      lstatSync(input).isSymbolicLink() || !lstatSync(input).isFile()) throw new Error(`${label} approved authority file rejected.`);
  const resolved = realpathSync(input);
  if (resolved.toLowerCase().startsWith(`${DIRECTORY.toLowerCase()}${path.sep}`) || sha256(readFileSync(resolved)) !== approvedDigest) {
    throw new Error(`${label} approved authority digest or location rejected.`);
  }
  return readFileSync(resolved);
}
function bundleRoot(input, label) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || !existsSync(input) || lstatSync(input).isSymbolicLink()) throw new Error(`${label} bundle rejected.`);
  const root = realpathSync(input);
  if (!lstatSync(root).isDirectory()) throw new Error(`${label} bundle rejected.`);
  return root;
}
function jsonFile(root, filename, label) {
  if (filename !== path.basename(filename) || !filename.endsWith('.json')) throw new Error(`${label} filename rejected.`);
  const target = path.join(root, filename);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile() || path.dirname(realpathSync(target)) !== root) throw new Error(`${label} file rejected: ${filename}.`);
  const bytes = readFileSync(target);
  try { return { bytes, value: JSON.parse(bytes) }; } catch { throw new Error(`${label} JSON rejected: ${filename}.`); }
}
function validateRows(rows, type, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} ${type} rows rejected.`);
  const seen = new Set();
  for (const row of rows) {
    exact(row, ['category', 'object_key', 'definition'], `${label} ${type} row`);
    if (typeof row.category !== 'string' || typeof row.object_key !== 'string' || !row.definition || typeof row.definition !== 'object' || Array.isArray(row.definition)) throw new Error(`${label} ${type} row rejected.`);
    const identity = `${row.category}\0${row.object_key}`; if (seen.has(identity)) throw new Error(`${label} ${type} duplicate row.`); seen.add(identity);
  }
  return rows;
}
function validateAuth(rows, label) {
  validateRows(rows, 'auth-signup-trigger', label);
  if (rows.length !== 1) throw new Error(`${label} auth trigger must contain exactly one row.`);
  const row = rows[0]; exact(row.definition, ['definition_sha256', 'enabled', 'function'], `${label} auth definition`);
  if (row.category !== 'auth_signup_trigger' || row.object_key !== 'auth.users.on_auth_user_created' || row.definition.enabled !== 'O' ||
      row.definition.function !== 'public.handle_new_user' || !DIGEST.test(row.definition.definition_sha256 ?? '')) throw new Error(`${label} auth trigger identity rejected.`);
}
function validateLedger(rows, label) {
  const versions = Array.from({ length: 96 }, (_, index) => String(index + 1).padStart(4, '0'));
  validateRows(rows, 'ledger', label);
  if (rows.length !== 96 || rows.some((row, index) => row.category !== 'ledger_version' || row.object_key !== versions[index] ||
      keys(row.definition) !== 'version' || row.definition.version !== versions[index])) throw new Error(`${label} ledger must be exactly 0001 through 0096.`);
}
function expectedQuery(type, local = false) {
  const filename = local && type === 'auth-signup-trigger' ? 'local-auth-signup-trigger-readonly.sql' : QUERY_FILES[type];
  return { filename, sha256: sha256(canonicalFile(filename, 'Query')) };
}

function loadAuthorities(pinPath, pinDigest, anchorPath, anchorDigest) {
  const pin = validateApprovedLocalPin(authorityFile(pinPath, pinDigest, 'Local pin'), pinDigest);
  if (normalizedJson(pin.package) !== normalizedJson(localPackageIdentity())) throw new Error('Approved local package identity drift.');
  const anchorBytes = authorityFile(anchorPath, anchorDigest, 'Staging anchor');
  let anchor; try { anchor = JSON.parse(anchorBytes); } catch { throw new Error('Staging approved anchor JSON rejected.'); }
  exact(anchor.packageSha256, PACKAGE_FILES, 'Staging approved package keyset');
  const actualPackage = Object.fromEntries(PACKAGE_FILES.map((filename) => [filename, sha256(canonicalFile(filename, 'Staging package'))]));
  validateExternalApproval(anchor, actualPackage);
  return { pin, anchor, actualPackage };
}

function validateRuntime(observed, pin, label) {
  exact(observed, ['containerId', 'containerProjectionSha256', 'entrypointCommandSha256', 'psqlAbsolutePath', 'psqlSha256', 'psqlVersion', 'connection', 'database'], label);
  exact(observed.connection, ['transport', 'socket', 'database', 'user'], `${label} connection`);
  exact(observed.database, ['server_version_num', 'current_database', 'database_oid', 'system_identifier', 'ledger_versions'], `${label} database`);
  const expected = { containerId: pin.container.id, containerProjectionSha256: pin.container.stableProjectionSha256,
    entrypointCommandSha256: pin.container.entrypointCommandSha256, psqlAbsolutePath: pin.psql.absolutePath,
    psqlSha256: pin.psql.executableSha256, psqlVersion: pin.psql.version,
    connection: { transport: 'local-unix-socket', socket: '/var/run/postgresql', database: 'postgres', user: 'postgres' },
    database: { server_version_num: pin.database.serverVersionNum, current_database: pin.database.currentDatabase,
      database_oid: pin.database.databaseOid, system_identifier: pin.database.systemIdentifier, ledger_versions: pin.ledgerVersions } };
  if (normalizedJson(observed) !== normalizedJson(expected)) throw new Error(`${label} does not match approved local runtime.`);
}

function loadLocal(input, pin, pinDigest) {
  const root = bundleRoot(input, 'Canonical');
  const { bytes: manifestBytes, value: manifest } = jsonFile(root, 'manifest.json', 'Canonical');
  const detached = path.join(root, 'manifest.sha256');
  if (!existsSync(detached) || lstatSync(detached).isSymbolicLink() || !lstatSync(detached).isFile() || !/^[0-9a-f]{64}\n$/u.test(readFileSync(detached, 'utf8')) ||
      readFileSync(detached, 'utf8').trim() !== sha256(manifestBytes)) throw new Error('Canonical manifest SHA-256 mismatch.');
  exact(manifest, ['formatVersion', 'source', 'container', 'pinSha256', 'claim', 'observedIdentityBefore', 'observedIdentityAfter', 'replayProvenance', 'replayProvenanceSha256', 'planSha256', 'evidence'], 'Canonical manifest');
  if (manifest.formatVersion !== 1 || manifest.source !== 'disposable-local-supabase' || manifest.container !== DISPOSABLE_CONTAINER || manifest.pinSha256 !== pinDigest ||
      manifest.claim !== 'canonical-replay-0001-0096' || manifest.planSha256 !== sha256(normalizedJson(LOCAL_QUERY_PLAN))) throw new Error('Canonical source, claim, container, pin, or plan binding rejected.');
  validateRuntime(manifest.observedIdentityBefore, pin, 'Canonical runtime before'); validateRuntime(manifest.observedIdentityAfter, pin, 'Canonical runtime after');
  if (normalizedJson(manifest.observedIdentityBefore) !== normalizedJson(manifest.observedIdentityAfter)) throw new Error('Canonical runtime changed during collection.');
  const provenance = replayProvenance();
  if (manifest.replayProvenanceSha256 !== sha256(normalizedJson(provenance)) || normalizedJson(manifest.replayProvenance) !== normalizedJson(provenance)) throw new Error('Canonical replay provenance rejected.');
  exact(manifest.evidence, LOCAL_TYPES, 'Canonical evidence map');
  const allowed = new Set(['manifest.json', 'manifest.sha256']); const records = {};
  for (const type of LOCAL_TYPES) {
    const entry = manifest.evidence[type]; exact(entry, ['filename', 'sha256', 'rowCount'], `Canonical manifest entry ${type}`);
    if (entry.filename !== `${type}.json` || !DIGEST.test(entry.sha256 ?? '') || !Number.isSafeInteger(entry.rowCount) || entry.rowCount < 0) throw new Error(`Canonical manifest entry rejected: ${type}.`);
    allowed.add(entry.filename); const { bytes, value } = jsonFile(root, entry.filename, 'Canonical');
    if (sha256(bytes) !== entry.sha256) throw new Error(`Canonical file hash mismatch: ${type}.`);
    exact(value, ['formatVersion', 'evidenceType', 'container', 'queryFilename', 'querySha256', 'rows'], `Canonical evidence ${type}`);
    const query = expectedQuery(type, true);
    if (value.formatVersion !== 1 || value.evidenceType !== type || value.container !== DISPOSABLE_CONTAINER || value.queryFilename !== query.filename || value.querySha256 !== query.sha256) throw new Error(`Canonical evidence identity rejected: ${type}.`);
    validateRows(value.rows, type, 'Canonical'); if (value.rows.length !== entry.rowCount) throw new Error(`Canonical row count rejected: ${type}.`);
    records[type] = value.rows;
  }
  const extras = readdirSync(root).filter((filename) => !allowed.has(filename)); if (extras.length) throw new Error(`Canonical unexpected file: ${extras.sort()[0]}.`);
  validateLedger(records['replay-ledger'], 'Canonical'); validateAuth(records['auth-signup-trigger'], 'Canonical');
  return { records, serverVersion: pin.database.serverVersionNum };
}

function currentArtifacts(actualPackage) {
  const frozen = JSON.parse(canonicalFile('frozen-artifacts.json', 'Frozen artifacts'));
  exact(frozen, ['formatVersion', 'artifactSha256', 'catalogFunctions', 'catalogRelations'], 'Frozen artifacts root');
  const artifactSha256 = {};
  for (const [filename, expected] of Object.entries(frozen.artifactSha256)) {
    if (!DIGEST.test(expected ?? '')) throw new Error(`Frozen artifact digest rejected: ${filename}.`);
    const actual = sha256(canonicalFile(filename, 'Receipt artifact'));
    if (actual !== expected) throw new Error(`Frozen artifact drift: ${filename}.`); artifactSha256[filename] = actual;
  }
  return { ...artifactSha256, ...actualPackage };
}
function validateReceipt(receipt, anchor, actualPackage) {
  exact(receipt, ['formatVersion', 'projectRef', 'cli', 'artifacts', 'nonce', 'issuedAt', 'expiresAt', 'receiptSha256'], 'Staging receipt');
  exact(receipt.cli, ['executable', 'version', 'sha256'], 'Staging receipt CLI');
  const { receiptSha256, ...body } = receipt;
  if (receipt.formatVersion !== 1 || receipt.projectRef !== PROJECT_REF || !DIGEST.test(receiptSha256 ?? '') || sha256(normalizedJson(body)) !== receiptSha256 || !/^[A-Za-z0-9_-]{24,}$/u.test(receipt.nonce ?? '')) throw new Error('Staging receipt hash, project, or nonce rejected.');
  const provenance = JSON.parse(canonicalFile('supabase-2.110.0-json-envelope-provenance.json', 'CLI provenance'));
  const approvedCli = { executable: provenance.cli.canonicalPath, version: provenance.cli.version, sha256: provenance.cli.sha256 };
  if (normalizedJson(receipt.cli) !== normalizedJson(approvedCli)) throw new Error('Staging receipt CLI identity rejected.');
  if (normalizedJson(receipt.artifacts) !== normalizedJson(currentArtifacts(actualPackage))) throw new Error('Staging receipt artifact or package identity rejected.');
  const issued = Date.parse(receipt.issuedAt), expires = Date.parse(receipt.expiresAt);
  if (![issued, expires].every(Number.isFinite) || expires <= issued || expires - issued > 300_000 || issued < Date.parse(anchor.approvedAt) || expires > Date.parse(anchor.expiresAt)) throw new Error('Staging receipt time binding rejected.');
  return receipt;
}
function validateCommand(command, type, querySha256, receipt) {
  exact(command, ['executableSha256', 'args', 'status', 'stdoutSha256', 'stderrSha256'], `Staging command ${type}`);
  if (command.executableSha256 !== receipt.cli.sha256 || command.status !== 0 || !DIGEST.test(command.stdoutSha256 ?? '') || !DIGEST.test(command.stderrSha256 ?? '') ||
      !Array.isArray(command.args) || command.args.length !== 7 || command.args[0] !== 'db' || command.args[1] !== 'query' || command.args[2] !== '--linked' ||
      command.args[3] !== '--file' || path.basename(command.args[4] ?? '') !== `${querySha256}.sql` || command.args[5] !== '--output-format' || command.args[6] !== 'json') throw new Error(`Staging command identity rejected: ${type}.`);
}
function loadStaging(input, anchor, actualPackage) {
  const root = bundleRoot(input, 'Staging');
  const requiredFiles = new Set(['receipt.json', ...STAGING_REQUIRED.map((type) => `${type}.json`)]);
  const allowedFiles = new Set([...requiredFiles, ...STAGING_OPTIONAL.map((type) => `${type}.json`)]);
  const filenames = readdirSync(root); const extras = filenames.filter((filename) => !allowedFiles.has(filename));
  if (extras.length) throw new Error(`Staging unexpected file: ${extras.sort()[0]}.`);
  for (const filename of requiredFiles) if (!filenames.includes(filename)) throw new Error(`Staging missing required file: ${filename}.`);
  const receipt = validateReceipt(jsonFile(root, 'receipt.json', 'Staging').value, anchor, actualPackage); const records = {};
  for (const filename of filenames.filter((name) => name !== 'receipt.json').sort()) {
    const type = filename.slice(0, -5); const wrapper = jsonFile(root, filename, 'Staging').value;
    exact(wrapper, ['envelope', 'command'], `Staging wrapper ${type}`); const envelope = wrapper.envelope;
    exact(envelope, ['formatVersion', 'evidenceType', 'receiptSha256', 'projectRef', 'nonce', 'querySha256', 'collectedAt', 'records', 'evidenceSha256'], `Staging envelope ${type}`);
    const { evidenceSha256, ...body } = envelope; const query = expectedQuery(type);
    if (envelope.formatVersion !== 1 || envelope.evidenceType !== type || envelope.receiptSha256 !== receipt.receiptSha256 || envelope.projectRef !== receipt.projectRef ||
        envelope.nonce !== receipt.nonce || envelope.querySha256 !== query.sha256 || !DIGEST.test(evidenceSha256 ?? '') || sha256(normalizedJson(body)) !== evidenceSha256) throw new Error(`Staging envelope authority rejected: ${type}.`);
    const collected = Date.parse(envelope.collectedAt);
    if (!Number.isFinite(collected) || collected < Date.parse(receipt.issuedAt) || collected >= Date.parse(receipt.expiresAt)) throw new Error(`Staging collection time rejected: ${type}.`);
    validateCommand(wrapper.command, type, query.sha256, receipt); validateRows(envelope.records, type, 'Staging'); records[type] = envelope.records;
  }
  const ledgerPresent = records['ledger-presence'].length === 1 && records['ledger-presence'][0]?.definition?.relation === 'supabase_migrations.schema_migrations';
  if (ledgerPresent !== Object.hasOwn(records, 'ledger')) throw new Error('Staging optional ledger evidence presence rejected.');
  const cronPresent = records['cron-presence'].length === 1 && records['cron-presence'][0]?.definition?.relation === 'cron.job';
  if (cronPresent !== Object.hasOwn(records, 'cron-config')) throw new Error('Staging optional cron evidence presence rejected.');
  if (Object.hasOwn(records, 'ledger')) validateLedger(records.ledger, 'Staging');
  validateAuth(records['auth-signup-trigger'], 'Staging');
  const versions = records['server-version'];
  if (versions.length !== 1 || versions[0].category !== 'postgres_server_version' || versions[0].object_key !== 'server' || keys(versions[0].definition) !== 'server_version_num' || !/^\d{6}$/u.test(versions[0].definition.server_version_num ?? '')) throw new Error('Staging server-version evidence rejected.');
  return { records, serverVersion: versions[0].definition.server_version_num, historyKnown: Object.hasOwn(records, 'ledger') };
}

export function compareEvidenceBundles(canonicalBundlePath, stagingBundlePath, localPinPath, localPinDigest, stagingAnchorPath, stagingAnchorDigest) {
  if (arguments.length !== 6) throw new Error('Both external approved local pin and staging anchor paths with exact digests are required.');
  const authority = loadAuthorities(localPinPath, localPinDigest, stagingAnchorPath, stagingAnchorDigest);
  const canonical = loadLocal(canonicalBundlePath, authority.pin, localPinDigest);
  const staging = loadStaging(stagingBundlePath, authority.anchor, authority.actualPackage);
  const comparisons = COMPARISON_TYPES.map((evidenceType) => {
    const canonicalSha256 = sha256(normalizedJson(canonicalRows(canonical.records[evidenceType])));
    const stagingSha256 = sha256(normalizedJson(canonicalRows(staging.records[evidenceType])));
    return { evidenceType, equal: canonicalSha256 === stagingSha256, canonicalSha256, stagingSha256 };
  });
  const auth = comparisons.find(({ evidenceType }) => evidenceType === 'auth-signup-trigger');
  const localDefinition = canonical.records['auth-signup-trigger'][0].definition, stagingDefinition = staging.records['auth-signup-trigger'][0].definition;
  return canonicalize({ formatVersion: 1, status: comparisons.every(({ equal }) => equal) ? 'EQUIVALENT' : 'MISMATCH',
    claim: 'FINAL_STATE_EQUIVALENT_BASELINE_0001_0096', stagingProjectRef: PROJECT_REF,
    authority: { localPinSha256: localPinDigest, stagingAnchorSha256: stagingAnchorDigest, stagingReceiptSha256: jsonFile(bundleRoot(stagingBundlePath, 'Staging'), 'receipt.json', 'Staging').value.receiptSha256 },
    serverVersions: { canonical: canonical.serverVersion, staging: staging.serverVersion },
    history: staging.historyKnown ? { status: 'VERIFIED', range: '0001-0096' } : { status: 'UNKNOWN', reason: 'STAGING_LEDGER_ABSENT' },
    operationalCountsCompared: false,
    authTrigger: { equal: auth.equal, formattingSensitive: !auth.equal && localDefinition.enabled === stagingDefinition.enabled && localDefinition.function === stagingDefinition.function && localDefinition.definition_sha256 !== stagingDefinition.definition_sha256, hardStop: !auth.equal }, comparisons });
}

function invalidReport(error) { return canonicalize({ formatVersion: 1, status: 'INVALID', error: { code: 'EVIDENCE_REJECTED', message: error instanceof Error ? error.message : String(error) } }); }
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 8) throw new Error('Usage: canonical-evidence-compare <canonical-bundle> <staging-bundle> <approved-local-pin> <approved-local-pin-sha256> <approved-staging-anchor> <approved-staging-anchor-sha256>.');
    const report = compareEvidenceBundles(...process.argv.slice(2).map((value, index) => index === 3 || index === 5 ? value : path.resolve(value)));
    process.stdout.write(normalizedJson(report)); if (report.status !== 'EQUIVALENT') process.exitCode = 2;
  } catch (error) { process.stdout.write(normalizedJson(invalidReport(error))); process.exitCode = 1; }
}
