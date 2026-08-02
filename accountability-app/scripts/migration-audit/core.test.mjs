import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analyzeMigration,
  buildInvariantInventory,
  assertCatalogIdentifiersAllowlisted,
  assertCatalogMatch,
  assertCliVersion,
  assertExpectedProjectRef,
  assertReadOnlyCatalogSql,
  assertStatusTransition,
  compareCatalogs,
  compareCatalogRecords,
  createPreflightReceipt,
  createEvidenceEnvelope,
  enumeratePathExecutableCandidates,
  enumerateSqlCallExpressions,
  fingerprintCatalogRecords,
  hashFiles,
  materializeCrlf,
  normalizedJson,
  normalizeSqlCode,
  optionalLedgerScriptForPresence,
  optionalCronScriptForPresence,
  readLinkedProjectRef,
  sha256,
  splitSqlStatements,
  validateAllowlist,
  validateExternalApproval,
  validateStatusManifest,
  verifyFrozenInventory,
  verifyPreflightReceipt,
  verifyEvidenceEnvelope,
  selectCliExecutable,
} from './core.mjs';
import { createOneProcessExecutor } from './one-process-executor.mjs';

test('parser preserves quoted and dollar-quoted semicolons', () => {
  const statements = splitSqlStatements(
    "create table x(a text check(a <> ';')); create function f() returns text as $$ begin return ';'; end $$ language plpgsql;",
  );
  assert.equal(statements.length, 2);
});

test('PATH enumeration never executes a substituted where executable', () => {
  const fakePath = mkdtempSync(path.join(os.tmpdir(), 'fake-path-locator-'));
  const marker = path.join(fakePath, 'where-was-executed');
  writeFileSync(path.join(fakePath, 'where.exe'), `would create ${marker}`);
  writeFileSync(path.join(fakePath, 'supabase.exe'), 'candidate only');
  try {
    assert.deepEqual(
      enumeratePathExecutableCandidates('supabase.exe', fakePath),
      [path.join(fakePath, 'supabase.exe')],
    );
    assert.equal(readFileSync(path.join(fakePath, 'where.exe'), 'utf8'), `would create ${marker}`);
    assert.throws(() => readFileSync(marker), /ENOENT/);
  } finally {
    rmSync(fakePath, { recursive: true, force: true });
  }
});

test('classifier inventories required migration invariants', () => {
  const result = analyzeMigration(
    '0001_test.sql',
    `create extension if not exists pgcrypto;
     create table public.t(id uuid primary key, owner uuid, constraint uq unique(owner));
     alter table public.t enable row level security;
     create policy p on public.t for select using (owner = auth.uid());
     create unique index t_owner on public.t(owner);
     create function public.f() returns trigger language plpgsql as $$ begin return new; end $$;
     create trigger tr before insert on public.t execute function public.f();
     create view public.v as select id from public.t;
     create type public.mood as enum ('ok');
     create sequence public.seq;
     create procedure public.p() language sql as $$ select 1 $$;
     alter publication supabase_realtime add table public.t;
     alter table public.t owner to postgres;
     alter default privileges grant select on tables to authenticated;
     grant select on public.t to authenticated;
     insert into storage.buckets(id,name) values ('x','x');
     with changed as (select 1) update public.t set owner = owner;
     truncate public.t;`,
  );
  for (const category of [
    'platform.extensions',
    'ddl.columns',
    'ddl.constraints',
    'ddl.views',
    'ddl.types',
    'ddl.sequences',
    'security.rls',
    'security.policies',
    'ddl.indexes',
    'code.functions',
    'code.procedures',
    'code.triggers',
    'security.grants',
    'security.ownership',
    'security.default_privileges',
    'platform.publications',
    'platform.storage',
    'data.seed',
    'data.backfill',
  ]) {
    assert.ok(result.classes[category] > 0, category);
  }
});

