import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as executorModule from './one-process-executor.mjs';
import {
  CATALOG_DECOMPOSITION_AGGREGATE_SHA256,
  CATALOG_SPLIT_QUERIES,
  createReadOnlyCollector,
  FINALIZATION_MARGIN_MS,
  MAX_QUERY_CALLS,
  PINNED_CLI_JSON_WRAPPER,
  PINNED_CLI_WARNING_TEMPLATE,
  validateQueryRows,
} from './one-process-executor.mjs';
import { runBoundedSubprocess } from './bounded-subprocess.mjs';
import {
  assertSafeOutputTarget, canonicalRegularFile, resolveWindowsSystemTools,
  boundedJsonStructure, extractAllowlistedJsonSqlState, extractAllowlistedSqlState,
  legacyUnexpectedStatusDiagnostic,
  restoreWindowsAclForCleanup, restrictAndVerifyWindowsAcl,
  runWithVerifiedCleanup, subprocessFailureMetadata, writeBundleAtomic,
  REQUIRED_BUNDLE_FILENAMES, OPTIONAL_BUNDLE_FILENAMES,
} from './collect-readonly.mjs';
import {
  assertCatalogIdentifiersAllowlisted,
  assertReadOnlyCatalogSql,
  assertReadOnlyCurrentStateSql,
  createPreflightReceipt,
  sha256,
  splitSqlStatements,
  verifyEvidenceEnvelope,
} from './core.mjs';

const CATALOG_SPLIT_FILENAMES = [
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
];

test('default privilege object type is explicitly converted to text for PostgreSQL concatenation', () => {
  const sql = readFileSync(
    new URL('./catalog-16-default-privilege-readonly.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /d\.defaclobjtype::text/u);
  assert.doesNotMatch(sql, /\|\|\s*d\.defaclobjtype(?!::text)/u);
});

test('deterministic configuration uses one result set for the pinned query API', () => {
  const sql = readFileSync(
    new URL('./deterministic-config-readonly.sql', import.meta.url),
    'utf8',
  );
  const statements = splitSqlStatements(sql).map((statement) => statement.trim());
  assert.equal(statements.length, 6);
  assert.equal([...statements[4].matchAll(/\bunion all\b/giu)].length, 2);
  assert.match(statements[4], /^select category, object_key, definition\s+from \(/iu);
});

test('official challenge audit tolerates staging rows from before migration 0080', () => {
  for (const filename of [
    'deterministic-config-readonly.sql',
    'deterministic-config-official-challenge-readonly.sql',
  ]) {
    const sql = readFileSync(new URL(`./${filename}`, import.meta.url), 'utf8');
    assert.match(sql, /to_jsonb\(challenge_row\)->>'is_official'/u);
    assert.doesNotMatch(sql, /\bwhere is_official is true\b/u);
    assert.doesNotMatch(sql, /\bofficial_key as object_key\b/u);
    assertCatalogIdentifiersAllowlisted(sql, FROZEN_ARTIFACTS);
  }
});

test('current state audit exposes only seven fixed boolean flags', () => {
  const sql = readFileSync(
    new URL('./current-state-flags-readonly.sql', import.meta.url),
    'utf8',
  );
  assertReadOnlyCurrentStateSql(sql);
  assertCatalogIdentifiersAllowlisted(sql, FROZEN_ARTIFACTS);
  assert.equal(splitSqlStatements(sql).length, 6);
  assert.match(sql, /^begin read only;/u);
  assert.match(sql, /\nrollback;\n$/u);
  assert.equal([...sql.matchAll(/'current_state_flag'(?: as category)?/gu)].length, 7);
});

test('current state evidence rejects identifiers and values outside the fixed boolean contract', () => {
  const valid = [{
    category: 'current_state_flag',
    object_key: '0074_profiles_display_name_unsanitized',
    definition: { present: false },
  }];
  assert.deepEqual(
    validateQueryRows(valid, 'current-state-flags-readonly.sql', 'current-state-flags'),
    valid,
  );
  assert.throws(
    () => validateQueryRows([{ ...valid[0], object_key: 'profiles_all_rows' }], 'x.sql', 'current-state-flags'),
    /Current state key rejected/u,
  );
  assert.throws(
    () => validateQueryRows([{ ...valid[0], definition: { present: 'false' } }], 'x.sql', 'current-state-flags'),
    /Boolean field rejected/u,
  );
});

test('0096 postconditions require one exact identity and every named boolean true', () => {
  const definition = {
    moderation_columns_present: true, moderation_constraints_present: true,
    queue_indexes_present: true, reports_projection: true, flags_projection: true,
    no_private_messages_source: true, decision_status_outcome: true,
    manual_resolution_outcome: true, quarantined_shares_blocked: true,
    report_privileges: true, no_client_quarantine_mutation: true,
    no_client_review_mutation: true,
  };
  const valid = [{ category: 'moderation_postconditions', object_key: '0096', definition }];
  assert.deepEqual(validateQueryRows(valid, '0096-postconditions-readonly.sql', 'moderation-postconditions'), valid);
  assert.throws(() => validateQueryRows([{ ...valid[0], object_key: '0096-overload' }], 'x.sql', 'moderation-postconditions'), /postconditions/u);
  assert.throws(() => validateQueryRows([{ ...valid[0], definition: { ...definition, queue_indexes_present: false } }], 'x.sql', 'moderation-postconditions'), /postconditions/u);
  assert.throws(() => validateQueryRows([{ ...valid[0], definition: { ...definition, unexpected_overload: true } }], 'x.sql', 'moderation-postconditions'), /definition keys/u);
});

test('auth signup trigger audit is fixed to one value-free security fingerprint', () => {
  const sql = readFileSync(new URL('./auth-signup-trigger-readonly.sql', import.meta.url), 'utf8');
  assertReadOnlyCatalogSql(sql);
  assertCatalogIdentifiersAllowlisted(sql, FROZEN_ARTIFACTS);
  assert.match(sql, /auth\.users/u);
  assert.match(sql, /on_auth_user_created/u);
  assert.match(sql, /public\.handle_new_user/u);
  assert.doesNotMatch(sql, /new\.raw_user_meta_data|new\.email/u);
});

test('auth signup trigger evidence rejects every identity except the exact migration-0001 trigger', () => {
  const valid = [{
    category: 'auth_signup_trigger',
    object_key: 'auth.users.on_auth_user_created',
    definition: { definition_sha256: 'a'.repeat(64), enabled: 'O', function: 'public.handle_new_user' },
  }];
  assert.deepEqual(validateQueryRows(valid, 'auth-signup-trigger-readonly.sql', 'auth-signup-trigger'), valid);
  assert.throws(
    () => validateQueryRows([{ ...valid[0], object_key: 'auth.users.other' }], 'x.sql', 'auth-signup-trigger'),
    /Auth signup trigger key rejected/u,
  );
});

test('server version query returns one value-minimized fixed record', () => {
  const sql = readFileSync(new URL('./server-version-readonly.sql', import.meta.url), 'utf8');
  assertReadOnlyCatalogSql(sql);
  assertCatalogIdentifiersAllowlisted(sql, FROZEN_ARTIFACTS);
  assert.match(sql, /current_setting\('server_version_num'\)/u);
  assert.doesNotMatch(sql, /current_database|system_identifier|database_oid|ledger_versions/iu);
  const valid = [{
    category: 'postgres_server_version', object_key: 'server',
    definition: { server_version_num: '170006' },
  }];
  assert.deepEqual(validateQueryRows(valid, 'server-version-readonly.sql', 'server-version'), valid);
  assert.throws(
    () => validateQueryRows([{ ...valid[0], definition: { server_version_num: '17.6' } }], 'x.sql', 'server-version'),
    /Server version record rejected/u,
  );
});

test('catalog failure localization plan is a complete deterministic read-only binary tree', () => {
  const plan = executorModule.CATALOG_DIAGNOSTIC_PLAN;
  assert.ok(plan);
  assert.equal(MAX_QUERY_CALLS, 16);
  assert.deepEqual(plan.rootRanges, [[1, 10], [11, 19]]);
  assert.equal(plan.maximumProbeCalls, 10);
  assert.deepEqual(
    plan.leaves.map((leaf) => leaf.filename),
    CATALOG_SPLIT_FILENAMES,
  );
  const decomposition = JSON.parse(readFileSync(
    new URL('./catalog-decomposition.json', import.meta.url),
    'utf8',
  ));
  assert.equal(decomposition.failureLocalization.maximumProbeCalls, plan.maximumProbeCalls);
  assert.equal(decomposition.failureLocalization.maximumTotalCalls, MAX_QUERY_CALLS);
  assert.deepEqual(decomposition.failureLocalization.rootRanges, plan.rootRanges);
  assert.deepEqual(
    decomposition.failureLocalization.nodes.map((node) => node.filename).sort(),
    plan.nodes.map((node) => node.filename).sort(),
  );
  for (const node of plan.nodes) {
    const sql = readFileSync(new URL(`./${node.filename}`, import.meta.url), 'utf8');
    assertReadOnlyCatalogSql(sql);
    assertCatalogIdentifiersAllowlisted(sql, FROZEN_ARTIFACTS);
    assert.equal(splitSqlStatements(sql).length, 6);
    assert.match(sql, /^begin read only;/);
    assert.match(sql, /\nrollback;\n$/);
    const recorded = decomposition.failureLocalization.nodes.find(
      (entry) => entry.filename === node.filename,
    );
    assert.equal(recorded.sha256, sha256(sql));
  }
});

test('production pre-stages every frozen localization query before any probe can run', () => {
  const source = readFileSync(
    new URL('./collect-readonly.mjs', import.meta.url),
    'utf8',
  );
  const runtimeList = source.match(
    /const RUNTIME_SQL_FILENAMES = Object\.freeze\(\[([\s\S]*?)\]\);/u,
  );
  assert.ok(runtimeList, 'runtime SQL staging list must be statically discoverable');
  const staged = new Set(
    [...runtimeList[1].matchAll(/'([^']+\.sql)'/gu)].map((match) => match[1]),
  );
  const plan = executorModule.CATALOG_DIAGNOSTIC_PLAN;
  const required = [
    ...plan.nodes.map((node) => node.filename),
    ...plan.leaves.map((leaf) => leaf.filename),
    ...executorModule.CONFIG_DIAGNOSTIC_PLAN.map((item) => item.filename),
  ];
  assert.deepEqual(
    required.filter((filename) => !staged.has(filename)),
    [],
    'every diagnostic subset and leaf must be copied into the protected runtime directory',
  );
});
const FROZEN_ARTIFACTS = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'frozen-artifacts.json'), 'utf8'),
);

