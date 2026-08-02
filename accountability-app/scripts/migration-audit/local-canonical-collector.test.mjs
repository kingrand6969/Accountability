import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizedJson } from './core.mjs';

import {
  DISPOSABLE_CONTAINER,
  LOCAL_QUERY_PLAN,
  createLocalCanonicalCollector,
  assertNoRelevantStatus,
  localPackageIdentity,
  localPackageManifest,
  verifyPinnedLocalRuntime,
  parsePsqlCsvRows,
  replayProvenance,
  validateReplayLedger,
} from './local-canonical-collector.mjs';

const evidenceTestRoot = path.resolve('.tmp/local-canonical-evidence');
mkdirSync(evidenceTestRoot, { recursive: true });
function testRoot(prefix) { return mkdtempSync(path.join(evidenceTestRoot, prefix)); }
function requireFiles(target) { return readdirSync(target).sort(); }

test('HEAD cleanliness rejects unstaged, staged, and untracked relevant paths', () => {
  assert.equal(assertNoRelevantStatus(''), true);
  assert.throws(() => assertNoRelevantStatus(' M accountability-app/supabase/migrations/0057_r2_sign_limit.sql'), /0057_r2_sign_limit/u);
  assert.throws(() => assertNoRelevantStatus('M  accountability-app/supabase/migrations/0096_ai_moderation_quarantine.sql'), /0096_ai_moderation/u);
  assert.throws(() => assertNoRelevantStatus(' M accountability-app/scripts/migration-audit/core.mjs'), /core\.mjs/u);
  assert.throws(() => assertNoRelevantStatus('?? accountability-app/supabase/functions/moderate-content/extra.ts'), /extra\.ts/u);
});
const testPin = { status: 'APPROVED', pinSha256: '8'.repeat(64), package: localPackageIdentity(), container: { id: 'f'.repeat(64) }, psql: { absolutePath: '/canonical/psql' }, database: {}, ledgerVersions: [] };
const collector = (options = {}) => createLocalCanonicalCollector({
  approvedPin: testPin, verifyRuntime: () => ({ identity: 'verified' }), protectEvidence: () => {}, ...options,
});