test('normalization preserves nested array order while catalog record and ACL set order normalize', () => {
  const a = { enum_labels: ['draft', 'published'], counts: { z: 2, a: 1 } };
  const b = { counts: { a: 1, z: 2 }, enum_labels: ['published', 'draft'] };
  assert.notEqual(normalizedJson(a), normalizedJson(b));
  const recordsA = [
    { category: 'relation', object_key: 'public.b', definition: { acl: ['bob=r', 'PUBLIC=r'] } },
    { category: 'type', object_key: 'public.status', definition: { enum_labels: ['draft', 'published'] } },
  ];
  const recordsB = [
    { category: 'type', object_key: 'public.status', definition: { enum_labels: ['draft', 'published'] } },
    { category: 'relation', object_key: 'public.b', definition: { acl: ['PUBLIC=r', 'bob=r'] } },
  ];
  assert.equal(compareCatalogs(recordsA, recordsB).equal, true);
  assert.equal(compareCatalogs(
    recordsA,
    [{ ...recordsA[0] }, { ...recordsA[1], definition: { enum_labels: ['published', 'draft'] } }],
  ).equal, false);
  const orderedA = { policies: [{ name: 'b' }, { name: 'a' }], counts: { z: 2, a: 1 } };
  const orderedB = { counts: { a: 1, z: 2 }, policies: [{ name: 'b' }, { name: 'a' }] };
  assert.equal(normalizedJson(orderedA), normalizedJson(orderedB));
  assert.deepEqual(compareCatalogs(orderedA, orderedB), {
    equal: true,
    canonicalHash: sha256(normalizedJson(orderedA)),
    remoteHash: sha256(normalizedJson(orderedB)),
  });
});

test('SQL lexer preserves comment markers in literals and fails closed on unterminated input', () => {
  const sql = String.raw`select '--literal', '/*literal*/', E'it\'s -- literal', $$ begin /* body text */ return '--'; end $$;
    /* outer /* nested */ done */ select 1; -- trailing`;
  const normalized = normalizeSqlCode(sql);
  assert.match(normalized, /'--literal'/);
  assert.match(normalized, /'\/\*literal\*\/'/);
  assert.doesNotMatch(normalized, /outer|trailing/);
  assert.match(normalized, /\$\$ begin \/\* body text \*\/ return '--'; end \$\$/);
  for (const broken of ["select 'x", 'select "x', 'do $$ begin', 'select 1 /* open']) {
    assert.throws(() => normalizeSqlCode(broken), /Unterminated SQL/);
  }
});

test('keyed comparator reports missing, extra, changed and unclassified', () => {
  const result = compareCatalogRecords(
    [
      { category: 'column', object_key: 'public.a.id', definition: { type: 'uuid' } },
      { category: 'relation', object_key: 'public.missing', definition: { kind: 'r' } },
      { bad: true },
    ],
    [
      { category: 'column', object_key: 'public.a.id', definition: { type: 'text' } },
      { category: 'relation', object_key: 'public.extra', definition: { kind: 'r' } },
    ],
  );
  assert.equal(result.equal, false);
  assert.equal(result.changed.length, 1);
  assert.equal(result.missing.length, 1);
  assert.equal(result.extra.length, 1);
  assert.equal(result.unclassified.length, 1);
  assert.match(result.canonicalAggregateSha256, /^[0-9a-f]{64}$/);
  assert.match(result.remoteAggregateSha256, /^[0-9a-f]{64}$/);
  const fingerprint = fingerprintCatalogRecords([
    { category: 'column', object_key: 'public.a.id', definition: { type: 'uuid' } },
  ]);
  assert.equal(fingerprint.objects.length, 1);
  assert.match(fingerprint.objects[0].sha256, /^[0-9a-f]{64}$/);
});