test('0096 postcondition identifiers are explicitly frozen before staging collection', () => {
  const sql = readFileSync(new URL('./0096-postconditions-readonly.sql', import.meta.url), 'utf8');
  assertReadOnlyCatalogSql(sql);
  assertCatalogIdentifiersAllowlisted(sql, FROZEN_ARTIFACTS);
});

test('pending approval template exactly fingerprints the current executable package', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const collectorSource = readFileSync(path.join(directory, 'collect-readonly.mjs'), 'utf8');
  const template = JSON.parse(readFileSync(
    path.join(directory, 'external-approval-anchor.template.json'),
    'utf8',
  ));
  assert.equal(template.approval, 'PENDING');
  assert.equal(template.packageDigest, null);
  const packageBody = collectorSource.match(/function packageHashes\(\) \{[\s\S]*?return \{([\s\S]*?)\n  \};\n\}/u)?.[1];
  assert.ok(packageBody, 'collector packageHashes implementation must remain statically reviewable');
  const runtimePackageFiles = [...packageBody.matchAll(/^\s*'([^']+)':/gmu)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(runtimePackageFiles, Object.keys(template.packageSha256).sort());
  for (const [filename, expected] of Object.entries(template.packageSha256)) {
    assert.equal(sha256(readFileSync(path.join(directory, filename))), expected, filename);
  }
});

function approvedWindowsTrust() {
  const systemRoot = path.resolve(process.env.SystemRoot);
  return {
    systemRoot,
    toolSha256: {
      powershell: sha256(readFileSync(path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))),
      icacls: sha256(readFileSync(path.join(systemRoot, 'System32', 'icacls.exe'))),
      whoami: sha256(readFileSync(path.join(systemRoot, 'System32', 'whoami.exe'))),
    },
  };
}

function pinnedCliEnvelope(rows, boundary = '0123456789abcdef0123456789abcdef') {
  return {
    boundary,
    rows,
    warning: `${PINNED_CLI_WARNING_TEMPLATE.prefix}${boundary}${PINNED_CLI_WARNING_TEMPLATE.suffix}`,
  };
}

function fixture({ ledger = false, cron = false, failAt = null } = {}) {
  const calls = [];
  let bundle = null;
  const issuedAt = '2026-07-30T00:00:00.000Z';
  const receipt = createPreflightReceipt({
    projectRef: 'ksvcjvwawamwyquzsizk',
    cliExecutable: path.resolve('supabase.exe'),
    cliVersion: '2.110.0',
    cliSha256: 'a'.repeat(64),
    artifacts: { x: 'b'.repeat(64) },
    nonce: 'nonce_abcdefghijklmnopqrstuvwxyz',
    issuedAt,
    expiresAt: '2026-07-30T00:05:00.000Z',
  });
  const rows = {
    'catalog-presence-readonly.sql': [{ category: 'ledger_presence', object_key: 'supabase_migrations.schema_migrations', definition: { relation: ledger ? 'supabase_migrations.schema_migrations' : null } }],
    'cron-presence-readonly.sql': [{ category: 'cron_presence', object_key: 'cron.job', definition: { relation: cron ? 'cron.job' : null } }],
    'catalog-readonly.sql': [
      { category: 'extension', object_key: 'pgcrypto', definition: { schema: 'extensions', version: '1.3' } },
      {
        category: 'sequence', object_key: 'public.max_bigint_sequence',
        definition: {
          cache: '1', cycle: false, increment: '1', maximum: '9223372036854775807',
          minimum: '-9223372036854775808', owner: 'postgres',
          start: '9223372036854775807', type: 'bigint',
        },
      },
    ],
    'catalog-union-readonly.sql': [],
    'deterministic-config-readonly.sql': [{ category: 'rate_limit_config', object_key: 'posts', definition: { maximum_rows: 30, owner_column: 'user_id', window_seconds: 3600 } }],
    'current-state-flags-readonly.sql': [
      { category: 'current_state_flag', object_key: '0051_buddy_messages_retain_false', definition: { present: false } },
      { category: 'current_state_flag', object_key: '0067_profiles_location_verified_true', definition: { present: false } },
      { category: 'current_state_flag', object_key: '0074_profiles_display_name_unsanitized', definition: { present: false } },
      { category: 'current_state_flag', object_key: '0078_posts_group_audience_mismatch', definition: { present: false } },
      { category: 'current_state_flag', object_key: '0078_posts_page_audience_mismatch', definition: { present: false } },
      { category: 'current_state_flag', object_key: '0078_posts_event_type_mismatch', definition: { present: false } },
      { category: 'current_state_flag', object_key: '0078_posts_photo_type_mismatch', definition: { present: false } },
    ],
    '0096-postconditions-readonly.sql': [{
      category: 'moderation_postconditions', object_key: '0096', definition: {
        moderation_columns_present: true, moderation_constraints_present: true,
        queue_indexes_present: true, reports_projection: true, flags_projection: true,
        no_private_messages_source: true, decision_status_outcome: true,
        manual_resolution_outcome: true, quarantined_shares_blocked: true,
        report_privileges: true, no_client_quarantine_mutation: true,
        no_client_review_mutation: true,
      },
    }],
    'auth-signup-trigger-readonly.sql': [{
      category: 'auth_signup_trigger', object_key: 'auth.users.on_auth_user_created',
      definition: { definition_sha256: 'a'.repeat(64), enabled: 'O', function: 'public.handle_new_user' },
    }],
    'server-version-readonly.sql': [{
      category: 'postgres_server_version', object_key: 'server',
      definition: { server_version_num: '170006' },
    }],
    'catalog-operational-readonly.sql': [{ category: 'storage_bucket_object_count', object_key: 'media', definition: { count: '9223372036854775807' } }],
    'catalog-ledger-readonly.sql': [{ category: 'ledger_version', object_key: '0001', definition: { version: '0001' } }],
    'cron-config-readonly.sql': [{ category: 'cron_job_config', object_key: 'purge', definition: { schedule: '0 0 * * *', command_sha256: 'a'.repeat(64) } }],
  };
  for (const filename of CATALOG_SPLIT_FILENAMES) rows[filename] = [];
  rows['catalog-11-sequence-readonly.sql'] = rows['catalog-readonly.sql'].slice(1);
  rows['catalog-17-extension-readonly.sql'] = rows['catalog-readonly.sql'].slice(0, 1);
  rows['catalog-union-readonly.sql'] = rows['catalog-readonly.sql'];
  const dependencies = {
    timeoutMs: 5000,
    now: () => new Date('2026-07-30T00:01:00.000Z'),
    sha256,
    verifyEnvelope: verifyEvidenceEnvelope,
    freshPreflight: async () => ({ receipt, cli: { executable: path.resolve('supabase.exe'), sha256: 'a'.repeat(64) } }),
    verifyFresh: async () => true,
    validateQuery: async (filename) => ({
      absolutePath: path.resolve(filename),
      sha256: FROZEN_ARTIFACTS.artifactSha256[filename] ?? sha256(filename),
    }),
    runCli: async (executable, args, options) => {
      const filename = path.basename(args[4]);
      calls.push({ executable, args, options });
      if (filename === failAt) return { status: 1, stdout: '' };
      return {
        status: 0,
        stdout: JSON.stringify(pinnedCliEnvelope(rows[filename])),
      };
    },
    writeBundleAtomic: async (outputDir, outputs, modes) => { bundle = { outputDir, outputs, modes }; },
  };
  return { dependencies, calls, rows, receipt, get bundle() { return bundle; } };
}

test('collector uses exact absolute CLI arguments and absence gates optional queries', async () => {
  const f = fixture();
  const collect = createReadOnlyCollector(f.dependencies);
  const result = await collect({ anchorPath: 'outside.json', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('evidence') });
  assert.deepEqual(f.calls.map((call) => path.basename(call.args[4])), [
    'catalog-presence-readonly.sql',
    'cron-presence-readonly.sql',
    'catalog-union-readonly.sql',
    'deterministic-config-readonly.sql',
    'current-state-flags-readonly.sql',
    '0096-postconditions-readonly.sql',
    'auth-signup-trigger-readonly.sql',
    'server-version-readonly.sql',
    'catalog-operational-readonly.sql',
  ]);
  assert.equal(f.calls.length, 9);
  for (const call of f.calls) {
    assert.equal(path.isAbsolute(call.executable), true);
    assert.deepEqual(call.args.slice(0, 4), ['db', 'query', '--linked', '--file']);
    assert.deepEqual(call.args.slice(-2), ['--output-format', 'json']);
    assert.equal(call.options.timeoutMs, 5000);
  }
  assert.equal(f.bundle.modes.fileMode, 0o600);
  assert.ok(result.files.includes('ledger-presence.json'));
  assert.deepEqual(JSON.parse(f.bundle.outputs['receipt.json']), f.receipt);
  assert.equal(JSON.parse(f.bundle.outputs['server-version.json']).envelope.records[0].definition.server_version_num, '170006');
  await assert.rejects(() => collect({ anchorPath: 'x', approvedDigest: 'x', outputDir: 'x' }), /single-use/);
});

