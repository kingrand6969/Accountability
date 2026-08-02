#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync,
  realpathSync, lstatSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import {
  assertCatalogIdentifiersAllowlisted, assertCliVersion, assertReadOnlyCatalogSql,
  assertReadOnlyCurrentStateSql,
  createPreflightReceipt, enumeratePathExecutableCandidates, hashFiles, readLinkedProjectRef,
  selectCliExecutable, sha256,
  validateExternalApproval, verifyPreflightReceipt,
  verifyEvidenceEnvelope,
} from './core.mjs';
import { createReadOnlyCollector } from './one-process-executor.mjs';
import { runBoundedSubprocess } from './bounded-subprocess.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, '../..');
const supabaseRoot = path.join(projectRoot, 'supabase');
const freeze = JSON.parse(readFileSync(path.join(directory, 'frozen-artifacts.json'), 'utf8'));
const TIMEOUT_MS = 15_000;
const SUBPROCESS_BUFFER_CAP_BYTES = 16 * 1024 * 1024;
const PINNED_CLI_SHA256 = '14814afa6fe59081eb9f24709fc077226bf89bc25cf77ee3bcb19565f3ef8899';
const ALLOWLISTED_SQLSTATES = new Set([
  '0A000', '25006', '42501', '42601', '42703', '42883', '42P01', '57014',
]);
const DIAGNOSTIC_STRUCTURAL_KEYS = new Set([
  '_tag', 'code', 'detail', 'error', 'message', 'name', 'suggestion',
]);
const DIAGNOSTIC_MAX_DEPTH = 4;
const DIAGNOSTIC_MAX_KEYS = 16;
const DIAGNOSTIC_MAX_ITEMS = 8;
const LEGACY_UNEXPECTED_STATUS_CODE = 'LegacyDbQueryUnexpectedStatusError';
const LEGACY_UNEXPECTED_STATUS_MESSAGE_CAP_BYTES = 64 * 1024;
const LEGACY_UNEXPECTED_STATUS_HTTP_ALLOWLIST = new Set([
  400, 401, 403, 404, 408, 409, 413, 422, 429,
  500, 501, 502, 503, 504,
]);
const RUNTIME_SQL_FILENAMES = Object.freeze([
  'catalog-presence-readonly.sql',
  'cron-presence-readonly.sql',
  'catalog-union-readonly.sql',
  'deterministic-config-readonly.sql',
  'current-state-flags-readonly.sql',
  'auth-signup-trigger-readonly.sql',
  'server-version-readonly.sql',
  'catalog-operational-readonly.sql',
  'catalog-ledger-readonly.sql',
  'cron-config-readonly.sql',
  'deterministic-config-rate-limit-readonly.sql',
  'deterministic-config-storage-bucket-readonly.sql',
  'deterministic-config-official-challenge-readonly.sql',
  'catalog-diagnostic-01-10-readonly.sql',
  'catalog-diagnostic-01-05-readonly.sql',
  'catalog-diagnostic-01-03-readonly.sql',
  'catalog-diagnostic-01-02-readonly.sql',
  'catalog-diagnostic-04-05-readonly.sql',
  'catalog-diagnostic-06-10-readonly.sql',
  'catalog-diagnostic-06-08-readonly.sql',
  'catalog-diagnostic-06-07-readonly.sql',
  'catalog-diagnostic-09-10-readonly.sql',
  'catalog-diagnostic-11-19-readonly.sql',
  'catalog-diagnostic-11-15-readonly.sql',
  'catalog-diagnostic-11-13-readonly.sql',
  'catalog-diagnostic-11-12-readonly.sql',
  'catalog-diagnostic-14-15-readonly.sql',
  'catalog-diagnostic-16-19-readonly.sql',
  'catalog-diagnostic-16-17-readonly.sql',
  'catalog-diagnostic-18-19-readonly.sql',
  'catalog-01-relation-readonly.sql',
  'catalog-02-relation-privilege-readonly.sql',
  'catalog-03-column-readonly.sql',
  'catalog-04-column-privilege-readonly.sql',
  'catalog-05-constraint-readonly.sql',
  'catalog-06-routine-privilege-readonly.sql',
  'catalog-07-index-readonly.sql',
  'catalog-08-policy-readonly.sql',
  'catalog-09-view-readonly.sql',
  'catalog-10-materialized-view-readonly.sql',
  'catalog-11-sequence-readonly.sql',
  'catalog-12-type-readonly.sql',
  'catalog-13-routine-readonly.sql',
  'catalog-14-trigger-readonly.sql',
  'catalog-15-table-grant-readonly.sql',
  'catalog-16-default-privilege-readonly.sql',
  'catalog-17-extension-readonly.sql',
  'catalog-18-publication-readonly.sql',
  'catalog-19-storage-bucket-readonly.sql',
]);
let activeCli = null;
let activeWindowsSystemTools = null;
let queryCopyRoot = null;
const approvedQueryCopies = new Map();