test('allowlist requires reviewed, expiring, expected leaf values and forbids security/counts', () => {
  const allowlist = {
    exceptions: [{
      category: 'storage_bucket',
      key: 'temporary',
      path: '/definition/file_size_limit',
      rationale: 'Reviewed staging-only limit.',
      reviewer: 'release-owner',
      expiresAt: '2099-01-01T00:00:00.000Z',
      canonicalValue: 1,
      remoteValue: 2,
    }],
  };
  assert.equal(validateAllowlist(allowlist).length, 1);
  const result = compareCatalogRecords(
    [{ category: 'storage_bucket', object_key: 'temporary', definition: { file_size_limit: 1 } }],
    [{ category: 'storage_bucket', object_key: 'temporary', definition: { file_size_limit: 2 } }],
    allowlist,
  );
  assert.equal(result.equal, true);
  const hiddenDrift = compareCatalogRecords(
    [{ category: 'storage_bucket', object_key: 'temporary', definition: { file_size_limit: 1, public: false } }],
    [{ category: 'storage_bucket', object_key: 'temporary', definition: { file_size_limit: 2, public: true } }],
    allowlist,
  );
  assert.equal(hiddenDrift.equal, false);
  assert.throws(
    () =>
      assertCatalogMatch(
        [{ category: 'relation', object_key: 'public.a', definition: { kind: 'r' } }],
        [{ category: 'relation', object_key: 'public.a', definition: { kind: 'v' } }],
      ),
    /Catalog mismatch; execution approval is forbidden/,
  );
  assert.throws(
    () => validateAllowlist({ exceptions: [{ ...allowlist.exceptions[0], category: 'policy' }] }),
    /cannot be allowlisted/,
  );
  assert.throws(
    () => validateAllowlist({ exceptions: [{ ...allowlist.exceptions[0], path: '/definition/count' }] }),
    /cannot be allowlisted/,
  );
  for (const category of ['relation', 'column', 'constraint', 'index', 'routine', 'trigger']) {
    assert.throws(
      () => validateAllowlist({ exceptions: [{ ...allowlist.exceptions[0], category }] }),
      /cannot be allowlisted/,
    );
  }
});

test('classifier recursively identifies effects and calls inside DO blocks', () => {
  const result = analyzeMigration('0099_do.sql', `
    do $$ begin
      update public.accounts set name = name;
      execute 'create table public.hidden(id int)';
      perform public.side_effect();
    end $$;
  `);
  assert.ok(result.classes['code.blocks']);
  assert.ok(result.classes['data.backfill']);
  assert.ok(result.classes['ddl.tables']);
  assert.ok(result.classes['code.calls']);
  assert.deepEqual(result.callExpressions, ['public.hidden', 'public.side_effect']);
});

test('catalog call enumeration rejects every unknown call expression', () => {
  assert.deepEqual(
    enumerateSqlCallExpressions("select jsonb_build_object('x', pg_get_expr(c.x, c.y)) from pg_catalog.pg_class c"),
    ['jsonb_build_object', 'pg_get_expr'],
  );
  assert.throws(
    () => assertCatalogIdentifiersAllowlisted(
      'begin read only; select innocent_but_unknown(); rollback;',
      { catalogRelations: [], catalogFunctions: [] },
    ),
    /innocent_but_unknown/,
  );
});

test('Windows CLI selection accepts one regular exe and rejects wrappers or ambiguity', () => {
  const inspect = (candidate) => ({ isFile: candidate.endsWith('.exe') });
  assert.equal(
    selectCliExecutable(['C:\\bin\\supabase.cmd', 'C:\\bin\\supabase.exe'], 'win32', inspect),
    path.resolve('C:\\bin\\supabase.exe'),
  );
  assert.throws(
    () => selectCliExecutable(['C:\\a\\supabase.exe', 'C:\\b\\supabase.exe'], 'win32', inspect),
    /exactly one regular .exe/,
  );
  assert.throws(
    () => selectCliExecutable(['C:\\bin\\supabase.cmd'], 'win32', inspect),
    /exactly one regular .exe/,
  );
});

test('one-process executor is disabled and rejects external authority', async () => {
  const disabled = createOneProcessExecutor({
    freshPreflight: async () => assert.fail('must not run'),
    collectReadOnly: async () => assert.fail('must not run'),
  });
  await assert.rejects(() => disabled(), /disabled/);
  const enabled = createOneProcessExecutor({
    enabled: true,
    freshPreflight: async () => ({
      cli: { executable: path.resolve('supabase.exe') },
      receipt: { nonce: 'fresh' },
    }),
    collectReadOnly: async ({ receipt }) => receipt.nonce,
  });
  await assert.rejects(() => enabled({ receipt: {} }), /forbidden/);
  assert.equal(await enabled({}), 'fresh');
});