test('split catalog is a complete ordered decomposition of the frozen monolith', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const original = readFileSync(path.join(directory, 'catalog-readonly.sql'), 'utf8');
  const manifest = JSON.parse(readFileSync(path.join(directory, 'catalog-decomposition.json'), 'utf8'));
  const originalSelects = [...original.matchAll(/^select [\s\S]*?(?=^select |^rollback;)/gm)]
    .map((match) => match[0].trim());
  assert.equal(originalSelects.length, 19);
  const splitSelects = CATALOG_SPLIT_FILENAMES.map((filename) => {
    const absolute = path.join(directory, filename);
    assert.equal(existsSync(absolute), true, `missing frozen split: ${filename}`);
    const sql = readFileSync(absolute, 'utf8');
    const matches = [...sql.matchAll(/^select [\s\S]*?(?=^rollback;)/gm)];
    assert.equal(matches.length, 1, `expected one SELECT: ${filename}`);
    return matches[0][0].trim();
  });
  assert.deepEqual(splitSelects, originalSelects);
  assert.equal(manifest.source.sha256, sha256(original));
  assert.equal(manifest.source.selectCount, 19);
  assert.equal(manifest.aggregateQuerySha256, CATALOG_DECOMPOSITION_AGGREGATE_SHA256);
  assert.equal(
    sha256(
      manifest.orderedQueries
        .map(({ filename }) => FROZEN_ARTIFACTS.artifactSha256[filename])
        .join('\n'),
    ),
    CATALOG_DECOMPOSITION_AGGREGATE_SHA256,
  );
  assert.deepEqual(
    manifest.orderedQueries.map(({ category, filename }) => [category, filename]),
    CATALOG_SPLIT_QUERIES,
  );
  assert.deepEqual(
    manifest.orderedQueries.map(({ selectSha256 }) => selectSha256),
    originalSelects.map((select) => sha256(select)),
  );
  assert.deepEqual(
    CATALOG_SPLIT_FILENAMES,
    [
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
    ],
  );
});

test('union catalog embeds every exact body once and fixes original category order', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const original = readFileSync(path.join(directory, 'catalog-readonly.sql'), 'utf8');
  const union = readFileSync(path.join(directory, 'catalog-union-readonly.sql'), 'utf8');
  const manifest = JSON.parse(readFileSync(path.join(directory, 'catalog-decomposition.json'), 'utf8'));
  const originalSelects = [...original.matchAll(/^select [\s\S]*?(?=^select |^rollback;)/gm)]
    .map((match) => match[0].trim().replace(/;$/, ''));
  assert.equal(originalSelects.length, 19);
  for (const select of originalSelects) {
    assert.equal(union.split(select).length - 1, 1);
  }
  const orderCategories = [
    ...union.matchAll(/^\s+when '([a-z_]+)' then (\d+)$/gm),
  ].map((match) => [match[1], Number(match[2])]);
  assert.deepEqual(
    orderCategories,
    CATALOG_SPLIT_QUERIES.map(([category], index) => [category, index + 1]),
  );
  assert.equal([...union.matchAll(/^union all$/gm)].length, 18);
  assert.equal([...union.matchAll(/^rollback;$/gm)].length, 1);
  assert.equal(manifest.runtimeUnion.filename, 'catalog-union-readonly.sql');
  assert.equal(manifest.runtimeUnion.sha256, sha256(union));
  assert.equal(manifest.runtimeUnion.snapshotCount, 1);
  assert.equal(manifest.runtimeUnion.resultSetCount, 1);
  assert.equal(manifest.runtimeUnion.unionAllCount, 18);
  assertReadOnlyCatalogSql(union);
  assertCatalogIdentifiersAllowlisted(union, FROZEN_ARTIFACTS);
  const statements = splitSqlStatements(union).map((statement) => statement.trim());
  assert.equal(statements.length, 6);
  assert.match(statements[0], /^begin read only$/i);
  assert.match(statements[4], /^select category, object_key, definition[\s\S]*union all/i);
  assert.match(statements[5], /^rollback$/i);
});

test('failed deterministic configuration localizes the first failing source without publication', async () => {
  const sentinel = 'SENTINEL_CONFIG_RESPONSE_BODY';
  const f = fixture();
  const probes = [];
  f.dependencies.runCli = async (executable, args) => {
    const filename = path.basename(args[4]);
    if (filename === 'deterministic-config-readonly.sql') {
      return {
        status: 1,
        stdout: sentinel,
        failureMetadata: subprocessFailureMetadata({ status: 1, stdout: sentinel, stderr: '' }),
      };
    }
    if (filename.startsWith('deterministic-config-')) {
      probes.push(filename);
      const fails = filename === 'deterministic-config-official-challenge-readonly.sql';
      return fails
        ? { status: 1, stdout: sentinel, failureMetadata: subprocessFailureMetadata({ status: 1, stdout: sentinel, stderr: '' }) }
        : { status: 0, stdout: sentinel };
    }
    return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(f.rows[filename])) };
  };
  await assert.rejects(
    () => createReadOnlyCollector(f.dependencies)({
      anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
    }),
    (error) => {
      assert.match(error.message, /CONFIG_LOCALIZATION_ONLY/);
      assert.match(error.message, /"source":"official_challenge"/);
      assert.equal(error.message.includes(sentinel), false);
      return true;
    },
  );
  assert.deepEqual(probes, [
    'deterministic-config-rate-limit-readonly.sql',
    'deterministic-config-storage-bucket-readonly.sql',
    'deterministic-config-official-challenge-readonly.sql',
  ]);
  assert.equal(f.bundle, null);
});

test('collector gates present ledger and cron queries in order', async () => {
  const f = fixture({ ledger: true, cron: true });
  await createReadOnlyCollector(f.dependencies)({
    anchorPath: 'outside.json', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('evidence'),
  });
  assert.deepEqual(f.calls.map((call) => path.basename(call.args[4])).slice(-2), [
    'catalog-ledger-readonly.sql',
    'cron-config-readonly.sql',
  ]);
  assert.equal(f.calls.length, 11);
});

test('collector reserves the formal worst-case receipt window before any query', async () => {
  assert.equal(MAX_QUERY_CALLS, 16);
  assert.equal(FINALIZATION_MARGIN_MS, 30_000);
  assert.equal(MAX_QUERY_CALLS * 15_000 + FINALIZATION_MARGIN_MS, 270_000);
  const f = fixture();
  f.dependencies.timeoutMs = 15_000;
  f.dependencies.now = () => new Date('2026-07-30T00:03:00.001Z');
  await assert.rejects(
    () => createReadOnlyCollector(f.dependencies)({
      anchorPath: 'outside.json',
      approvedDigest: 'd'.repeat(64),
      outputDir: path.resolve('evidence'),
    }),
    /receipt window/,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.bundle, null);
});

test('collector caps every subprocess to the remaining global deadline', async () => {
  const f = fixture();
  f.dependencies.timeoutMs = 15_000;
  let nowCalls = 0;
  f.dependencies.now = () => new Date(
    nowCalls++ === 0 ? '2026-07-30T00:00:15.000Z' : '2026-07-30T00:04:20.000Z',
  );
  await createReadOnlyCollector(f.dependencies)({
    anchorPath: 'outside.json',
    approvedDigest: 'd'.repeat(64),
    outputDir: path.resolve('evidence'),
  });
  assert.equal(f.calls.length, 9);
  assert.deepEqual(f.calls.map((call) => call.options.timeoutMs), [
    10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 10_000,
  ]);
  assert.notEqual(f.bundle, null);
});

test('collector refuses atomic publication after the finalization margin is lost', async () => {
  const f = fixture();
  f.dependencies.timeoutMs = 15_000;
  let nowCalls = 0;
  f.dependencies.now = () => new Date(
    nowCalls++ < 19 ? '2026-07-30T00:00:15.000Z' : '2026-07-30T00:04:31.000Z',
  );
  await assert.rejects(
    () => createReadOnlyCollector(f.dependencies)({
      anchorPath: 'outside.json',
      approvedDigest: 'd'.repeat(64),
      outputDir: path.resolve('evidence'),
    }),
    /finalization margin/,
  );
  assert.equal(f.bundle, null);
});

test('collector accepts independently generated lowercase random boundaries with exact bound warnings', async () => {
  for (let index = 0; index < 8; index += 1) {
    const boundary = randomBytes(16).toString('hex');
    const f = fixture();
    f.dependencies.runCli = async (executable, args, options) => {
      const filename = path.basename(args[4]);
      f.calls.push({ executable, args, options });
      return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(f.rows[filename], boundary)) };
    };
    await createReadOnlyCollector(f.dependencies)({
      anchorPath: 'outside.json',
      approvedDigest: 'd'.repeat(64),
      outputDir: path.resolve(`evidence-${index}`),
    });
    assert.notEqual(f.bundle, null);
  }
});