test('trusted runtime verification binds full inspect projection, canonical psql hash, Unix socket database identity, and exact ledger', () => {
  const ledgerVersions = Array.from({ length: 96 }, (_, i) => String(i + 1).padStart(4, '0'));
  const container = {
    Id: 'f'.repeat(64), Name: '/supabase_db_tmp-ledger-replay-0079', Image: 'sha256:' + 'e'.repeat(64),
    State: { Running: true },
    Config: { Image: 'image', Entrypoint: ['entry'], Cmd: ['cmd'], Labels: { only: 'reviewed' } },
    Mounts: [{ Type: 'volume', Name: 'db', Source: '/x', Destination: '/var/lib/postgresql/data', Mode: 'z', RW: true, Propagation: '' }],
    NetworkSettings: { Networks: { reviewed: { Aliases: ['db'] } } },
  };
  const projection = {
    id: container.Id, name: container.Name, imageId: container.Image, configuredImage: 'image', running: true,
    labels: { only: 'reviewed' }, entrypoint: ['entry'], command: ['cmd'],
    mounts: [{ destination: '/var/lib/postgresql/data', mode: 'z', name: 'db', propagation: '', readWrite: true, source: '/x', type: 'volume' }],
    networks: { reviewed: { aliases: ['db'] } },
  };
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const pin = {
    container: { id: container.Id, stableProjectionSha256: hash(normalizedJson(projection)), entrypointCommandSha256: hash(normalizedJson({ entrypoint: ['entry'], command: ['cmd'] })) },
    psql: { absolutePath: '/nix/store/d43fya852vmrp5hws2lrw47ccq1ngakz-postgresql-17.6/bin/psql', executableSha256: '9'.repeat(64), version: 'psql (PostgreSQL) 17.6' },
    database: { serverVersionNum: '170006', currentDatabase: 'postgres', databaseOid: '5', systemIdentifier: '123' }, ledgerVersions,
  };
  const calls = [];
  const runDocker = ({ args }) => {
    calls.push(args);
    if (args[0] === 'container') return { status: 0, stdout: JSON.stringify([container]), stderr: '' };
    if (args.includes('/usr/bin/sha256sum')) return { status: 0, stdout: `${'9'.repeat(64)}  ${pin.psql.absolutePath}\n`, stderr: '' };
    if (args.includes('--version')) return { status: 0, stdout: `${pin.psql.version}\n`, stderr: '' };
    if (args.includes('-qAt')) return { status: 0, stdout: `${JSON.stringify({ server_version_num: '170006', current_database: 'postgres', database_oid: '5', system_identifier: '123', ledger_versions: ledgerVersions })}\n`, stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const observed = verifyPinnedLocalRuntime(pin, runDocker);
  assert.equal(observed.containerId, pin.container.id);
  assert.equal(observed.psqlAbsolutePath, pin.psql.absolutePath);
  assert.equal(observed.containerProjectionSha256, pin.container.stableProjectionSha256);
  assert.equal(observed.psqlSha256, pin.psql.executableSha256);
  assert.equal(calls.every((args) => args.includes(pin.container.id)), true);
  assert.equal(calls.find((args) => args.includes('-qAt')).includes('/var/run/postgresql'), true);
});

test('collector cannot be constructed with a digest-tagged object that was not approved', () => {
  assert.throws(() => createLocalCanonicalCollector({
    approvedPin: { ...testPin, status: 'PENDING' }, protectEvidence: () => {},
  }), /approved local pin/u);
});

test('approved package aggregate has an exact transitive file list including validators, ACL helper, frozen inputs, SQL, and all 96 migrations', () => {
  const manifest = localPackageManifest();
  const names = manifest.files.map(({ filename }) => filename);
  assert.equal(new Set(names).size, names.length);
  for (const required of [
    'scripts/migration-audit/local-canonical-collector.mjs',
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
    'scripts/migration-audit/catalog-union-readonly.sql',
    'supabase/migrations/0001_profiles.sql',
    'supabase/migrations/0096_ai_moderation_quarantine.sql',
  ]) assert.equal(names.includes(required), true, required);
  assert.equal(names.filter((name) => name.startsWith('supabase/migrations/')).length, 96);
  assert.equal(manifest.files.every(({ sha256 }) => /^[0-9a-f]{64}$/u.test(sha256)), true);
  assert.equal(localPackageIdentity().packageSha256, createHash('sha256').update(normalizedJson(manifest)).digest('hex'));
});

const validRows = {
  'catalog-ledger-readonly.sql': Array.from({ length: 96 }, (_, index) => {
    const version = String(index + 1).padStart(4, '0');
    return ['ledger_version', version, { version }];
  }),
  'catalog-union-readonly.sql': [],
  'deterministic-config-readonly.sql': [
    ...['avatars', 'post-images', 'memories'].map((key) =>
      ['storage_bucket_config', key, { allowed_mime_types: null, file_size_limit: null, public: key !== 'memories' }]),
    ...Object.entries({
      posts: ['user_id',30,3600], post_comments: ['user_id',60,600], post_likes: ['user_id',150,600],
      buddy_messages: ['sender',90,60], buddy_requests: ['from_user',30,3600], stories: ['user_id',30,86400],
      buddy_reports: ['reporter',20,86400], memories: ['user_id',120,3600], search_history: ['user_id',200,600],
      r2_sign_log: ['user_id',60,3600], support_messages: ['user_id',20,3600],
    }).map(([key, [owner_column, maximum_rows, window_seconds]]) =>
      ['rate_limit_config', key, { maximum_rows, owner_column, window_seconds }]),
  ],
  'current-state-flags-readonly.sql': [
    ['current_state_flag', '0051_buddy_messages_retain_false', { present: false }],
    ['current_state_flag', '0067_profiles_location_verified_true', { present: false }],
    ['current_state_flag', '0074_profiles_display_name_unsanitized', { present: false }],
    ['current_state_flag', '0078_posts_group_audience_mismatch', { present: false }],
    ['current_state_flag', '0078_posts_page_audience_mismatch', { present: false }],
    ['current_state_flag', '0078_posts_event_type_mismatch', { present: false }],
    ['current_state_flag', '0078_posts_photo_type_mismatch', { present: false }],
  ],
  '0096-postconditions-readonly.sql': [[
    'moderation_postconditions', '0096', {
      moderation_columns_present: true, moderation_constraints_present: true,
      queue_indexes_present: true, reports_projection: true, flags_projection: true,
      no_private_messages_source: true, decision_status_outcome: true,
      manual_resolution_outcome: true, quarantined_shares_blocked: true,
      report_privileges: true, no_client_quarantine_mutation: true,
      no_client_review_mutation: true,
    },
  ]],
  'cron-presence-readonly.sql': [['cron_presence', 'cron.job', { relation: 'cron.job' }]],
  'cron-config-readonly.sql': [['cron_job_config', 'purge-old-messages', {
    schedule: '17 3 * * *', command_sha256: 'c9258a59aa0e7449631eb5b4cbc76adebcf982c8ea00808779d29147ee2acb7d',
  }]],
  'catalog-operational-readonly.sql': [],
  'local-auth-signup-trigger-readonly.sql': [[
    'auth_signup_trigger', 'auth.users.on_auth_user_created',
    { definition_sha256: 'a'.repeat(64), enabled: 'O', function: 'public.handle_new_user' },
  ]],
};

function csv(rows) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return ['category,object_key,definition', ...rows.map(([category, key, definition]) =>
    [category, key, JSON.stringify(definition)].map(quote).join(','))].join('\n') + '\n';
}

test('CSV parser preserves quoted commas and rejects extra columns', () => {
  assert.deepEqual(parsePsqlCsvRows('category,object_key,definition\n"relation","public.x","{""acl"":[""a,b""]}"\n'), [
    { category: 'relation', object_key: 'public.x', definition: { acl: ['a,b'] } },
  ]);
  assert.throws(() => parsePsqlCsvRows('category,object_key,definition\na,b,{},extra\n'), /three columns/u);
});

test('collector uses only the exact disposable container and frozen local query plan', async () => {
  const root = testRoot('test-');
  const outputDir = path.join(root, 'bundle');
  const calls = [];
  const runDocker = ({ args, input }) => {
    calls.push({ args, input });
    const filename = LOCAL_QUERY_PLAN[calls.length - 1].filename;
    return { status: 0, stdout: csv(validRows[filename]), stderr: '' };
  };
  const protectionSnapshots = [];
  try {
    const result = await collector({ runDocker, protectEvidence: (target) => protectionSnapshots.push(requireFiles(target)) })({ outputDir });
    assert.equal(result.outputDir, path.resolve(outputDir));
    assert.equal(calls.length, LOCAL_QUERY_PLAN.length);
    for (const [index, call] of calls.entries()) {
      assert.deepEqual(call.args, [
        'exec', '-i', testPin.container.id, testPin.psql.absolutePath, '-h', '/var/run/postgresql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
        '-U', 'postgres', '-d', 'postgres', '--csv', '-f', '-',
      ]);
      assert.equal(call.input.includes('begin read only;'), true);
      assert.equal(call.input.includes('rollback;'), true);
      assert.equal(call.input, readFileSync(new URL(`./${LOCAL_QUERY_PLAN[index].filename}`, import.meta.url), 'utf8'));
    }
    const manifest = JSON.parse(readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.container, DISPOSABLE_CONTAINER);
    assert.deepEqual(Object.keys(manifest.evidence), LOCAL_QUERY_PLAN.map(({ evidenceType }) => evidenceType).sort());
    assert.deepEqual(JSON.parse(readFileSync(path.join(outputDir, 'current-state-flags.json'), 'utf8')).rows,
      validRows['current-state-flags-readonly.sql'].map(([category, object_key, definition]) => ({ category, object_key, definition })));
    assert.deepEqual(protectionSnapshots[0], []);
    assert.equal(protectionSnapshots.length, 2);
    assert.equal(protectionSnapshots[1].includes('manifest.json'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collector rejects an absent, renamed, or stopped container before any query', async () => {
  for (const stdout of ['', '/wrong|true\n', `/${DISPOSABLE_CONTAINER}|false\n`]) {
    let calls = 0;
    const root = testRoot('reject-');
    try {
      await assert.rejects(
        () => collector({
          verifyRuntime: () => { calls += 1; throw new Error(`disposable container identity ${stdout}`); },
        })({ outputDir: path.join(root, 'bundle') }),
        /disposable container identity/u,
      );
      assert.equal(calls, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('collector rejects existing output and invalid validated rows without publishing', async () => {
  const root = testRoot('invalid-');
  await assert.rejects(
    () => collector({ runDocker: () => ({ status: 0, stdout: '', stderr: '' }) })({ outputDir: root }),
    /must not already exist/u,
  );
  const outputDir = path.join(root, 'bundle');
  let call = 0;
  await assert.rejects(
    () => collector({
      runDocker: () => {
        call += 1;
        return { status: 0, stdout: csv([['unknown', 'x', {}]]), stderr: '' };
      },
    })({ outputDir }),
    /Query category rejected/u,
  );
  assert.throws(() => readFileSync(path.join(outputDir, 'manifest.json')), /ENOENT/u);
  rmSync(root, { recursive: true, force: true });
});

test('replay provenance is exactly the frozen 0001 through 0096 filename and hash sequence', () => {
  const provenance = replayProvenance();
  assert.equal(provenance.range, '0001-0096');
  assert.equal(provenance.migrations.length, 96);
  assert.equal(provenance.migrations[0].filename, '0001_profiles.sql');
  assert.equal(provenance.migrations.at(-1).filename, '0096_ai_moderation_quarantine.sql');
  assert.deepEqual(validateReplayLedger(provenance.migrations.map(({ filename }, index) => ({
    category: 'ledger_version',
    object_key: filename.slice(0, 4),
    definition: { version: String(index + 1).padStart(4, '0') },
  }))), provenance.migrations.map(({ filename }) => filename.slice(0, 4)));
  assert.throws(() => validateReplayLedger([]), /exactly 0001 through 0096/u);
});

test('local plan proves replay ledger and auth signup trigger and excludes operational counts', () => {
  assert.deepEqual(LOCAL_QUERY_PLAN.map(({ evidenceType }) => evidenceType), [
    'replay-ledger', 'catalog', 'deterministic-config', 'current-state-flags', 'moderation-postconditions',
    'cron-presence', 'cron-config', 'auth-signup-trigger',
  ]);
  assert.equal(LOCAL_QUERY_PLAN.some(({ filename }) => filename === 'catalog-operational-readonly.sql'), false);
});

test('collector accepts outputs only below the fixed local evidence root', async () => {
  const outside = path.join(tmpdir(), 'forbidden-local-evidence');
  await assert.rejects(
    () => collector({ runDocker: () => ({ status: 0, stdout: '', stderr: '' }) })({ outputDir: outside }),
    /fixed local evidence root/u,
  );
});