test('presence evidence is receipt, project, query, nonce and time bound', () => {
  const receipt = createPreflightReceipt({
    projectRef: 'ksvcjvwawamwyquzsizk',
    accountSlug: 'kingrand',
    cliExecutable: path.join(os.tmpdir(), 'supabase.exe'),
    cliVersion: '2.110.0',
    cliSha256: 'a'.repeat(64),
    artifacts: { x: 'b'.repeat(64) },
    nonce: 'nonce_abcdefghijklmnopqrstuvwxyz',
    issuedAt: '2026-07-30T00:00:00.000Z',
    expiresAt: '2026-07-30T00:05:00.000Z',
  });
  const querySha256 = 'c'.repeat(64);
  const envelope = createEvidenceEnvelope({
    receipt,
    evidenceType: 'ledger-presence',
    querySha256,
    collectedAt: '2026-07-30T00:01:00.000Z',
    records: [{
      category: 'ledger_presence',
      object_key: 'supabase_migrations.schema_migrations',
      definition: { relation: 'supabase_migrations.schema_migrations' },
    }],
  });
  assert.equal(
    verifyEvidenceEnvelope(envelope, receipt, 'ledger-presence', querySha256, 1),
    true,
  );
  assert.equal(optionalLedgerScriptForPresence(envelope.records), 'catalog-ledger-readonly.sql');
  assert.throws(
    () => verifyEvidenceEnvelope({ ...envelope, nonce: 'other' }, receipt, 'ledger-presence', querySha256, 1),
    /hash mismatch|nonce mismatch/,
  );
  assert.throws(
    () => verifyEvidenceEnvelope(envelope, receipt, 'ledger-presence', 'd'.repeat(64), 1),
    /query mismatch/,
  );
});

test('external approval rejects pending templates and requires exact scoped current authority', () => {
  const actual = { 'audit.mjs': 'a'.repeat(64) };
  const approved = {
    formatVersion: 1,
    approval: 'APPROVED',
    reviewer: 'release-owner',
    authority: 'staging-release-owner',
    approvedAt: '2026-07-30T00:00:00.000Z',
    expiresAt: '2026-07-30T01:00:00.000Z',
    projectRef: 'ksvcjvwawamwyquzsizk',
    accountSlug: 'kingrand',
    scope: 'STAGING_READ_ONLY_MIGRATION_AUDIT',
    singleUsePolicy: 'ONE_PROCESS_FRESH_PREFLIGHT',
    windowsTrust: {
      systemRoot: 'C:\\Windows',
      toolSha256: {
        icacls: 'b'.repeat(64),
        powershell: 'c'.repeat(64),
        whoami: 'd'.repeat(64),
      },
    },
    packageSha256: actual,
    packageDigest: sha256(normalizedJson(actual)),
  };
  assert.equal(validateExternalApproval(approved, actual, new Date('2026-07-30T00:30:00Z')), true);
  assert.throws(
    () => validateExternalApproval({ ...approved, approval: 'PENDING' }, actual, new Date('2026-07-30T00:30:00Z')),
    /APPROVED/,
  );
  assert.throws(
    () => validateExternalApproval({ ...approved, projectRef: 'production' }, actual, new Date('2026-07-30T00:30:00Z')),
    /scope/,
  );
  assert.throws(
    () => validateExternalApproval({ ...approved, accountSlug: 'other' }, actual, new Date('2026-07-30T00:30:00Z')),
    /scope/,
  );
});