test('collector fails closed on subprocess and output shape without atomic output', async () => {
  const failed = fixture({ failAt: 'catalog-union-readonly.sql' });
  await assert.rejects(
    () => createReadOnlyCollector(failed.dependencies)({ anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e') }),
    /subprocess failed/,
  );
  assert.equal(failed.bundle, null);
  const malformed = fixture();
  malformed.dependencies.runCli = async () => ({ status: 0, stdout: '{"not":"rows"}' });
  await assert.rejects(
    () => createReadOnlyCollector(malformed.dependencies)({ anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e') }),
    /envelope rejected/,
  );
  assert.equal(malformed.bundle, null);
});

test('exact catalog subprocess failure emits only capped safe metadata and publishes nothing', async () => {
  const sentinelStdout = 'SENTINEL_SECRET_STDOUT';
  const sentinelStderr = 'SQLSTATE: 57014 SENTINEL_SECRET_IDENTIFIER';
  const f = fixture();
  const failureCalls = [];
  f.dependencies.runCli = async (executable, args) => {
    const filename = path.basename(args[4]);
    failureCalls.push(filename);
    if (filename !== 'catalog-union-readonly.sql') {
      return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(f.rows[filename])) };
    }
    const raw = { status: 1, stdout: sentinelStdout, stderr: sentinelStderr, error: null };
    return {
      status: 1,
      stdout: sentinelStdout,
      timeout: false,
      failureMetadata: subprocessFailureMetadata(raw),
    };
  };
  await assert.rejects(
    () => createReadOnlyCollector(f.dependencies)({
      anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
    }),
    (error) => {
      assert.match(error.message, /CATALOG_SUBPROCESS_ONLY/);
      assert.equal(error.message.includes(sentinelStdout), false);
      assert.equal(error.message.includes(sentinelStderr), false);
      assert.match(error.message, new RegExp(sha256(sentinelStdout)));
      assert.match(error.message, new RegExp(sha256(sentinelStderr)));
      assert.match(error.message, /"sqlstate":"57014"/);
      assert.ok(error.message.length < 1024);
      return true;
    },
  );
  assert.equal(f.bundle, null);
  assert.deepEqual(failureCalls, [
    'catalog-presence-readonly.sql',
    'cron-presence-readonly.sql',
    'catalog-union-readonly.sql',
    'catalog-diagnostic-01-10-readonly.sql',
    'catalog-diagnostic-11-19-readonly.sql',
  ]);

  const timed = fixture();
  timed.dependencies.runCli = async (executable, args) => {
    const filename = path.basename(args[4]);
    if (filename !== 'catalog-union-readonly.sql') {
      return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(timed.rows[filename])) };
    }
    const raw = {
      status: null, stdout: '', stderr: 'SENTINEL_TIMEOUT_DETAIL',
      error: { code: 'ETIMEDOUT' },
    };
    return {
      status: null, stdout: '', timeout: true,
      failureMetadata: subprocessFailureMetadata(raw),
    };
  };
  await assert.rejects(
    () => createReadOnlyCollector(timed.dependencies)({
      anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
    }),
    (error) => {
      assert.match(error.message, /CATALOG_SUBPROCESS_ONLY/);
      assert.match(error.message, /Read-only query subprocess timeout: catalog-union-readonly\.sql\./);
      assert.match(error.message, /"timeout":true/);
      assert.match(error.message, /"errorCode":"ETIMEDOUT"/);
      assert.equal(error.message.includes('SENTINEL_TIMEOUT_DETAIL'), false);
      return true;
    },
  );
  assert.equal(timed.bundle, null);
});

test('subprocess diagnostic SQLSTATE extraction and caps fail closed', async () => {
  for (const [stderr, expected] of [
    ['SQLSTATE: 42501', '42501'],
    ['SQLSTATE[42P01]', '42P01'],
    ['code: "57014"', '57014'],
    ['prefix SQLSTATE: 57014', null],
    ['SQLSTATE: 99999', null],
    ['SQLSTATE: 57014 SENTINEL_SECRET_IDENTIFIER', '57014'],
  ]) assert.equal(extractAllowlistedSqlState(stderr), expected);
  assert.equal(extractAllowlistedSqlState('x'.repeat(16 * 1024 * 1024 + 1)), null);

  const hostile = fixture();
  hostile.dependencies.runCli = async (executable, args) => {
    const filename = path.basename(args[4]);
    if (filename !== 'catalog-union-readonly.sql') {
      return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(hostile.rows[filename])) };
    }
    return {
      status: 1,
      stdout: '',
      failureMetadata: {
        ...subprocessFailureMetadata({ status: 1, stdout: '', stderr: '' }),
        stderr: { utf8Bytes: 16 * 1024 * 1024 + 1, sha256: 'a'.repeat(64) },
        injected: 'SENTINEL_SECRET_IDENTIFIER',
      },
    };
  };
  await assert.rejects(
    () => createReadOnlyCollector(hostile.dependencies)({
      anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
    }),
    (error) => {
      assert.doesNotMatch(error.message, /CATALOG_SUBPROCESS_ONLY|SENTINEL/);
      return true;
    },
  );
  assert.equal(hostile.bundle, null);
});

test('union failure JSON diagnostic reveals structure and fingerprints but no scalar or unknown key', () => {
  const secretMessage = 'SENTINEL_PRIVATE_REMOTE_ERROR';
  const secretKey = 'SENTINEL_UNKNOWN_KEY';
  const stdout = JSON.stringify({
    _tag: 'Error',
    error: {
      code: '42P01',
      message: secretMessage,
      [secretKey]: ['alpha', { deep: true }],
    },
  });
  const metadata = subprocessFailureMetadata({ status: 1, stdout, stderr: '', error: null });
  const encoded = JSON.stringify(metadata);
  assert.equal(metadata.sqlstate, '42P01');
  assert.equal(metadata.stdoutJson.type, 'object');
  assert.equal(encoded.includes(secretMessage), false);
  assert.equal(encoded.includes(secretKey), false);
  assert.match(encoded, new RegExp(sha256(secretMessage)));
  assert.match(encoded, new RegExp(sha256(secretKey)));
  assert.equal(encoded.includes('42P01'), true);
  assert.equal(extractAllowlistedJsonSqlState('{"code":"57014"}'), '57014');
  assert.equal(extractAllowlistedJsonSqlState('{"error":{"code":"42501"}}'), '42501');
  assert.equal(extractAllowlistedJsonSqlState('{"other":{"code":"57014"}}'), null);
  assert.equal(extractAllowlistedJsonSqlState('{"code":"99999"}'), null);
  assert.equal(boundedJsonStructure('not-json'), null);
});

test('union failure JSON diagnostic caps keys, items, depth, and oversized input', () => {
  const hostile = {
    array: Array.from({ length: 30 }, (_, index) => `SECRET_${index}`),
    nested: { a: { b: { c: { d: 'TOO_DEEP_SECRET' } } } },
  };
  for (let index = 0; index < 30; index += 1) hostile[`unknown_${index}`] = index;
  const structure = boundedJsonStructure(JSON.stringify(hostile));
  assert.equal(structure.type, 'object');
  assert.equal(structure.keyCount, 32);
  assert.equal(structure.entries.length, 16);
  assert.equal(structure.keysCapped, true);
  const encoded = JSON.stringify(structure);
  assert.equal(encoded.includes('SECRET_0'), false);
  assert.equal(encoded.includes('unknown_0'), false);
  assert.ok(encoded.length < 8192);
  assert.equal(boundedJsonStructure('x'.repeat(16 * 1024 * 1024 + 1)), null);
});

test('exact pinned legacy unexpected-status diagnostic is bounded and value-free', async () => {
  const sentinel = 'SENTINEL_REMOTE_DATABASE_DETAIL';
  const body = JSON.stringify({
    code: '57014',
    message: sentinel,
    hostile_unknown_key: { nested: [sentinel] },
  });
  const stdout = JSON.stringify({
    _tag: 'Error',
    error: {
      code: 'LegacyDbQueryUnexpectedStatusError',
      message: `unexpected status 500: ${body}`,
    },
  });
  const legacy = legacyUnexpectedStatusDiagnostic(stdout);
  assert.equal(legacy.code, 'LegacyDbQueryUnexpectedStatusError');
  assert.equal(legacy.httpStatus, 500);
  assert.equal(legacy.body.utf8Bytes, Buffer.byteLength(body));
  assert.equal(legacy.body.sha256, sha256(body));
  assert.equal(legacy.body.json.type, 'object');
  assert.equal(legacy.sqlstate, '57014');
  const metadata = subprocessFailureMetadata({ status: 1, stdout, stderr: '' });
  const encoded = JSON.stringify(metadata);
  assert.equal(metadata.sqlstate, '57014');
  assert.equal(encoded.includes(sentinel), false);
  assert.equal(encoded.includes('hostile_unknown_key'), false);
  assert.match(encoded, new RegExp(sha256(sentinel)));

  const malformed = [
    { _tag: 'error', error: { code: 'LegacyDbQueryUnexpectedStatusError', message: `unexpected status 500: ${body}` } },
    { _tag: 'Error', extra: true, error: { code: 'LegacyDbQueryUnexpectedStatusError', message: `unexpected status 500: ${body}` } },
    { _tag: 'Error', error: { code: 'OtherError', message: `unexpected status 500: ${body}` } },
    { _tag: 'Error', error: { code: 'LegacyDbQueryUnexpectedStatusError', message: `prefix unexpected status 500: ${body}` } },
    { _tag: 'Error', error: { code: 'LegacyDbQueryUnexpectedStatusError', message: `unexpected status 50: ${body}` } },
    { _tag: 'Error', error: { code: 'LegacyDbQueryUnexpectedStatusError', message: `unexpected status 500:${body}` } },
    { _tag: 'Error', error: { code: 'LegacyDbQueryUnexpectedStatusError', message: `unexpected status 500: ${body}`, suggestion: sentinel } },
  ];
  for (const value of malformed) {
    assert.equal(legacyUnexpectedStatusDiagnostic(JSON.stringify(value)), null);
  }
  const unknownStatus = legacyUnexpectedStatusDiagnostic(JSON.stringify({
    _tag: 'Error',
    error: {
      code: 'LegacyDbQueryUnexpectedStatusError',
      message: `unexpected status 599: ${body}`,
    },
  }));
  assert.equal(unknownStatus.httpStatus, null);
  assert.equal(unknownStatus.body.sha256, sha256(body));
  assert.equal(legacyUnexpectedStatusDiagnostic(JSON.stringify({
    _tag: 'Error',
    error: {
      code: 'LegacyDbQueryUnexpectedStatusError',
      message: `unexpected status 500: ${'x'.repeat(64 * 1024)}`,
    },
  })), null);
  assert.equal(legacyUnexpectedStatusDiagnostic(JSON.stringify({
    _tag: 'Error',
    error: {
      code: 'LegacyDbQueryUnexpectedStatusError',
      message: 'unexpected status 500: not-json',
    },
  })).body.json, null);
  assert.equal(legacyUnexpectedStatusDiagnostic(JSON.stringify({
    _tag: 'Error',
    error: {
      code: 'LegacyDbQueryUnexpectedStatusError',
      message: 'unexpected status 500: {"other":{"code":"57014"}}',
    },
  })).sqlstate, null);

  const f = fixture();
  f.dependencies.runCli = async (executable, args) => {
    const filename = path.basename(args[4]);
    if (filename !== 'catalog-union-readonly.sql') {
      return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(f.rows[filename])) };
    }
    return {
      status: 1,
      stdout,
      failureMetadata: subprocessFailureMetadata({ status: 1, stdout, stderr: '' }),
    };
  };
  await assert.rejects(
    () => createReadOnlyCollector(f.dependencies)({
      anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
    }),
    (error) => {
      assert.match(error.message, /LegacyDbQueryUnexpectedStatusError/);
      assert.match(error.message, /"httpStatus":500/);
      assert.equal(error.message.includes(sentinel), false);
      return true;
    },
  );
  assert.equal(f.bundle, null);
});

