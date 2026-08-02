#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  analyzeMigration,
  buildInvariantInventory,
  assertCatalogIdentifiersAllowlisted,
  assertCatalogMatch,
  assertCliVersion,
  assertReadOnlyCatalogSql,
  createPreflightReceipt,
  enumeratePathExecutableCandidates,
  hashFiles,
  normalizedJson,
  optionalLedgerScriptForPresence,
  optionalCronScriptForPresence,
  readLinkedProjectRef,
  sha256,
  selectCliExecutable,
  validateStatusManifest,
  validateExternalApproval,
  verifyFrozenInventory,
  verifyPreflightReceipt,
  verifyEvidenceEnvelope,
} from './core.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, '../..');
const migrationRoot = path.join(projectRoot, 'supabase', 'migrations');
const supabaseRoot = path.join(projectRoot, 'supabase');
function verifyExternalApproval(anchorPath, approvedDigest) {
  if (!anchorPath || !/^[0-9a-f]{64}$/.test(approvedDigest ?? '')) {
    throw new Error('An external approval-anchor path and its user-approved SHA-256 digest are required.');
  }
  const absolute = path.resolve(anchorPath);
  if (absolute.startsWith(`${directory}${path.sep}`)) {
    throw new Error('Approval anchor must be stored outside the audit package.');
  }
  const anchorBytes = readFileSync(absolute);
  if (sha256(anchorBytes) !== approvedDigest) throw new Error('User-approved external anchor digest mismatch.');
  const anchor = JSON.parse(anchorBytes);
  const actual = {
    'core.mjs': sha256(readFileSync(path.join(directory, 'core.mjs'))),
    'audit.mjs': sha256(readFileSync(path.join(directory, 'audit.mjs'))),
    'frozen-artifacts.json': sha256(readFileSync(path.join(directory, 'frozen-artifacts.json'))),
    'core.test.mjs': sha256(readFileSync(path.join(directory, 'core.test.mjs'))),
    'one-process-executor.mjs': sha256(readFileSync(path.join(directory, 'one-process-executor.mjs'))),
    'bounded-subprocess.mjs': sha256(readFileSync(path.join(directory, 'bounded-subprocess.mjs'))),
    'collector.test.mjs': sha256(readFileSync(path.join(directory, 'collector.test.mjs'))),
    'collect-readonly.mjs': sha256(readFileSync(path.join(directory, 'collect-readonly.mjs'))),
    'inspect-windows-acl.ps1': sha256(readFileSync(path.join(directory, 'inspect-windows-acl.ps1'))),
    'supabase-2.110.0-json-envelope-provenance.json': sha256(
      readFileSync(path.join(directory, 'supabase-2.110.0-json-envelope-provenance.json')),
    ),
  };
  validateExternalApproval(anchor, actual);
  return anchor;
}

const artifactFreeze = JSON.parse(readFileSync(path.join(directory, 'frozen-artifacts.json'), 'utf8'));
const catalogDecomposition = JSON.parse(
  readFileSync(path.join(directory, 'catalog-decomposition.json'), 'utf8'),
);

function fail(message) {
  process.stderr.write(`HARD STOP: ${message}\n`);
  process.exitCode = 1;
}

function resolveCliExecutable() {
  const executableName = process.platform === 'win32' ? 'supabase.exe' : 'supabase';
  const candidates = enumeratePathExecutableCandidates(executableName);
  return selectCliExecutable(candidates, process.platform, (candidate) => ({
    isFile: statSync(candidate).isFile(),
  }));
}

function inspectCli() {
  const executable = resolveCliExecutable();
  const output = execFileSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true }).trim();
  const version = output.match(/\d+\.\d+\.\d+/)?.[0] ?? '';
  assertCliVersion(version);
  return { executable, version, sha256: sha256(readFileSync(executable)) };
}

function currentArtifacts() {
  const filenames = Object.keys(artifactFreeze.artifactSha256);
  const actual = hashFiles(directory, filenames);
  for (const filename of filenames) {
    if (actual[filename] !== artifactFreeze.artifactSha256[filename]) {
      throw new Error(`Frozen audit artifact hash drift: ${filename}.`);
    }
  }
  return {
    ...actual,
    'audit.mjs': sha256(readFileSync(path.join(directory, 'audit.mjs'))),
    'core.mjs': sha256(readFileSync(path.join(directory, 'core.mjs'))),
    'core.test.mjs': sha256(readFileSync(path.join(directory, 'core.test.mjs'))),
    'frozen-artifacts.json': sha256(readFileSync(path.join(directory, 'frozen-artifacts.json'))),
  };
}