export function extractAllowlistedSqlState(stderr) {
  if (typeof stderr !== 'string' || Buffer.byteLength(stderr, 'utf8') > SUBPROCESS_BUFFER_CAP_BYTES) {
    return null;
  }
  for (const line of stderr.split(/\r?\n/u).slice(0, 4096)) {
    const match = line.match(
      /^\s*(?:SQLSTATE(?:\s*[\[:=]\s*|\s+)|code:\s*["']?)([0-9A-Z]{5})(?:["'\]]|\s|$)/u,
    );
    if (match && ALLOWLISTED_SQLSTATES.has(match[1])) return match[1];
  }
  return null;
}

function scalarFingerprint(value) {
  const type = value === null ? 'null' : typeof value;
  if (value === null) return { type };
  const encoded = type === 'string' ? value : JSON.stringify(value);
  return {
    type,
    utf8Bytes: Buffer.byteLength(encoded, 'utf8'),
    sha256: sha256(encoded),
  };
}

function fingerprintJsonValue(value, depth = 0) {
  if (value === null || !['object'].includes(typeof value)) return scalarFingerprint(value);
  if (depth >= DIAGNOSTIC_MAX_DEPTH) {
    return { type: Array.isArray(value) ? 'array' : 'object', depthCapped: true };
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      count: value.length,
      items: value.slice(0, DIAGNOSTIC_MAX_ITEMS).map(
        (item) => fingerprintJsonValue(item, depth + 1),
      ),
      itemsCapped: value.length > DIAGNOSTIC_MAX_ITEMS,
    };
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return {
    type: 'object',
    keyCount: entries.length,
    entries: entries.slice(0, DIAGNOSTIC_MAX_KEYS).map(([key, item]) => ({
      ...(DIAGNOSTIC_STRUCTURAL_KEYS.has(key)
        ? { key }
        : {
            keySha256: sha256(key),
            keyUtf8Bytes: Buffer.byteLength(key, 'utf8'),
          }),
      value: fingerprintJsonValue(item, depth + 1),
    })),
    keysCapped: entries.length > DIAGNOSTIC_MAX_KEYS,
  };
}

export function boundedJsonStructure(raw) {
  if (
    typeof raw !== 'string' ||
    Buffer.byteLength(raw, 'utf8') > SUBPROCESS_BUFFER_CAP_BYTES
  ) return null;
  try {
    return fingerprintJsonValue(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function extractAllowlistedJsonSqlState(raw) {
  if (
    typeof raw !== 'string' ||
    Buffer.byteLength(raw, 'utf8') > SUBPROCESS_BUFFER_CAP_BYTES
  ) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const direct = value.code;
  if (typeof direct === 'string' && ALLOWLISTED_SQLSTATES.has(direct)) return direct;
  const nested = value.error;
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
  return typeof nested.code === 'string' && ALLOWLISTED_SQLSTATES.has(nested.code)
    ? nested.code
    : null;
}

export function legacyUnexpectedStatusDiagnostic(raw) {
  if (
    typeof raw !== 'string' ||
    Buffer.byteLength(raw, 'utf8') > SUBPROCESS_BUFFER_CAP_BYTES
  ) return null;
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
    Object.keys(envelope).sort().join(',') !== '_tag,error' ||
    envelope._tag !== 'Error' ||
    !envelope.error || typeof envelope.error !== 'object' || Array.isArray(envelope.error) ||
    Object.keys(envelope.error).sort().join(',') !== 'code,message' ||
    envelope.error.code !== LEGACY_UNEXPECTED_STATUS_CODE ||
    typeof envelope.error.message !== 'string' ||
    Buffer.byteLength(envelope.error.message, 'utf8') >
      LEGACY_UNEXPECTED_STATUS_MESSAGE_CAP_BYTES
  ) return null;
  const match = /^unexpected status ([0-9]{3}): ([\s\S]*)$/u.exec(envelope.error.message);
  if (!match) return null;
  const status = Number(match[1]);
  const body = match[2];
  return {
    code: LEGACY_UNEXPECTED_STATUS_CODE,
    httpStatus: LEGACY_UNEXPECTED_STATUS_HTTP_ALLOWLIST.has(status) ? status : null,
    body: {
      utf8Bytes: Buffer.byteLength(body, 'utf8'),
      sha256: sha256(body),
      json: boundedJsonStructure(body),
    },
    sqlstate: extractAllowlistedJsonSqlState(body),
  };
}

export function subprocessFailureMetadata(result) {
  const stdout = typeof result?.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result?.stderr === 'string' ? result.stderr : '';
  const errorCode = result?.error?.code === 'ETIMEDOUT' ? 'ETIMEDOUT' : null;
  const legacyUnexpectedStatus = legacyUnexpectedStatusDiagnostic(stdout);
  return {
    formatVersion: 1,
    exitCode: Number.isSafeInteger(result?.status) ? result.status : null,
    timeout: errorCode === 'ETIMEDOUT',
    errorCode,
    stdout: {
      utf8Bytes: Buffer.byteLength(stdout, 'utf8'),
      sha256: sha256(stdout),
    },
    stdoutJson: boundedJsonStructure(stdout),
    legacyUnexpectedStatus,
    stderr: {
      utf8Bytes: Buffer.byteLength(stderr, 'utf8'),
      sha256: sha256(stderr),
    },
    sqlstate:
      legacyUnexpectedStatus?.sqlstate ??
      extractAllowlistedJsonSqlState(stdout) ??
      extractAllowlistedSqlState(stdout) ??
      extractAllowlistedSqlState(stderr),
  };
}

export async function runWithVerifiedCleanup(action, cleanup) {
  let primaryError = null;
  let result;
  try {
    result = await action();
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error(String(error));
  }
  let cleanupFailed = false;
  try {
    await cleanup();
  } catch {
    cleanupFailed = true;
  }
  if (primaryError) {
    if (cleanupFailed) throw new Error(`${primaryError.message} CLEANUP_STATUS: FAILED.`);
    throw primaryError;
  }
  if (cleanupFailed) throw new Error('SQL cleanup failed. CLEANUP_STATUS: FAILED.');
  return result;
}

function cleanupStagedSqlCopies() {
  if (!queryCopyRoot || !existsSync(queryCopyRoot)) return;
  if (process.platform === 'win32') {
    const systemTools = trustedWindowsSystemTools();
    const principal = currentWindowsPrincipal(systemTools);
    restoreWindowsAclForCleanup(queryCopyRoot, principal, systemTools);
  }
  for (const entry of readdirSync(queryCopyRoot, { recursive: true }).reverse()) {
    try { chmodSync(path.join(queryCopyRoot, entry), 0o700); } catch {}
  }
  chmodSync(queryCopyRoot, 0o700);
  rmSync(queryCopyRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  if (existsSync(queryCopyRoot)) throw new Error('SQL cleanup postcondition failed.');
}

export function canonicalRegularFile(input, label) {
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(input)) throw new Error(`${label} traversal is forbidden.`);
  const absolute = path.resolve(input);
  const before = lstatSync(absolute);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`${label} must be a regular non-link file.`);
  const canonical = realpathSync.native(absolute);
  if (canonical !== absolute) throw new Error(`${label} must use its canonical path.`);
  return canonical;
}

export function assertSafeOutputTarget(outputDir) {
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(outputDir)) throw new Error('Output traversal is forbidden.');
  const absolute = path.resolve(outputDir);
  if (existsSync(absolute)) throw new Error('Output directory must not already exist.');
  const parent = path.dirname(absolute);
  if (!existsSync(parent)) throw new Error('Output parent must already exist.');
  const info = lstatSync(parent);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Output parent must be a real directory.');
  const canonical = realpathSync.native(parent);
  if (canonical !== parent) throw new Error('Output parent must use its canonical path.');
  if (canonical === projectRoot || canonical.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error('Output must be outside the project.');
  }
  return { absolute, canonicalParent: canonical };
}

export function resolveWindowsSystemTools(windowsTrust) {
  const systemRoot = windowsTrust?.systemRoot;
  if (!systemRoot || !path.isAbsolute(systemRoot)) throw new Error('Approved canonical Windows system root unavailable.');
  if (
    !windowsTrust.toolSha256 ||
    Object.keys(windowsTrust.toolSha256).sort().join(',') !== 'icacls,powershell,whoami' ||
    Object.values(windowsTrust.toolSha256).some((digest) => !/^[0-9a-f]{64}$/.test(digest))
  ) throw new Error('Approved Windows system-tool identities unavailable.');
  const rootAbsolute = path.resolve(systemRoot);
  const rootInfo = lstatSync(rootAbsolute);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Windows system root must be a real directory.');
  const rootCanonical = realpathSync.native(rootAbsolute);
  if (rootCanonical.toLowerCase() !== rootAbsolute.toLowerCase()) throw new Error('Windows system root must be canonical.');
  const systemAbsolute = path.join(rootCanonical, 'System32');
  const systemInfo = lstatSync(systemAbsolute);
  if (!systemInfo.isDirectory() || systemInfo.isSymbolicLink()) throw new Error('Windows System32 must be a real directory.');
  const systemDirectory = realpathSync.native(systemAbsolute);
  if (
    systemDirectory.toLowerCase() !== systemAbsolute.toLowerCase() ||
    !systemDirectory.toLowerCase().startsWith(`${rootCanonical.toLowerCase()}${path.sep}`)
  ) throw new Error('Windows System32 containment rejected.');
  const resolveTool = (relative, label) => {
    const candidate = path.join(systemDirectory, ...relative);
    const tool = canonicalRegularFile(candidate, label);
    if (!tool.toLowerCase().startsWith(`${systemDirectory.toLowerCase()}${path.sep}`)) {
      throw new Error(`${label} escaped canonical System32.`);
    }
    return tool;
  };
  const tools = {
    powershell: resolveTool(['WindowsPowerShell', 'v1.0', 'powershell.exe'], 'Windows PowerShell'),
    icacls: resolveTool(['icacls.exe'], 'Windows icacls'),
    whoami: resolveTool(['whoami.exe'], 'Windows whoami'),
    systemDirectory,
  };
  for (const name of ['powershell', 'icacls', 'whoami']) {
    if (sha256(readFileSync(tools[name])) !== windowsTrust.toolSha256[name]) {
      throw new Error(`Approved Windows ${name} identity mismatch.`);
    }
  }
  return Object.freeze(tools);
}

function trustedWindowsSystemTools() {
  if (!activeWindowsSystemTools) throw new Error('Externally approved Windows system-tool trust is unavailable.');
  return activeWindowsSystemTools;
}

function currentWindowsPrincipal(systemTools = trustedWindowsSystemTools()) {
  const result = spawnSync(systemTools.whoami, ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8', windowsHide: true, timeout: 3_000,
  });
  const sid = result.stdout?.match(/"[^"]*","(S-[0-9-]+)"/i)?.[1];
  if (result.status !== 0 || result.error || !sid) throw new Error('Windows account SID unavailable for evidence ACL.');
  return `*${sid}`;
}

function frozenAclHelperPath() {
  const filename = 'inspect-windows-acl.ps1';
  const helper = canonicalRegularFile(path.join(directory, filename), 'Windows ACL inspector');
  const expected = freeze.artifactSha256[filename];
  if (!expected || sha256(readFileSync(helper)) !== expected) {
    throw new Error('Windows ACL inspector hash mismatch.');
  }
  return helper;
}

function validateAclInspection(raw, expectedPaths, principal, rights) {
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    throw new Error('Windows ACL inspector output is not JSON.');
  }
  if (!Array.isArray(rows)) throw new Error('Windows ACL inspector output shape rejected.');
  const expected = new Set(expectedPaths.map((target) => path.resolve(target).toLowerCase()));
  const seen = new Set();
  const requiredRights = {
    '(OI)(CI)F': 2032127,
    R: 1179785,
    '(OI)(CI)RX': 1179817,
  }[rights];
  if (requiredRights === undefined) throw new Error('Unsupported Windows ACL rights.');
  const currentSid = principal.replace(/^\*/, '');
  const forbiddenBroadSids = new Set(['S-1-1-0', 'S-1-5-11', 'S-1-5-32-545']);
  for (const row of rows) {
    if (
      !row || Object.keys(row).sort().join(',') !== 'inheritanceProtected,rules,target' ||
      typeof row.target !== 'string' || typeof row.inheritanceProtected !== 'boolean' ||
      !Array.isArray(row.rules)
    ) throw new Error('Windows ACL inspector output shape rejected.');
    const target = path.resolve(row.target).toLowerCase();
    if (!expected.has(target) || seen.has(target)) throw new Error('Windows ACL target coverage rejected.');
    seen.add(target);
    if (!row.inheritanceProtected) throw new Error('Windows ACL inheritance postcondition failed.');
    const currentRules = [];
    for (const rule of row.rules) {
      if (
        !rule || Object.keys(rule).sort().join(',') !== 'accessType,inherited,rights,sid' ||
        typeof rule.sid !== 'string' || !Number.isSafeInteger(rule.rights) ||
        !['Allow', 'Deny'].includes(rule.accessType) || typeof rule.inherited !== 'boolean'
      ) throw new Error('Windows ACL rule shape rejected.');
      if (rule.inherited) throw new Error('Windows ACL inherited rule rejected.');
      if (forbiddenBroadSids.has(rule.sid)) throw new Error('Windows ACL broad principal rejected.');
      if (rule.sid === currentSid) currentRules.push(rule);
    }
    if (
      currentRules.length !== 1 ||
      currentRules[0].accessType !== 'Allow' ||
      currentRules[0].rights !== requiredRights ||
      currentRules[0].inherited
    ) throw new Error('Windows ACL current-principal rights rejected.');
  }
  if (seen.size !== expected.size) throw new Error('Windows ACL target coverage rejected.');
}

export function restrictAndVerifyWindowsAcl(
  directoryPath, principal, run = spawnSync, rights = '(OI)(CI)F',
  helperPath = frozenAclHelperPath(), systemTools = trustedWindowsSystemTools(),
) {
  const targetInfo = existsSync(directoryPath) ? lstatSync(directoryPath) : null;
  const paths = targetInfo?.isDirectory()
    ? [directoryPath, ...readdirSync(directoryPath, { recursive: true }).map((entry) => path.join(directoryPath, entry))]
    : [directoryPath];
  const explicitRights = { '(OI)(CI)F': 'F', R: 'R', '(OI)(CI)RX': 'RX' }[rights];
  if (!explicitRights) throw new Error('Unsupported Windows ACL rights.');
  for (const target of paths) {
    const restrict = run(systemTools.icacls, [
      target, '/inheritance:r', '/C',
    ], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
    if (restrict.status !== 0 || restrict.error) {
      throw new Error('Failed to restrict evidence directory ACL.');
    }
    const grant = run(systemTools.icacls, [
      target, '/grant:r', `${principal}:${explicitRights}`, '/C',
    ], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
    if (grant.status !== 0 || grant.error) {
      throw new Error('Failed to grant exact evidence ACL.');
    }
  }
  const inspect = run(systemTools.powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', helperPath, '-Root', directoryPath,
  ], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  if (inspect.status !== 0 || inspect.error) throw new Error('Windows ACL inspector failed.');
  validateAclInspection(inspect.stdout, paths, principal, rights);
}

export function restoreWindowsAclForCleanup(
  targetPath, principal, systemTools = trustedWindowsSystemTools(), run = spawnSync,
) {
  restrictAndVerifyWindowsAcl(
    targetPath, principal, run, '(OI)(CI)F', undefined, systemTools,
  );
}

function stageFrozenSqlCopies() {
  const rootCanonical = realpathSync.native(queryCopyRoot);
  const principal = process.platform === 'win32' ? currentWindowsPrincipal() : null;
  if (principal) restrictAndVerifyWindowsAcl(rootCanonical, principal, spawnSync, '(OI)(CI)F');
  for (const filename of RUNTIME_SQL_FILENAMES) {
    const expected = freeze.artifactSha256[filename];
    if (!/^[0-9a-f]{64}$/.test(expected ?? '')) throw new Error(`Unfrozen query: ${filename}.`);
    const source = canonicalRegularFile(path.join(directory, filename), 'Frozen SQL source');
    const bytes = readFileSync(source);
    const digest = sha256(bytes);
    if (digest !== expected) throw new Error(`Query hash drift: ${filename}.`);
    const sql = bytes.toString('utf8');
    if (filename === 'current-state-flags-readonly.sql') assertReadOnlyCurrentStateSql(sql);
    else assertReadOnlyCatalogSql(sql);
    assertCatalogIdentifiersAllowlisted(sql, freeze);
    const copy = path.join(rootCanonical, `${digest}.sql`);
    if (!existsSync(copy)) writeFileSync(copy, bytes, { flag: 'wx', mode: 0o400 });
    chmodSync(copy, 0o400);
    if (principal) restrictAndVerifyWindowsAcl(copy, principal, spawnSync, 'R');
    const canonicalCopy = canonicalRegularFile(copy, 'Frozen SQL copy');
    if (sha256(readFileSync(canonicalCopy)) !== digest) throw new Error('SQL copy hash mismatch.');
    approvedQueryCopies.set(canonicalCopy, digest);
  }
  if (principal) restrictAndVerifyWindowsAcl(rootCanonical, principal, spawnSync, '(OI)(CI)RX');
}

function packageHashes() {
  return {
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
}

function verifyApproval(anchorPath, digest) {
  const absolute = canonicalRegularFile(anchorPath, 'Approval anchor');
  if (absolute.startsWith(`${directory}${path.sep}`)) throw new Error('Approval must be outside the package.');
  const bytes = readFileSync(absolute);
  if (sha256(bytes) !== digest) throw new Error('User-approved anchor digest mismatch.');
  const anchor = JSON.parse(bytes);
  validateExternalApproval(anchor, packageHashes());
  return anchor;
}

function inspectCli() {
  const executableName = process.platform === 'win32' ? 'supabase.exe' : 'supabase';
  const candidates = enumeratePathExecutableCandidates(executableName);
  const executable = selectCliExecutable(
    candidates,
    process.platform,
    (candidate) => ({ isFile: statSync(candidate).isFile() }),
  );
  const canonicalExecutable = canonicalRegularFile(executable, 'Supabase CLI executable');
  const versionResult = spawnSync(canonicalExecutable, ['--version'], {
    encoding: 'utf8', windowsHide: true, timeout: 3_000,
  });
  if (versionResult.status !== 0 || versionResult.error) throw new Error('Supabase CLI version check failed.');
  const version = versionResult.stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? '';
  assertCliVersion(version);
  const executableSha256 = sha256(readFileSync(canonicalExecutable));
  if (executableSha256 !== PINNED_CLI_SHA256) throw new Error('Supabase CLI binary hash is not the approved 2.110.0 build.');
  const helpProof = readFileSync(path.join(directory, 'supabase-2.110.0-db-query-help.txt'), 'utf8');
  if (!/--output-format choice[\s\S]*Output format: text \(default\), json, or stream-json/.test(helpProof)) {
    throw new Error('Frozen Supabase CLI JSON-output help proof is invalid.');
  }
  return { executable: canonicalExecutable, version, sha256: executableSha256 };
}

function currentArtifacts() {
  const actual = hashFiles(directory, Object.keys(freeze.artifactSha256));
  for (const [filename, expected] of Object.entries(freeze.artifactSha256)) {
    if (actual[filename] !== expected) throw new Error(`Frozen artifact drift: ${filename}.`);
  }
  return { ...actual, ...packageHashes() };
}

export const REQUIRED_BUNDLE_FILENAMES = Object.freeze([
  'auth-signup-trigger.json', 'catalog.json', 'cron-presence.json',
  'current-state-flags.json', 'deterministic-config.json', 'ledger-presence.json',
  'operational-counts.json', 'receipt.json', 'server-version.json',
]);
export const OPTIONAL_BUNDLE_FILENAMES = Object.freeze(['cron-config.json', 'ledger.json']);
const ALLOWED_BUNDLE_FILENAMES = new Set([
  ...REQUIRED_BUNDLE_FILENAMES, ...OPTIONAL_BUNDLE_FILENAMES,
]);

export function writeBundleAtomic(
  outputDir, outputs, modes, approvedSystemTools = process.platform === 'win32'
    ? trustedWindowsSystemTools()
    : null,
) {
  const filenames = Object.keys(outputs).sort();
  if (
    REQUIRED_BUNDLE_FILENAMES.some((filename) => !Object.hasOwn(outputs, filename)) ||
    filenames.some((filename) => !ALLOWED_BUNDLE_FILENAMES.has(filename))
  ) throw new Error('Evidence filename contract rejected.');
  const { absolute, canonicalParent } = assertSafeOutputTarget(outputDir);
  const temporary = mkdtempSync(path.join(canonicalParent, '.migration-audit-'));
  try {
    chmodSync(temporary, modes.directoryMode);
    const tempCanonical = realpathSync.native(temporary);
    if (path.dirname(tempCanonical) !== canonicalParent) throw new Error('Temporary output escaped approved parent.');
    let windowsAccount = null;
    if (process.platform === 'win32') {
      const systemTools = approvedSystemTools;
      windowsAccount = currentWindowsPrincipal(systemTools);
      if (!windowsAccount) throw new Error('Windows account identity unavailable for evidence ACL.');
      const restrict = spawnSync(systemTools.icacls, [
        temporary, '/inheritance:r', '/grant:r', `${windowsAccount}:(OI)(CI)F`,
      ], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
      if (restrict.status !== 0 || restrict.error) throw new Error('Failed to restrict evidence directory ACL.');
    }
    for (const [filename, content] of Object.entries(outputs)) {
      const target = path.join(temporary, filename);
      if (path.dirname(target) !== temporary) throw new Error('Evidence filename escaped temporary directory.');
      writeFileSync(target, content, { encoding: 'utf8', mode: modes.fileMode, flag: 'wx' });
      chmodSync(target, modes.fileMode);
    }
    if (process.platform === 'win32') {
      restrictAndVerifyWindowsAcl(
        temporary, windowsAccount, spawnSync, '(OI)(CI)F', undefined, approvedSystemTools,
      );
    }
    renameSync(temporary, absolute);
  } catch (error) {
    if (existsSync(temporary)) {
      if (process.platform === 'win32') {
        const systemTools = approvedSystemTools;
        const cleanupAccount = currentWindowsPrincipal(systemTools);
        restoreWindowsAclForCleanup(temporary, cleanupAccount, systemTools);
      }
      for (const entry of readdirSync(temporary, { recursive: true }).reverse()) {
        try { chmodSync(path.join(temporary, entry), 0o700); } catch {}
      }
      chmodSync(temporary, 0o700);
      rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
    throw error;
  }
}

async function main() {
  const [anchorPath, approvedDigest, outputDir, ...extra] = process.argv.slice(2);
  if (!anchorPath || !/^[0-9a-f]{64}$/.test(approvedDigest ?? '') || !outputDir || extra.length) {
    throw new Error('Usage: collect-readonly <external-approved-anchor.json> <approved-sha256> <new-output-dir>');
  }
  const approval = verifyApproval(anchorPath, approvedDigest);
  if (process.platform === 'win32') {
    activeWindowsSystemTools = resolveWindowsSystemTools(approval.windowsTrust);
  }
  const { absolute: outputAbsolute } = assertSafeOutputTarget(outputDir);
  queryCopyRoot = mkdtempSync(path.join(os.tmpdir(), 'migration-audit-sql-'));
  chmodSync(queryCopyRoot, 0o700);
  stageFrozenSqlCopies();
  const collector = createReadOnlyCollector({
    timeoutMs: TIMEOUT_MS,
    now: () => new Date(),
    sha256,
    verifyEnvelope: verifyEvidenceEnvelope,
    freshPreflight: async () => {
      verifyApproval(anchorPath, approvedDigest);
      const projectRef = readLinkedProjectRef(supabaseRoot);
      const cli = inspectCli();
      activeCli = cli;
      const artifacts = currentArtifacts();
      const issued = new Date();
      const receipt = createPreflightReceipt({
        projectRef, cliExecutable: cli.executable, cliVersion: cli.version, cliSha256: cli.sha256,
        artifacts, nonce: randomBytes(24).toString('base64url'), issuedAt: issued.toISOString(),
        expiresAt: new Date(issued.getTime() + 5 * 60_000).toISOString(),
      });
      return { projectRef, cli, artifacts, receipt };
    },
    verifyFresh: async (preflight) => {
      verifyApproval(anchorPath, approvedDigest);
      const projectRef = readLinkedProjectRef(supabaseRoot);
      const cli = inspectCli();
      const artifacts = currentArtifacts();
      verifyPreflightReceipt(preflight.receipt, { projectRef, cli, artifacts });
    },
    validateQuery: async (filename) => {
      if (!Object.hasOwn(freeze.artifactSha256, filename)) throw new Error(`Unfrozen query: ${filename}.`);
      const absolutePath = path.resolve(directory, filename);
      if (!absolutePath.startsWith(`${directory}${path.sep}`)) throw new Error('Query path escaped package.');
      const bytes = readFileSync(absolutePath);
      const digest = sha256(bytes);
      if (digest !== freeze.artifactSha256[filename]) throw new Error(`Query hash drift: ${filename}.`);
      const sql = bytes.toString('utf8');
      if (filename === 'current-state-flags-readonly.sql') assertReadOnlyCurrentStateSql(sql);
      else assertReadOnlyCatalogSql(sql);
      assertCatalogIdentifiersAllowlisted(sql, freeze);
      const copyPath = path.join(queryCopyRoot, `${digest}.sql`);
      if (!existsSync(copyPath)) throw new Error('Pre-staged SQL copy is missing.');
      const canonicalCopy = canonicalRegularFile(copyPath, 'Frozen SQL copy');
      if (!canonicalCopy.startsWith(`${realpathSync.native(queryCopyRoot)}${path.sep}`)) throw new Error('SQL copy escaped restricted directory.');
      if (sha256(readFileSync(canonicalCopy)) !== digest) throw new Error('SQL copy hash mismatch.');
      if (approvedQueryCopies.get(canonicalCopy) !== digest) throw new Error('SQL copy was not pre-approved.');
      return { absolutePath: canonicalCopy, sha256: digest };
    },
    runCli: async (executable, args, { timeoutMs }) => {
      const canonicalExecutable = canonicalRegularFile(executable, 'Supabase CLI executable');
      if (!activeCli || canonicalExecutable !== activeCli.executable || sha256(readFileSync(canonicalExecutable)) !== activeCli.sha256) {
        throw new Error('CLI executable changed before subprocess.');
      }
      const sqlPath = canonicalRegularFile(args[4], 'Frozen SQL copy');
      const sqlDigest = approvedQueryCopies.get(sqlPath);
      if (!sqlDigest || sha256(readFileSync(sqlPath)) !== sqlDigest) throw new Error('SQL copy changed before subprocess.');
      const result = runBoundedSubprocess(executable, args, {
        timeoutMs, maxBufferBytes: SUBPROCESS_BUFFER_CAP_BYTES,
      });
      if (sha256(readFileSync(canonicalExecutable)) !== activeCli.sha256) throw new Error('CLI executable changed after subprocess.');
      if (sha256(readFileSync(sqlPath)) !== sqlDigest) throw new Error('SQL copy changed after subprocess.');
      return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderrSha256: sha256(result.stderr ?? ''),
        timeout: result.error?.code === 'ETIMEDOUT',
        failureMetadata: result.status !== 0 || result.error
          ? subprocessFailureMetadata(result)
          : null,
      };
    },
    writeBundleAtomic,
  });
  await runWithVerifiedCleanup(
    () => collector({ anchorPath, approvedDigest, outputDir: outputAbsolute }),
    () => cleanupStagedSqlCopies(),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`HARD STOP: ${error instanceof Error ? error.message : String(error)}${os.EOL}`);
    process.exitCode = 1;
  });
}