test('failed catalog union localizes the first failing frozen category without publication', async () => {
  const sentinel = 'SENTINEL_PROBE_RESPONSE_BODY';
  const f = fixture();
  const calls = [];
  f.dependencies.runCli = async (executable, args) => {
    const filename = path.basename(args[4]);
    calls.push(filename);
    if (filename === 'catalog-presence-readonly.sql' ||
        filename === 'cron-presence-readonly.sql') {
      return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(f.rows[filename])) };
    }
    if (filename === 'catalog-union-readonly.sql') {
      const stdout = JSON.stringify({
        _tag: 'Error',
        error: {
          code: 'LegacyDbQueryUnexpectedStatusError',
          message: 'unexpected status 400: {"message":"UNION_SENTINEL"}',
        },
      });
      return {
        status: 1,
        stdout,
        failureMetadata: subprocessFailureMetadata({ status: 1, stdout, stderr: '' }),
      };
    }
    const range = filename.match(/catalog-diagnostic-(\d{2})-(\d{2})-readonly\.sql/);
    const leaf = filename.match(/catalog-(\d{2})-[a-z-]+-readonly\.sql/);
    const start = range ? Number(range[1]) : Number(leaf?.[1]);
    const end = range ? Number(range[2]) : start;
    const fails = start <= 13 && end >= 13;
    return fails
      ? { status: 1, stdout: sentinel, failureMetadata: subprocessFailureMetadata({ status: 1, stdout: sentinel, stderr: '' }) }
      : { status: 0, stdout: sentinel };
  };
  await assert.rejects(
    () => createReadOnlyCollector(f.dependencies)({
      anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
    }),
    (error) => {
      assert.match(error.message, /CATALOG_LOCALIZATION_ONLY/);
      assert.match(error.message, /"outcome":"FIRST_FAILING_CATEGORY"/);
      assert.match(error.message, /"category":"routine"/);
      assert.match(error.message, /"filename":"catalog-13-routine-readonly\.sql"/);
      assert.equal(error.message.includes(sentinel), false);
      assert.equal(error.message.includes('UNION_SENTINEL'), false);
      return true;
    },
  );
  assert.deepEqual(calls.slice(3), [
    'catalog-diagnostic-01-10-readonly.sql',
    'catalog-diagnostic-11-19-readonly.sql',
    'catalog-diagnostic-11-15-readonly.sql',
    'catalog-diagnostic-16-19-readonly.sql',
    'catalog-diagnostic-11-13-readonly.sql',
    'catalog-diagnostic-14-15-readonly.sql',
    'catalog-diagnostic-11-12-readonly.sql',
    'catalog-13-routine-readonly.sql',
  ]);
  assert.equal(f.bundle, null);
});

test('failed full union with passing halves reports only the union wrapper range', async () => {
  const f = fixture();
  const probes = [];
  f.dependencies.runCli = async (executable, args) => {
    const filename = path.basename(args[4]);
    if (filename === 'catalog-presence-readonly.sql' ||
        filename === 'cron-presence-readonly.sql') {
      return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(f.rows[filename])) };
    }
    if (filename === 'catalog-union-readonly.sql') {
      return {
        status: 1,
        stdout: '',
        failureMetadata: subprocessFailureMetadata({ status: 1, stdout: '', stderr: '' }),
      };
    }
    probes.push(filename);
    return { status: 0, stdout: 'SENTINEL_PASS_BODY' };
  };
  await assert.rejects(
    () => createReadOnlyCollector(f.dependencies)({
      anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
    }),
    (error) => {
      assert.match(error.message, /CATALOG_LOCALIZATION_ONLY/);
      assert.match(error.message, /"outcome":"UNION_WRAPPER_RANGE"/);
      assert.match(error.message, /"start":1,"end":19/);
      assert.equal(error.message.includes('SENTINEL_PASS_BODY'), false);
      return true;
    },
  );
  assert.deepEqual(probes, [
    'catalog-diagnostic-01-10-readonly.sql',
    'catalog-diagnostic-11-19-readonly.sql',
  ]);
  assert.equal(f.bundle, null);
});

test('catalog localization exhaustively reaches every frozen leaf within the formal budget', async () => {
  for (let target = 1; target <= CATALOG_SPLIT_FILENAMES.length; target += 1) {
    const f = fixture();
    const calls = [];
    f.dependencies.runCli = async (executable, args) => {
      const filename = path.basename(args[4]);
      calls.push(filename);
      if (filename === 'catalog-presence-readonly.sql' ||
          filename === 'cron-presence-readonly.sql') {
        return { status: 0, stdout: JSON.stringify(pinnedCliEnvelope(f.rows[filename])) };
      }
      if (filename === 'catalog-union-readonly.sql') {
        return {
          status: 1,
          stdout: '',
          failureMetadata: subprocessFailureMetadata({ status: 1, stdout: '', stderr: '' }),
        };
      }
      const range = filename.match(/catalog-diagnostic-(\d{2})-(\d{2})-readonly\.sql/);
      const leaf = filename.match(/catalog-(\d{2})-[a-z-]+-readonly\.sql/);
      const start = range ? Number(range[1]) : Number(leaf?.[1]);
      const end = range ? Number(range[2]) : start;
      return start <= target && end >= target
        ? { status: 1, stdout: 'SENTINEL_LEAF_FAILURE', failureMetadata: subprocessFailureMetadata({ status: 1, stdout: 'SENTINEL_LEAF_FAILURE', stderr: '' }) }
        : { status: 0, stdout: 'SENTINEL_LEAF_PASS' };
    };
    await assert.rejects(
      () => createReadOnlyCollector(f.dependencies)({
        anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
      }),
      (error) => {
        assert.match(error.message, /"outcome":"FIRST_FAILING_CATEGORY"/);
        assert.match(
          error.message,
          new RegExp(`"filename":"${CATALOG_SPLIT_FILENAMES[target - 1]}"`),
        );
        assert.equal(error.message.includes('SENTINEL_LEAF'), false);
        return true;
      },
    );
    assert.ok(calls.length - 3 <= 10, `target ${target} exceeded ten probes`);
    assert.ok(calls.length <= 13, `target ${target} exceeded thirteen total calls`);
    assert.equal(f.bundle, null);
  }
});

test('verified cleanup preserves primary failure and reports cleanup failure independently', async () => {
  const removedTree = mkdtempSync(path.join(os.tmpdir(), 'cleanup-primary-'));
  writeFileSync(path.join(removedTree, 'copy.sql'), 'frozen');
  await assert.rejects(
    () => runWithVerifiedCleanup(
      async () => { throw new Error('Read-only query subprocess failed: catalog-readonly.sql.'); },
      async () => rmSync(removedTree, { recursive: true }),
    ),
    /subprocess failed/,
  );
  assert.equal(existsSync(removedTree), false);

  const preservedTree = mkdtempSync(path.join(os.tmpdir(), 'cleanup-failed-'));
  await assert.rejects(
    () => runWithVerifiedCleanup(
      async () => { throw new Error('Read-only query subprocess timeout: catalog-readonly.sql.'); },
      async () => { throw new Error('SENTINEL_CLEANUP_DETAIL'); },
    ),
    (error) => {
      assert.match(error.message, /subprocess timeout.*CLEANUP_STATUS: FAILED/);
      assert.equal(error.message.includes('SENTINEL_CLEANUP_DETAIL'), false);
      return true;
    },
  );
  assert.equal(existsSync(preservedTree), true);
  rmSync(preservedTree, { recursive: true });
});