function localSafetyChecks() {
  const frozen = JSON.parse(readFileSync(path.join(directory, 'frozen-ledger.json'), 'utf8'));
  const manifest = JSON.parse(
    readFileSync(path.join(directory, 'version-status-manifest.json'), 'utf8'),
  );
  const invariantInventory = JSON.parse(
    readFileSync(path.join(directory, 'invariant-inventory.json'), 'utf8'),
  );
  verifyFrozenInventory(migrationRoot, frozen);
  if (
    normalizedJson(invariantInventory) !==
    normalizedJson(buildInvariantInventory(frozen, migrationRoot))
  ) throw new Error('Frozen invariant inventory drift.');
  validateStatusManifest(frozen, manifest, invariantInventory);
  for (const filename of [
    'catalog-readonly.sql',
    'catalog-presence-readonly.sql',
    'catalog-ledger-readonly.sql',
    'catalog-operational-readonly.sql',
    'deterministic-config-readonly.sql',
    'cron-presence-readonly.sql',
    'cron-config-readonly.sql',
    catalogDecomposition.runtimeUnion.filename,
    ...catalogDecomposition.orderedQueries.map((entry) => entry.filename),
  ]) {
    const sql = readFileSync(path.join(directory, filename), 'utf8');
    assertReadOnlyCatalogSql(sql);
    assertCatalogIdentifiersAllowlisted(sql, artifactFreeze);
  }
  return frozen;
}

function verifyReceiptPath(receiptPath, anchorPath, approvedDigest) {
  if (!receiptPath) throw new Error('A preflight receipt JSON path is required.');
  verifyExternalApproval(anchorPath, approvedDigest);
  const projectRef = readLinkedProjectRef(supabaseRoot);
  const cli = inspectCli();
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  verifyPreflightReceipt(
    receipt,
    { projectRef, cli, artifacts: currentArtifacts() },
  );
  return receipt;
}

try {
  const [command, ...args] = process.argv.slice(2);
  const frozen = localSafetyChecks();

  if (command === 'analyze') {
    const analysis = frozen.migrations.map((entry) =>
      analyzeMigration(
        entry.filename,
        readFileSync(path.join(migrationRoot, entry.filename), 'utf8'),
      ),
    );
    process.stdout.write(
      `${JSON.stringify({ formatVersion: 2, migrations: analysis }, null, 2)}\n`,
    );
  } else if (command === 'preflight') {
    const [anchorPath, approvedDigest] = args;
    verifyExternalApproval(anchorPath, approvedDigest);
    const projectRef = readLinkedProjectRef(supabaseRoot);
    const cli = inspectCli();
    const issued = new Date();
    const receipt = createPreflightReceipt({
      projectRef,
      cliExecutable: cli.executable,
      cliVersion: cli.version,
      cliSha256: cli.sha256,
      artifacts: currentArtifacts(),
      nonce: randomBytes(24).toString('base64url'),
      issuedAt: issued.toISOString(),
      expiresAt: new Date(issued.getTime() + 5 * 60_000).toISOString(),
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else if (command === 'verify-receipt') {
    const [receiptPath, anchorPath, approvedDigest] = args;
    verifyReceiptPath(receiptPath, anchorPath, approvedDigest);
    process.stdout.write(
      'RECEIPT VERIFIED. Database execution remains disabled in this runner.\n',
    );
  } else if (command === 'plan') {
    const [receiptPath, presencePath, cronPresencePath, anchorPath, approvedDigest] = args;
    const receipt = verifyReceiptPath(receiptPath, anchorPath, approvedDigest);
    if (!presencePath) throw new Error('plan requires a ledger-presence JSON path.');
    if (!cronPresencePath) throw new Error('plan requires a cron-presence JSON path.');
    const presence = JSON.parse(readFileSync(presencePath, 'utf8'));
    const cronPresence = JSON.parse(readFileSync(cronPresencePath, 'utf8'));
    const presenceQueryHash = sha256(readFileSync(path.join(directory, 'catalog-presence-readonly.sql')));
    verifyEvidenceEnvelope(presence, receipt, 'ledger-presence', presenceQueryHash, 1);
    const cronPresenceQueryHash = sha256(readFileSync(path.join(directory, 'cron-presence-readonly.sql')));
    verifyEvidenceEnvelope(cronPresence, receipt, 'cron-presence', cronPresenceQueryHash, 1);
    process.stdout.write(
      `${JSON.stringify(
        {
          databaseExecution: false,
          authority: 'INFORMATIONAL_ONLY',
          catalogQuery: catalogDecomposition.runtimeUnion.filename,
          optionalLedgerCatalog: optionalLedgerScriptForPresence(presence.records),
          optionalCronConfig: optionalCronScriptForPresence(cronPresence.records),
        },
        null,
        2,
      )}\n`,
    );
  } else if (command === 'compare') {
    const [canonicalPath, remotePath] = args;
    if (!canonicalPath || !remotePath) throw new Error('compare requires canonical and remote JSON paths.');
    const allowlist = JSON.parse(readFileSync(path.join(directory, 'allowlist.json'), 'utf8'));
    const result = assertCatalogMatch(
      JSON.parse(readFileSync(canonicalPath, 'utf8')),
      JSON.parse(readFileSync(remotePath, 'utf8')),
      allowlist,
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    throw new Error(
      'Use analyze, preflight, verify-receipt <receipt.json>, plan <receipt.json> <presence.json>, or compare <canonical.json> <remote.json>.',
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