test('project, CLI and frozen hash mismatches abort', () => {
  assert.doesNotThrow(() => assertExpectedProjectRef('ksvcjvwawamwyquzsizk'));
  assert.throws(() => assertExpectedProjectRef('unikkvliogducvvswlbv'), /Project ref rejected/);
  assert.doesNotThrow(() => assertCliVersion('2.110.0'));
  assert.throws(() => assertCliVersion('2.111.0'), /CLI rejected/);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ledger-audit-'));
  writeFileSync(path.join(dir, '0001.sql'), 'select 1;');
  assert.throws(
    () => verifyFrozenInventory(dir, { migrations: [{ filename: '0001.sql', sha256: 'wrong' }] }),
    /Frozen migration drift/,
  );
});

test('actual linked-ref reader rejects missing, multiple and production refs', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'project-ref-'));
  assert.throws(() => readLinkedProjectRef(root), /missing/);
  mkdirSync(path.join(root, '.temp'));
  writeFileSync(path.join(root, '.temp', 'project-ref'), 'a\nb\n');
  assert.throws(() => readLinkedProjectRef(root), /exactly one/);
  writeFileSync(path.join(root, '.temp', 'project-ref'), 'unikkvliogducvvswlbv\n');
  assert.throws(() => readLinkedProjectRef(root), /Project ref rejected/);
  writeFileSync(path.join(root, '.temp', 'project-ref'), 'ksvcjvwawamwyquzsizk\n');
  assert.equal(readLinkedProjectRef(root), 'ksvcjvwawamwyquzsizk');
});

test('nonce receipt is time-bound and rejects binary, artifact, project and receipt drift', () => {
  const input = {
    projectRef: 'ksvcjvwawamwyquzsizk',
    cliExecutable: path.join(os.tmpdir(), 'supabase'),
    cliVersion: '2.110.0',
    cliSha256: 'a'.repeat(64),
    artifacts: { 'catalog-readonly.sql': 'b'.repeat(64) },
    nonce: 'nonce_abcdefghijklmnopqrstuvwxyz',
    issuedAt: '2026-07-30T00:00:00.000Z',
    expiresAt: '2026-07-30T00:05:00.000Z',
  };
  const receipt = createPreflightReceipt(input);
  const current = {
    projectRef: input.projectRef,
    cli: {
      executable: path.resolve(input.cliExecutable),
      version: input.cliVersion,
      sha256: input.cliSha256,
    },
    artifacts: input.artifacts,
  };
  assert.equal(verifyPreflightReceipt(receipt, current, new Date('2026-07-30T00:01:00Z')), true);
  assert.throws(
    () => verifyPreflightReceipt(receipt, { ...current, artifacts: { changed: 'x' } }, new Date('2026-07-30T00:01:00Z')),
    /artifact mismatch/,
  );
  assert.throws(
    () => verifyPreflightReceipt(receipt, current, new Date('2026-07-30T00:06:00Z')),
    /not currently valid/,
  );
  assert.throws(
    () => verifyPreflightReceipt({ ...receipt, nonce: 'tampered' }, current, new Date('2026-07-30T00:01:00Z')),
    /hash mismatch/,
  );
});

test('optional ledger query is gated by exact catalog presence evidence', () => {
  assert.equal(optionalLedgerScriptForPresence({}), null);
  assert.equal(
    optionalLedgerScriptForPresence([{
      category: 'ledger_presence',
      object_key: 'supabase_migrations.schema_migrations',
      definition: { relation: null },
    }]),
    null,
  );
  assert.equal(
    optionalLedgerScriptForPresence([{
      category: 'ledger_presence',
      object_key: 'supabase_migrations.schema_migrations',
      definition: { relation: 'supabase_migrations.schema_migrations' },
    }]),
    'catalog-ledger-readonly.sql',
  );
});

test('optional cron config is gated and explicit absence is valid evidence', () => {
  assert.equal(optionalCronScriptForPresence([{
    category: 'cron_presence',
    object_key: 'cron.job',
    definition: { relation: null },
  }]), null);
  assert.equal(optionalCronScriptForPresence([{
    category: 'cron_presence',
    object_key: 'cron.job',
    definition: { relation: 'cron.job' },
  }]), 'cron-config-readonly.sql');
  assert.equal(optionalCronScriptForPresence([]), null);
});