test('Windows bounded child timeout reaps the direct child and cleanup removes its staged tree', {
  skip: process.platform !== 'win32',
}, async () => {
  const tree = mkdtempSync(path.join(os.tmpdir(), 'bounded-child-timeout-'));
  const stagedFile = path.join(tree, 'frozen.sql');
  writeFileSync(stagedFile, 'select 1;');
  let childPid = null;
  let bundlePublished = false;
  await assert.rejects(
    () => runWithVerifiedCleanup(
      async () => {
        const childScript = [
          "const fs=require('node:fs');",
          "const handle=fs.openSync(process.argv[1],'r');",
          "process.stdout.write('READY');",
          "setInterval(()=>fs.fstatSync(handle),25);",
        ].join('');
        const result = runBoundedSubprocess(
          process.execPath,
          ['-e', childScript, stagedFile],
          { timeoutMs: 250, maxBufferBytes: 1024 },
        );
        childPid = result.pid;
        assert.equal(result.error?.code, 'ETIMEDOUT');
        const metadata = subprocessFailureMetadata(result);
        throw new Error(
          `Read-only query subprocess timeout: catalog-readonly.sql. ` +
          `CATALOG_SUBPROCESS_ONLY ${JSON.stringify(metadata)}`,
        );
      },
      async () => {
        rmSync(tree, { recursive: true });
        if (existsSync(tree)) throw new Error('cleanup postcondition');
      },
    ),
    (error) => {
      assert.match(error.message, /subprocess timeout: catalog-readonly\.sql/);
      assert.match(error.message, /CATALOG_SUBPROCESS_ONLY/);
      assert.equal(error.message.includes('READY'), false);
      return true;
    },
  );
  assert.equal(bundlePublished, false);
  assert.equal(existsSync(tree), false);
  assert.ok(Number.isSafeInteger(childPid));
  assert.throws(() => process.kill(childPid, 0));
});

test('collector accepts only the exact pinned CLI envelope and never leaks rejected values', async () => {
  const sentinelString = 'SENTINEL_SECRET_CATALOG_VALUE';
  const hostileKey = 'HOSTILE_SECRET_DYNAMIC_KEY';
  const invalidOutputs = [
    JSON.stringify([]),
    JSON.stringify({ rows: [] }),
    JSON.stringify({ boundary: '', rows: [], warning: '', extra: sentinelString }),
    JSON.stringify({ boundary: 1, rows: [], warning: '' }),
    JSON.stringify({ boundary: '', rows: {}, warning: '' }),
    JSON.stringify({ boundary: '', rows: [], warning: null }),
    JSON.stringify({
      boundary: '',
      rows: [{ category: 'ledger_presence', definition: null, object_key: 'x' }],
      warning: '',
    }),
    JSON.stringify({
      boundary: '',
      rows: [{ category: 'ledger_presence', definition: [], object_key: 'x' }],
      warning: '',
    }),
    JSON.stringify({
      boundary: '',
      rows: [{ category: 'ledger_presence', definition: { relation: null } }],
      warning: '',
    }),
    JSON.stringify({
      boundary: sentinelString,
      rows: [{ category: sentinelString, definition: { [hostileKey]: sentinelString }, object_key: sentinelString }],
      warning: sentinelString,
    }),
  ];
  for (const stdout of invalidOutputs) {
    const f = fixture();
    f.dependencies.runCli = async () => ({ status: 0, stdout });
    await assert.rejects(
      () => createReadOnlyCollector(f.dependencies)({
        anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
      }),
      (error) => {
        assert.equal(error.message.includes(sentinelString), false);
        assert.equal(error.message.includes(hostileKey), false);
        return true;
      },
    );
    assert.equal(f.bundle, null);
  }
});

test('production collector rejects hostile boundary and warning metadata without leaking or publishing', async () => {
  const validBoundary = '0123456789abcdef0123456789abcdef';
  const wrongSameLengthWarning = `${PINNED_CLI_WARNING_TEMPLATE.prefix}${'f'.repeat(32)}${PINNED_CLI_WARNING_TEMPLATE.suffix}`;
  const cases = [
    { boundary: validBoundary.toUpperCase(), warning: pinnedCliEnvelope([]).warning },
    { boundary: validBoundary.slice(1), warning: pinnedCliEnvelope([]).warning },
    { boundary: `${validBoundary.slice(0, 31)}g`, warning: pinnedCliEnvelope([]).warning },
    { boundary: validBoundary, warning: wrongSameLengthWarning },
    { boundary: validBoundary, warning: 'SENTINEL_SECRET_WARNING' },
    { boundary: 'SENTINEL_SECRET_BOUNDARY', warning: 'SENTINEL_SECRET_WARNING' },
  ];
  for (const metadata of cases) {
    const hostile = fixture();
    hostile.dependencies.runCli = async () => ({
      status: 0,
      stdout: JSON.stringify({
        ...metadata,
        rows: hostile.rows['catalog-presence-readonly.sql'],
      }),
    });
    await assert.rejects(
      () => createReadOnlyCollector(hostile.dependencies)({
        anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e'),
      }),
      (error) => {
        assert.match(error.message, /metadata rejected/);
        assert.equal(error.message.includes(metadata.boundary), false);
        assert.equal(error.message.includes(metadata.warning), false);
        assert.ok(error.message.length < 256);
        return true;
      },
    );
    assert.equal(hostile.bundle, null);
  }
});