test('catalog SQL safety rejects mutations and content-bearing selects', () => {
  assert.equal(
    assertReadOnlyCatalogSql("begin read only; set local statement_timeout='1s'; select count(*) from pg_class; rollback;"),
    true,
  );
  assert.throws(() => assertReadOnlyCatalogSql('begin; select 1; rollback;'), /BEGIN READ ONLY/);
  assert.throws(
    () => assertReadOnlyCatalogSql('begin read only; delete from public.posts; rollback;'),
    /Mutating/,
  );
  assert.throws(
    () => assertReadOnlyCatalogSql('begin read only; select body from public.posts; rollback;'),
    /Unsafe/,
  );
  assert.throws(
    () => assertReadOnlyCatalogSql('begin read only; select pg_sleep(1); rollback;'),
    /Unsafe/,
  );
});

test('checked-in ledger, status manifest and catalog SQL are internally safe and complete', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const frozen = JSON.parse(readFileSync(path.join(directory, 'frozen-ledger.json'), 'utf8'));
  const manifest = JSON.parse(
    readFileSync(path.join(directory, 'version-status-manifest.json'), 'utf8'),
  );
  assert.equal(frozen.migrations.length, 96);
  assert.equal(frozen.migrations[0].filename.startsWith('0001_'), true);
  assert.equal(frozen.migrations.at(-1).filename.startsWith('0096_'), true);
  assert.equal(new Set(frozen.migrations.map((entry) => entry.filename)).size, 96);
  assert.equal(manifest.versions.length, 96);
  assert.equal(validateStatusManifest(frozen, manifest), true);
  assert.equal(assertStatusTransition('UNPROVABLE', 'PROVEN'), true);
  assert.throws(() => assertStatusTransition('SUPERSEDED', 'PROVEN'), /Forbidden/);
  assert.equal(
    assertReadOnlyCatalogSql(readFileSync(path.join(directory, 'catalog-readonly.sql'), 'utf8')),
    true,
  );
  assert.doesNotMatch(
    readFileSync(path.join(directory, 'catalog-readonly.sql'), 'utf8'),
    /\bmd5\s*\(/i,
  );
  assert.equal(
    assertReadOnlyCatalogSql(
      readFileSync(path.join(directory, 'catalog-ledger-readonly.sql'), 'utf8'),
    ),
    true,
  );
  const artifactFreeze = JSON.parse(
    readFileSync(path.join(directory, 'frozen-artifacts.json'), 'utf8'),
  );
  assert.deepEqual(
    hashFiles(directory, Object.keys(artifactFreeze.artifactSha256)),
    Object.fromEntries(Object.entries(artifactFreeze.artifactSha256).sort(([a], [b]) => a.localeCompare(b))),
  );
  assert.equal(
    assertCatalogIdentifiersAllowlisted(
      readFileSync(path.join(directory, 'catalog-readonly.sql'), 'utf8'),
      artifactFreeze,
    ),
    true,
  );
  assert.equal(
    assertCatalogIdentifiersAllowlisted(
      readFileSync(path.join(directory, 'catalog-ledger-readonly.sql'), 'utf8'),
      artifactFreeze,
    ),
    true,
  );
});