test('production import graph has no test-only success harness', () => {
  const productionFiles = [
    'one-process-executor.mjs',
    'collect-readonly.mjs',
    'audit.mjs',
  ];
  for (const filename of productionFiles) {
    const source = readFileSync(new URL(`./${filename}`, import.meta.url), 'utf8');
    assert.equal(source.includes('one-process-executor.test-harness'), false, filename);
    assert.equal(source.includes('createReadOnlyCollectorForTests'), false, filename);
  }
  assert.equal(
    existsSync(new URL('./one-process-executor.test-harness.mjs', import.meta.url)),
    false,
  );
  const productionSource = readFileSync(
    new URL('./one-process-executor.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(/export\s+function\s+createReadOnlyCollectorForTests/.test(productionSource), false);
});

test('pinned wrapper constants match value-free provenance and derive from the exact CLI offline', () => {
  const provenance = JSON.parse(readFileSync(
    new URL('./supabase-2.110.0-json-envelope-provenance.json', import.meta.url),
    'utf8',
  ));
  const binary = readFileSync(provenance.cli.canonicalPath);
  assert.equal(sha256(binary), provenance.cli.sha256);
  const tokens = new Set(binary.toString('latin1').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  const derived = {};
  for (const token of tokens) {
    if (![7, 8].includes(token.length)) continue;
    const digest = sha256(token);
    if (Object.hasOwn(provenance.offlineKeyDerivation.result, digest)) {
      derived[digest] = token;
    }
  }
  assert.deepEqual(derived, provenance.offlineKeyDerivation.result);
  const derivedKeys = [
    ...Object.values(derived),
    provenance.observedStructureOnly.structure.entries.find((entry) => entry.key === 'rows').key,
  ].sort();
  assert.deepEqual(PINNED_CLI_JSON_WRAPPER.keys, derivedKeys);
  assert.equal(
    Buffer.byteLength(
      `${PINNED_CLI_WARNING_TEMPLATE.prefix}${'0'.repeat(32)}${PINNED_CLI_WARNING_TEMPLATE.suffix}`,
      'utf8',
    ),
    PINNED_CLI_WARNING_TEMPLATE.utf8Bytes,
  );
  const derivation = provenance.binarySourceDerivation;
  assert.equal(derivation.binarySha256, provenance.cli.sha256);
  assert.equal(derivation.boundaryGenerator, 'crypto.randomBytes(16).toString("hex")');
  assert.equal(derivation.warningTemplate.prefixUtf8Bytes, Buffer.byteLength(PINNED_CLI_WARNING_TEMPLATE.prefix));
  assert.equal(derivation.warningTemplate.suffixUtf8Bytes, Buffer.byteLength(PINNED_CLI_WARNING_TEMPLATE.suffix));
  assert.equal(derivation.warningTemplate.prefixSha256, sha256(PINNED_CLI_WARNING_TEMPLATE.prefix));
  assert.equal(derivation.warningTemplate.suffixSha256, sha256(PINNED_CLI_WARNING_TEMPLATE.suffix));
  assert.equal(derivation.warningTemplate.renderedUtf8Bytes, PINNED_CLI_WARNING_TEMPLATE.utf8Bytes);
  assert.equal(
    derivation.warningTemplate.rendering.replace('{boundary}', '0'.repeat(32)),
    `${PINNED_CLI_WARNING_TEMPLATE.prefix}${'0'.repeat(32)}${PINNED_CLI_WARNING_TEMPLATE.suffix}`,
  );
  assert.equal(provenance.sanitization.catalogValuesIncluded, false);
  assert.equal(provenance.sanitization.rawStdoutIncluded, false);
  assert.equal(provenance.plaintextEvidence.rows.includes('plaintext'), true);
  assert.equal(provenance.catalogFailureDiagnostic.scope.runtimeQueryFilename, 'catalog-union-readonly.sql');
  assert.equal(provenance.catalogFailureDiagnostic.rawContentEmitted, false);
  assert.equal(provenance.catalogFailureDiagnostic.firstFailureOnly, true);
  assert.equal(provenance.catalogFailureDiagnostic.publicationOnFailure, false);
  assert.deepEqual(provenance.catalogFailureDiagnostic.stdoutJsonCaps, {
    maximumDepth: 4,
    maximumObjectEntries: 16,
    maximumArrayItems: 8,
  });
  assert.equal(
    provenance.catalogFailureDiagnostic.legacyUnexpectedStatus.binarySha256,
    provenance.cli.sha256,
  );
  assert.equal(
    provenance.catalogFailureDiagnostic.legacyUnexpectedStatus.codeSha256,
    sha256('LegacyDbQueryUnexpectedStatusError'),
  );
  assert.equal(
    provenance.catalogFailureDiagnostic.legacyUnexpectedStatus.templatePrefixSha256,
    sha256('unexpected status '),
  );
  assert.equal(
    provenance.catalogFailureDiagnostic.legacyUnexpectedStatus.templateSeparatorSha256,
    sha256(': '),
  );
  assert.equal(provenance.catalogFailureDiagnostic.legacyUnexpectedStatus.messageCapBytes, 65536);
  assert.equal(provenance.catalogFailureDiagnostic.failureLocalization.publication, false);
  assert.equal(provenance.catalogFailureDiagnostic.failureLocalization.maximumProbeCalls, 10);
  assert.equal(provenance.catalogUnionRequestBudget.baseQueries, 8);
  assert.equal(provenance.catalogUnionRequestBudget.optionalQueriesMaximum, 2);
  assert.equal(provenance.catalogUnionRequestBudget.maximumQueriesPerSingleUseRun, 13);
  assert.equal(provenance.catalogUnionRequestBudget.minimumFreshReceiptWindowMilliseconds, 255000);
  assert.equal(provenance.bundleAuthority.receiptFilename, 'receipt.json');
  assert.deepEqual(provenance.bundleAuthority.receiptBodyKeys, [
    'artifacts', 'cli', 'expiresAt', 'formatVersion', 'issuedAt', 'nonce', 'projectRef',
  ]);
  assert.equal(provenance.bundleAuthority.receiptDigestField, 'receiptSha256');
  assert.deepEqual(provenance.bundleAuthority.envelopeBindingFields, [
    'nonce', 'projectRef', 'receiptSha256',
  ]);
  assert.deepEqual(provenance.serverVersionEvidence, {
    evidenceType: 'server-version', exactRecords: 1,
    fields: ['server_version_num'], filename: 'server-version.json',
    privacy: 'No database, role, system identifier, object, or user values are selected.',
    queryFilename: 'server-version-readonly.sql',
  });
});

test('collector propagates timeout and never publishes partial evidence', async () => {
  const timed = fixture();
  timed.dependencies.runCli = async () => { throw new Error('Read-only query subprocess timeout.'); };
  await assert.rejects(
    () => createReadOnlyCollector(timed.dependencies)({ anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e') }),
    /timeout/,
  );
  assert.equal(timed.bundle, null);
});

test('collector rejects external receipt, plan, and executable authority', async () => {
  const f = fixture();
  await assert.rejects(
    () => createReadOnlyCollector(f.dependencies)({
      anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: 'e', receipt: {},
    }),
    /Only external anchor/,
  );
  assert.equal(f.calls.length, 0);
});

test('collector rejects extra fields, duplicate identities, wrong categories, and invalid presence leaves', async () => {
  for (const mutate of [
    (f) => { f.rows['catalog-presence-readonly.sql'][0].extra = true; },
    (f) => { f.rows['catalog-union-readonly.sql'].push(structuredClone(f.rows['catalog-union-readonly.sql'][0])); },
    (f) => { f.rows['catalog-union-readonly.sql'][0].category = 'unknown'; },
    (f) => { f.rows['catalog-presence-readonly.sql'][0].definition.relation = 'public.posts'; },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(
      () => createReadOnlyCollector(f.dependencies)({ anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e') }),
      /rejected|Duplicate/,
    );
    assert.equal(f.bundle, null);
  }
});

test('collector rejects invalid keys, nullability, arrays, digests, versions, timestamps, and integers', async () => {
  const cases = [
    { options: {}, mutate: (f) => { f.rows['catalog-union-readonly.sql'][0].object_key = ''; } },
    { options: {}, mutate: (f) => { f.rows['catalog-union-readonly.sql'][0].definition.version = null; } },
    { options: {}, mutate: (f) => {
      f.rows['deterministic-config-readonly.sql'] = [{
        category: 'storage_bucket_config', object_key: 'media',
        definition: { allowed_mime_types: [['nested']], file_size_limit: 1, public: false },
      }];
    } },
    { options: { cron: true }, mutate: (f) => { f.rows['cron-config-readonly.sql'][0].definition.command_sha256 = 'BAD'; } },
    { options: { ledger: true }, mutate: (f) => {
      f.rows['catalog-ledger-readonly.sql'][0].object_key = '1';
      f.rows['catalog-ledger-readonly.sql'][0].definition.version = '1';
    } },
    { options: {}, mutate: (f) => {
      f.rows['deterministic-config-readonly.sql'] = [{
        category: 'official_challenge_config', object_key: 'daily',
        definition: {
          cadence: 'daily', difficulty: 'beginner', ends_at: 'not-a-time', metric: 'consistency',
          rest_day_tokens: 0, starts_at: '2026-01-01T00:00:00Z', target: 1, title: 'Show up',
        },
      }];
    } },
    { options: {}, mutate: (f) => { f.rows['catalog-operational-readonly.sql'][0].definition.count = '-1'; } },
    { options: {}, mutate: (f) => {
      f.rows['catalog-union-readonly.sql'] = [{
        category: 'sequence', object_key: 'public.max_bigint_sequence',
        definition: {
          cache: '1', cycle: false, increment: '1', maximum: '9223372036854775807',
          minimum: '1', owner: 'postgres', start: '9223372036854775807', type: 'bigint',
        },
      }];
      f.rows['catalog-union-readonly.sql'][0].definition.increment = '+1';
    } },
  ];
  for (const item of cases) {
    const f = fixture(item.options);
    item.mutate(f);
    await assert.rejects(
      () => createReadOnlyCollector(f.dependencies)({ anchorPath: 'a', approvedDigest: 'd'.repeat(64), outputDir: path.resolve('e') }),
      /rejected/,
    );
    assert.equal(f.bundle, null);
  }
});

test('atomic writer restricts modes and cleans temporary output after failure', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'collector-atomic-'));
  const output = path.join(parent, 'evidence');
  assert.throws(
    () => writeBundleAtomic(
      output,
      { 'first.json': '{}', 'missing/second.json': '{}' },
      { directoryMode: 0o700, fileMode: 0o600 },
      process.platform === 'win32' ? resolveWindowsSystemTools(approvedWindowsTrust()) : null,
    ),
  );
  assert.equal(existsSync(output), false);
  assert.deepEqual(readdirSync(parent), []);
});

test('atomic writer permits only the exact receipt and evidence filename contract', () => {
  assert.deepEqual(REQUIRED_BUNDLE_FILENAMES, [
    'auth-signup-trigger.json', 'catalog.json', 'cron-presence.json',
    'current-state-flags.json', 'deterministic-config.json', 'ledger-presence.json',
    'operational-counts.json', 'receipt.json', 'server-version.json',
  ]);
  assert.deepEqual(OPTIONAL_BUNDLE_FILENAMES, ['cron-config.json', 'ledger.json']);
  const parent = mkdtempSync(path.join(os.tmpdir(), 'collector-allowlist-'));
  assert.throws(
    () => writeBundleAtomic(
      path.join(parent, 'evidence'),
      Object.fromEntries([...REQUIRED_BUNDLE_FILENAMES, 'unexpected.json'].map((name) => [name, '{}'])),
      { directoryMode: 0o700, fileMode: 0o600 },
      process.platform === 'win32' ? resolveWindowsSystemTools(approvedWindowsTrust()) : null,
    ),
    /Evidence filename contract rejected/u,
  );
  assert.deepEqual(readdirSync(parent), []);
});

test('canonical path checks reject traversal, project output, and symbolic links', (t) => {
  assert.throws(() => canonicalRegularFile('x/../y', 'test'), /traversal/);
  assert.throws(
    () => assertSafeOutputTarget(path.resolve('scripts/migration-audit/evidence-new')),
    /outside the project/,
  );
  const parent = mkdtempSync(path.join(os.tmpdir(), 'collector-links-'));
  const target = path.join(parent, 'target.json');
  const link = path.join(parent, 'link.json');
  writeFileSync(target, '{}');
  try {
    symlinkSync(target, link, 'file');
  } catch {
    t.skip('Symbolic-link creation is unavailable on this Windows host.');
    return;
  }
  assert.throws(() => canonicalRegularFile(link, 'approval'), /non-link|canonical/);
});

test('Windows ACL sequence removes inheritance, applies SID recursively, and rejects broad principals', () => {
  const systemTools = resolveWindowsSystemTools(approvedWindowsTrust());
  const calls = [];
  const aclJson = (targets, overrides = {}) => JSON.stringify(targets.map((target) => ({
    target: path.resolve(target),
    inheritanceProtected: true,
    rules: [{
      sid: 'S-1-5-21-1', rights: 2032127, accessType: 'Allow', inherited: false,
    }],
    ...overrides,
  })));
  const run = (exe, args) => {
    calls.push([exe, args]);
    return exe === systemTools.powershell
      ? { status: 0, stdout: aclJson(['C:\\evidence']), error: null }
      : { status: 0, stdout: 'localized ACL output', error: null };
  };
  restrictAndVerifyWindowsAcl('C:\\evidence', '*S-1-5-21-1', run, '(OI)(CI)F', undefined, systemTools);
  assert.equal(calls[0][0], systemTools.icacls);
  assert.equal(calls[1][0], systemTools.icacls);
  assert.equal(calls[2][0], systemTools.powershell);
  assert.deepEqual(calls[0][1], [
    'C:\\evidence', '/inheritance:r', '/C',
  ]);
  assert.deepEqual(calls[1][1], [
    'C:\\evidence', '/grant:r', '*S-1-5-21-1:F', '/C',
  ]);
  assert.deepEqual(calls[2][1].slice(0, 7), [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.resolve('scripts/migration-audit/inspect-windows-acl.ps1'),
  ]);
  assert.deepEqual(calls[2][1].slice(-2), ['-Root', 'C:\\evidence']);
  assert.throws(
    () => restrictAndVerifyWindowsAcl('C:\\evidence', '*S-1-5-21-1', (exe, args) => {
      return exe === systemTools.powershell
        ? {
          status: 0,
          stdout: aclJson(['C:\\evidence'], {
            rules: [{ sid: 'S-1-5-11', rights: 131209, accessType: 'Allow', inherited: false }],
          }),
          error: null,
        }
        : { status: 0, stdout: '完全本地化的 ACL 输出', error: null };
    }, '(OI)(CI)F', undefined, systemTools),
    /broad principal/,
  );
  const tree = mkdtempSync(path.join(os.tmpdir(), 'acl-tree-'));
  writeFileSync(path.join(tree, 'child.json'), '{}');
  const targets = [tree, path.join(tree, 'child.json')];
  const malformedOutputs = [
    '{}',
    aclJson([tree]),
    aclJson([tree, tree]),
    aclJson(targets, { inheritanceProtected: false }),
    aclJson(targets, {
      rules: [{ sid: 'S-1-5-21-1', rights: 131209, accessType: 'Allow', inherited: false }],
    }),
  ];
  for (const stdout of malformedOutputs) {
    assert.throws(
      () => restrictAndVerifyWindowsAcl(tree, '*S-1-5-21-1', (exe) =>
        exe === systemTools.powershell
          ? { status: 0, stdout, error: null }
          : { status: 0, stdout: '', error: null }, '(OI)(CI)F', undefined, systemTools),
      /rejected|postcondition|rights/,
    );
  }
});

test('Windows ACL inspector integrates with a real temporary tree', { skip: process.platform !== 'win32' }, () => {
  const systemTools = resolveWindowsSystemTools(approvedWindowsTrust());
  const tree = mkdtempSync(path.join(os.tmpdir(), 'acl-integration-'));
  writeFileSync(path.join(tree, 'child.json'), '{}');
  const identity = spawnSync(systemTools.whoami, ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8', windowsHide: true,
  });
  const sid = identity.stdout.match(/"[^"]*","(S-[0-9-]+)"/i)?.[1];
  assert.ok(sid);
  try {
    restrictAndVerifyWindowsAcl(tree, `*${sid}`, spawnSync, '(OI)(CI)F', undefined, systemTools);
  } finally {
    spawnSync(systemTools.icacls, [tree, '/reset', '/T', '/C'], { encoding: 'utf8', windowsHide: true });
    spawnSync(systemTools.icacls, [tree, '/inheritance:e', '/T', '/C'], { encoding: 'utf8', windowsHide: true });
    rmSync(tree, { recursive: true, force: true });
  }
});

test('Windows ACL verifier treats an immutable SQL target as a file, not a directory', () => {
  const systemTools = resolveWindowsSystemTools(approvedWindowsTrust());
  const parent = mkdtempSync(path.join(os.tmpdir(), 'acl-sql-file-'));
  const sqlFile = path.join(parent, `${'a'.repeat(64)}.sql`);
  writeFileSync(sqlFile, 'begin read only; select 1; rollback;');
  const calls = [];
  try {
    restrictAndVerifyWindowsAcl(sqlFile, '*S-1-5-21-1', (exe, args) => {
      calls.push([exe, args]);
      return exe === systemTools.powershell
        ? {
          status: 0,
          stdout: JSON.stringify([{
            target: path.resolve(sqlFile),
            inheritanceProtected: true,
            rules: [{
              sid: 'S-1-5-21-1', rights: 1179785, accessType: 'Allow', inherited: false,
            }],
          }]),
          error: null,
        }
        : { status: 0, stdout: '', error: null };
    }, 'R', undefined, systemTools);
    assert.equal(calls.filter(([exe]) => exe === systemTools.powershell).length, 1);
    assert.equal(calls.some(([, args]) => args.includes('/T')), false);
    const exact = {
      sid: 'S-1-5-21-1', rights: 1179785, accessType: 'Allow', inherited: false,
    };
    const forbiddenCurrentRuleSets = [
      [exact, { ...exact, rights: 2032127 }],
      [exact, { ...exact, rights: 1179817 }],
      [exact, { ...exact, accessType: 'Deny' }],
    ];
    for (const rules of forbiddenCurrentRuleSets) {
      assert.throws(
        () => restrictAndVerifyWindowsAcl(sqlFile, '*S-1-5-21-1', (exe) =>
          exe === systemTools.powershell
            ? {
              status: 0,
              stdout: JSON.stringify([{
                target: path.resolve(sqlFile),
                inheritanceProtected: true,
                rules,
              }]),
              error: null,
            }
            : { status: 0, stdout: '', error: null }, 'R', undefined, systemTools),
        /current-principal rights rejected/,
      );
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('Windows standard read ACL mask includes only Read plus Synchronize', { skip: process.platform !== 'win32' }, () => {
  const systemTools = resolveWindowsSystemTools(approvedWindowsTrust());
  const parent = mkdtempSync(path.join(os.tmpdir(), 'acl-real-sql-file-'));
  const sqlFile = path.join(parent, `${'b'.repeat(64)}.sql`);
  writeFileSync(sqlFile, 'begin read only; select 1; rollback;');
  const identity = spawnSync(systemTools.whoami, ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8', windowsHide: true,
  });
  const sid = identity.stdout.match(/"[^"]*","(S-[0-9-]+)"/i)?.[1];
  assert.ok(sid);
  try {
    restrictAndVerifyWindowsAcl(sqlFile, `*${sid}`, spawnSync, 'R', undefined, systemTools);
  } finally {
    spawnSync(systemTools.icacls, [sqlFile, '/reset', '/C'], { encoding: 'utf8', windowsHide: true });
    spawnSync(systemTools.icacls, [sqlFile, '/inheritance:e', '/C'], { encoding: 'utf8', windowsHide: true });
    rmSync(parent, { recursive: true, force: true });
  }
});

test('Windows protected SQL tree cleanup restores exact current-SID full control only at cleanup', {
  skip: process.platform !== 'win32',
}, () => {
  const systemTools = resolveWindowsSystemTools(approvedWindowsTrust());
  const parent = mkdtempSync(path.join(os.tmpdir(), 'acl-cleanup-tree-'));
  const sqlFile = path.join(parent, `${'c'.repeat(64)}.sql`);
  writeFileSync(sqlFile, 'begin read only; select 1; rollback;');
  const identity = spawnSync(systemTools.whoami, ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8', windowsHide: true,
  });
  const sid = identity.stdout.match(/"[^"]*","(S-[0-9-]+)"/i)?.[1];
  assert.ok(sid);
  try {
    restrictAndVerifyWindowsAcl(parent, `*${sid}`, spawnSync, '(OI)(CI)RX', undefined, systemTools);
    assert.throws(
      () => restoreWindowsAclForCleanup(parent, `*${sid}`, systemTools, (exe) =>
        exe === systemTools.powershell
          ? { status: 0, stdout: 'not-json', error: null }
          : { status: 0, stdout: '', error: null }),
      /not JSON/,
    );
    assert.equal(existsSync(parent), true);
    restoreWindowsAclForCleanup(parent, `*${sid}`, systemTools);
    rmSync(parent, { recursive: true, force: true });
    assert.equal(existsSync(parent), false);
  } finally {
    if (existsSync(parent)) {
      try { restoreWindowsAclForCleanup(parent, `*${sid}`, systemTools); } catch {}
      rmSync(parent, { recursive: true, force: true });
    }
  }
});

test('Windows system tool resolver ignores environment substitution and rejects unapproved, missing, or linked roots', (t) => {
  const approved = approvedWindowsTrust();
  const tools = resolveWindowsSystemTools(approved);
  const canonicalSystem = path.join(path.resolve(process.env.SystemRoot), 'System32').toLowerCase();
  for (const executable of [tools.powershell, tools.icacls, tools.whoami]) {
    assert.equal(path.isAbsolute(executable), true);
    assert.equal(executable.toLowerCase().startsWith(`${canonicalSystem}${path.sep}`), true);
    assert.equal(executable.toLowerCase().includes('path-substitution'), false);
  }
  const missingParent = mkdtempSync(path.join(os.tmpdir(), 'missing-system-root-'));
  const missing = path.join(missingParent, 'absent');
  assert.throws(
    () => resolveWindowsSystemTools({ ...approved, systemRoot: missing }),
    /ENOENT|unavailable|real directory/,
  );
  rmSync(missingParent, { recursive: true, force: true });
  const canonicalFakeRoot = mkdtempSync(path.join(os.tmpdir(), 'complete-fake-system-root-'));
  mkdirSync(path.join(canonicalFakeRoot, 'System32', 'WindowsPowerShell', 'v1.0'), { recursive: true });
  writeFileSync(path.join(canonicalFakeRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), 'fake');
  writeFileSync(path.join(canonicalFakeRoot, 'System32', 'icacls.exe'), 'fake');
  writeFileSync(path.join(canonicalFakeRoot, 'System32', 'whoami.exe'), 'fake');
  assert.throws(
    () => resolveWindowsSystemTools({ ...approved, systemRoot: canonicalFakeRoot }),
    /identity mismatch/,
  );
  rmSync(canonicalFakeRoot, { recursive: true, force: true });
  const fakeRoot = mkdtempSync(path.join(os.tmpdir(), 'linked-system-root-'));
  const linkedRoot = `${fakeRoot}-link`;
  try {
    symlinkSync(fakeRoot, linkedRoot, 'junction');
  } catch {
    t.diagnostic('Windows host does not permit link creation for the resolver rejection fixture.');
    rmSync(fakeRoot, { recursive: true, force: true });
    return;
  }
  try {
    assert.throws(
      () => resolveWindowsSystemTools({ ...approved, systemRoot: linkedRoot }),
      /real directory|canonical/,
    );
  } finally {
    rmdirSync(linkedRoot);
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});