test('every frozen migration is tracked and its clean CRLF materialization matches the ledger', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(directory, '../..');
  const repositoryRoot = path.resolve(projectRoot, '..');
  const frozen = JSON.parse(readFileSync(path.join(directory, 'frozen-ledger.json'), 'utf8'));
  for (const migration of frozen.migrations) {
    const relative = `accountability-app/supabase/migrations/${migration.filename}`;
    assert.doesNotThrow(() => execFileSync('git', ['ls-files', '--error-unmatch', '--', relative], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    }), `${relative} must be tracked`);
    const attribute = execFileSync('git', ['check-attr', 'eol', '--', relative], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    assert.equal(attribute, `${relative}: eol: crlf`);
    const blob = execFileSync('git', ['show', `:${relative}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const cleanMaterialized = materializeCrlf(blob);
    assert.equal(sha256(cleanMaterialized), migration.sha256, relative);
  }
});

test('function bundle manifests exactly bind every regular file in each function directory', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(directory, '../..');
  for (const [functionName, manifestName] of [
    ['moderate-content', 'moderate-content-bundle-manifest.json'],
    ['admin-actions', 'admin-actions-bundle-manifest.json'],
  ]) {
    const functionDirectory = path.join(projectRoot, 'supabase', 'functions', functionName);
    const manifestBytes = readFileSync(path.join(directory, manifestName));
    const manifest = JSON.parse(manifestBytes);
    const expected = readdirSync(functionDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const relative = `supabase/functions/${functionName}/${entry.name}`;
        return { path: relative, sha256: sha256(readFileSync(path.join(projectRoot, ...relative.split('/')))) };
      })
      .sort((left, right) => left.path.localeCompare(right.path));
    assert.deepEqual(manifest, expected);
    assert.equal(manifestBytes.toString(), normalizedJson(expected));
  }
});

test('all actual migration statements are classified', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const frozen = JSON.parse(readFileSync(path.join(directory, 'frozen-ledger.json'), 'utf8'));
  for (const entry of frozen.migrations) {
    const result = analyzeMigration(
      entry.filename,
      readFileSync(path.resolve(directory, '../../supabase/migrations', entry.filename), 'utf8'),
    );
    assert.equal(result.classes.other ?? 0, 0, entry.filename);
  }
});

test('actual DO migrations expose their nested security and schema effects', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const expected = {
    '0044_notifications.sql': ['code.triggers', 'platform.publications'],
    '0051_messages_inbox.sql': ['platform.extensions'],
    '0056_rate_limits.sql': ['code.triggers', 'ddl.constraints'],
    '0061_moderation.sql': ['code.triggers', 'platform.extensions'],
    '0062_sanctions.sql': ['code.triggers'],
    '0070_business_tracker.sql': ['security.rls', 'security.policies'],
    '0074_security_hardening.sql': ['code.triggers'],
  };
  for (const [filename, categories] of Object.entries(expected)) {
    const result = analyzeMigration(
      filename,
      readFileSync(path.resolve(directory, '../../supabase/migrations', filename), 'utf8'),
    );
    for (const category of categories) assert.ok(result.classes[category] > 0, `${filename}: ${category}`);
  }
});

test('frozen per-version invariant inventory is exact and marks destructive work unprovable', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const frozen = JSON.parse(readFileSync(path.join(directory, 'frozen-ledger.json'), 'utf8'));
  const inventory = JSON.parse(readFileSync(path.join(directory, 'invariant-inventory.json'), 'utf8'));
  assert.deepEqual(
    inventory,
    buildInvariantInventory(
      frozen,
      path.resolve(directory, '../../supabase/migrations'),
    ),
  );
  assert.ok(
    inventory.versions.flatMap((entry) => entry.invariants)
      .some((item) => item.proofStatus === 'UNPROVABLE' && item.categories.includes('data.backfill')),
  );
});

test('status manifest rejects missing versions and unsupported evidence claims', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const frozen = JSON.parse(readFileSync(path.join(directory, 'frozen-ledger.json'), 'utf8'));
  const manifest = JSON.parse(
    readFileSync(path.join(directory, 'version-status-manifest.json'), 'utf8'),
  );
  assert.throws(
    () => validateStatusManifest(frozen, { ...manifest, versions: manifest.versions.slice(1) }),
    /one-to-one/,
  );
  const claimed = structuredClone(manifest);
  claimed.versions[0].evidence.remoteLedgerVersion = '0001';
  assert.throws(() => validateStatusManifest(frozen, claimed), /evidence must remain null/);

  const proven = structuredClone(manifest);
  proven.versions[0] = {
    ...proven.versions[0],
    status: 'PROVEN',
    evidence: {
      ...proven.versions[0].evidence,
      remoteLedgerVersion: '0001',
      remoteCatalogFingerprint: 'a'.repeat(64),
      receiptSha256: 'b'.repeat(64),
      reviewedAt: '2026-07-30T00:01:00.000Z',
      reviewer: 'release-owner',
      issuedAt: '2026-07-30T00:00:00.000Z',
      expiresAt: '2026-07-30T00:05:00.000Z',
      objectEvidence: [{
        category: 'relation',
        key: 'public.profiles',
        canonicalSha256: 'c'.repeat(64),
        remoteSha256: 'c'.repeat(64),
      }],
    },
  };
  assert.equal(validateStatusManifest(frozen, proven), true);
  proven.versions[0].evidence.remoteLedgerVersion = 1;
  assert.throws(() => validateStatusManifest(frozen, proven), /remote ledger version/);
});

test('SUPERSEDED rejects unknown or inconsistent invariant mappings', () => {
  const frozen = {
    migrations: [
      { filename: '0001_a.sql', sha256: 'a'.repeat(64) },
      { filename: '0002_b.sql', sha256: 'b'.repeat(64) },
    ],
  };
  const baseEvidence = {
    canonicalSha256: 'a'.repeat(64),
    remoteLedgerVersion: '0001',
    remoteCatalogFingerprint: 'c'.repeat(64),
    receiptSha256: 'd'.repeat(64),
    reviewedAt: '2026-07-30T00:01:00.000Z',
    reviewer: 'release-owner',
    issuedAt: '2026-07-30T00:00:00.000Z',
    expiresAt: '2026-07-30T00:05:00.000Z',
    originalObjectEvidence: [{ category: 'relation', key: 'x', canonicalSha256: 'e'.repeat(64), remoteSha256: 'f'.repeat(64) }],
    successorEvidence: [{ category: 'relation', key: 'x', canonicalSha256: 'e'.repeat(64), remoteSha256: 'e'.repeat(64) }],
    supersessionMap: [
      { invariantId: '0001:001:x', successorVersion: '0002', successorProofSha256: '1'.repeat(64) },
      { invariantId: 'unknown', successorVersion: '0002', successorProofSha256: '2'.repeat(64) },
    ],
  };
  const manifest = {
    versions: [
      { version: '0001', filename: '0001_a.sql', status: 'SUPERSEDED', evidence: baseEvidence, supersededBy: ['0002'] },
      {
        version: '0002', filename: '0002_b.sql', status: 'UNPROVABLE',
        evidence: { canonicalSha256: 'b'.repeat(64), remoteLedgerVersion: null, remoteCatalogFingerprint: null, reviewedAt: null, reviewer: null },
        supersededBy: [],
      },
    ],
  };
  const inventory = {
    versions: [
      { version: '0001', filename: '0001_a.sql', canonicalSha256: 'a'.repeat(64), invariants: [{ invariantId: '0001:001:x' }] },
      { version: '0002', filename: '0002_b.sql', canonicalSha256: 'b'.repeat(64), invariants: [] },
    ],
  };
  assert.throws(() => validateStatusManifest(frozen, manifest, inventory), /map every invariant/);

  const valid = structuredClone(manifest);
  valid.versions[0].evidence.supersessionMap = [
    { invariantId: '0001:001:x', successorVersion: '0002', successorProofSha256: '1'.repeat(64) },
  ];
  assert.equal(validateStatusManifest(frozen, valid, inventory), true);

  const duplicate = structuredClone(valid);
  duplicate.versions[0].supersededBy = ['0002', '0002'];
  assert.throws(() => validateStatusManifest(frozen, duplicate, inventory), /unique existing later versions/);

  const phantom = structuredClone(valid);
  phantom.versions[0].supersededBy = ['9999'];
  phantom.versions[0].evidence.supersessionMap[0].successorVersion = '9999';
  assert.throws(() => validateStatusManifest(frozen, phantom, inventory), /unique existing later versions/);

  const unused = structuredClone(valid);
  unused.versions[0].supersededBy = ['0002', '0003'];
  assert.throws(() => validateStatusManifest(frozen, unused, inventory), /unique existing later versions|exact successor proof/);
});
