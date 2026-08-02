import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const REQUIRED_PROJECT_REF = 'ksvcjvwawamwyquzsizk';
export const REQUIRED_CLI_VERSION = '2.110.0';
export const MANIFEST_STATUSES = ['PROVEN', 'SUPERSEDED', 'UNPROVABLE', 'DRIFTED'];

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function materializeCrlf(value) {
  return Buffer.from(Buffer.from(value).toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
}

export function enumeratePathExecutableCandidates(
  executableName,
  pathValue = process.env.PATH ?? '',
) {
  return [...new Set(pathValue.split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean)
    .map((entry) => path.resolve(entry, executableName))
    .filter((candidate) => existsSync(candidate)))];
}

export function normalizeSqlCode(sql, { maskSingleQuotedStrings = false } = {}) {
  let output = '';
  let state = 'code';
  let dollarTag = null;
  let blockDepth = 0;
  let escapeString = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (state === 'line-comment') {
      if (char === '\n') {
        output += '\n';
        state = 'code';
      } else output += ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '/' && next === '*') {
        output += '  ';
        blockDepth += 1;
        index += 1;
      } else if (char === '*' && next === '/') {
        output += '  ';
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = 'code';
      } else output += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (state === 'single') {
      if (escapeString && char === '\\' && next !== undefined) {
        output += maskSingleQuotedStrings ? '  ' : `${char}${next}`;
        index += 1;
      } else if (char === "'" && next === "'") {
        output += maskSingleQuotedStrings ? '  ' : "''";
        index += 1;
      } else {
        output += maskSingleQuotedStrings && char !== "'" ? ' ' : char;
        if (char === "'") state = 'code';
      }
      continue;
    }
    if (state === 'double') {
      output += char;
      if (char === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (char === '"') state = 'code';
      continue;
    }
    if (state === 'dollar') {
      if (sql.startsWith(dollarTag, index)) {
        output += dollarTag;
        index += dollarTag.length - 1;
        state = 'code';
      } else output += char;
      continue;
    }
    if (char === '-' && next === '-') {
      output += '  ';
      state = 'line-comment';
      index += 1;
    } else if (char === '/' && next === '*') {
      output += '  ';
      state = 'block-comment';
      blockDepth = 1;
      index += 1;
    } else if (char === "'") {
      escapeString = index > 0 && /[eE]/.test(sql[index - 1]) &&
        (index < 2 || !/[A-Za-z0-9_$]/.test(sql[index - 2]));
      output += char;
      state = 'single';
    } else if (char === '"') {
      output += char;
      state = 'double';
    } else if (char === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        output += dollarTag;
        index += dollarTag.length - 1;
        state = 'dollar';
      } else output += char;
    } else output += char;
  }
  if (state === 'single') throw new Error('Unterminated SQL single-quoted string.');
  if (state === 'double') throw new Error('Unterminated SQL double-quoted identifier.');
  if (state === 'dollar') throw new Error('Unterminated SQL dollar-quoted body.');
  if (state === 'block-comment') throw new Error('Unterminated SQL block comment.');
  return output;
}

export function selectCliExecutable(candidates, platform, inspect) {
  const unique = [...new Set(candidates.map((value) => path.resolve(value)))];
  const eligible = unique.filter((candidate) => {
    if (platform === 'win32' && path.extname(candidate).toLowerCase() !== '.exe') return false;
    try {
      return inspect(candidate).isFile === true;
    } catch {
      return false;
    }
  });
  if (eligible.length !== 1) {
    throw new Error(platform === 'win32'
      ? 'Expected exactly one regular .exe Supabase CLI executable.'
      : 'Expected exactly one regular Supabase CLI executable.');
  }
  return eligible[0];
}

export function splitSqlStatements(sql) {
  normalizeSqlCode(sql);
  const statements = [];
  let buffer = '';
  let quote = null;
  let escapeQuote = false;
  let dollar = null;
  let lineComment = false;
  let blockDepth = 0;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      buffer += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockDepth > 0) {
      buffer += char;
      if (char === '/' && next === '*') {
        buffer += next;
        blockDepth += 1;
        index += 1;
      } else if (char === '*' && next === '/') {
        buffer += next;
        blockDepth -= 1;
        index += 1;
      }
      continue;
    }
    if (!quote && !dollar && char === '-' && next === '-') {
      buffer += `${char}${next}`;
      lineComment = true;
      index += 1;
      continue;
    }
    if (!quote && !dollar && char === '/' && next === '*') {
      buffer += `${char}${next}`;
      blockDepth = 1;
      index += 1;
      continue;
    }
    if (!quote && !dollar && char === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollar = match[0];
        buffer += dollar;
        index += dollar.length - 1;
        continue;
      }
    } else if (dollar && sql.startsWith(dollar, index)) {
      buffer += dollar;
      index += dollar.length - 1;
      dollar = null;
      continue;
    }
    if (!dollar && (char === "'" || char === '"')) {
      if (!quote) {
        quote = char;
        escapeQuote = char === "'" && index > 0 && /[eE]/.test(sql[index - 1]) &&
          (index < 2 || !/[A-Za-z0-9_$]/.test(sql[index - 2]));
      }
      else if (quote === "'" && escapeQuote && char === '\\' && next !== undefined) {
        buffer += `${char}${next}`;
        index += 1;
        continue;
      }
      else if (quote === char && next === char) {
        buffer += `${char}${next}`;
        index += 1;
        continue;
      } else if (quote === char) {
        quote = null;
        escapeQuote = false;
      }
    }
    if (char === ';' && !quote && !dollar) {
      if (buffer.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()) {
        statements.push(buffer.trim());
      }
      buffer = '';
    } else {
      buffer += char;
    }
  }
  if (buffer.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()) {
    statements.push(buffer.trim());
  }
  return statements;
}

const CLASSIFIERS = [
  ['ddl.tables', /\b(?:create|alter|drop)\s+table\b/i],
  ['ddl.columns', /\bcreate\s+table\b|\balter\s+table\b[\s\S]*\b(?:add|drop|rename|alter)\s+(?:column\b|[^;]+\b(?:type|default|not\s+null|identity|generated)\b)/i],
  ['ddl.constraints', /\b(?:constraint|check\s*\(|foreign\s+key|primary\s+key|unique\s*\()/i],
  ['ddl.indexes', /\b(?:create|drop)\s+(?:unique\s+)?index\b/i],
  ['ddl.views', /\b(?:create|alter|drop)(?:\s+or\s+replace)?\s+(?:materialized\s+)?view\b/i],
  ['ddl.types', /\b(?:create|alter|drop)\s+(?:type|domain)\b|\bcreate\s+type\b[\s\S]*\bas\s+enum\b/i],
  ['ddl.sequences', /\b(?:create|alter|drop)\s+sequence\b/i],
  ['security.rls', /\b(?:enable|disable|force)\s+row\s+level\s+security\b/i],
  ['security.policies', /\b(?:create|alter|drop)\s+policy\b/i],
  ['code.functions', /\b(?:create|alter|drop)(?:\s+or\s+replace)?\s+function\b/i],
  ['code.procedures', /\b(?:create|alter|drop)(?:\s+or\s+replace)?\s+procedure\b/i],
  ['code.blocks', /^\s*do\s+\$/i],
  ['code.triggers', /\b(?:create|alter|drop)\s+trigger\b/i],
  ['security.grants', /\b(?:grant|revoke)\b/i],
  ['security.ownership', /\balter\b[\s\S]*\bowner\s+to\b/i],
  ['security.default_privileges', /\balter\s+default\s+privileges\b/i],
  ['platform.extensions', /\b(?:create|alter|drop)\s+extension\b/i],
  ['platform.storage', /\bstorage\.(?:buckets|objects)\b/i],
  ['platform.publications', /\b(?:create|alter|drop)\s+publication\b/i],
  ['platform.notify', /^\s*notify\b/i],
  ['metadata.comments', /^\s*comment\s+on\b/i],
  ['data.seed', /^\s*insert\s+into\b/i],
  ['data.backfill', /^\s*(?:update\b|delete\s+from\b|truncate\b|merge\b|upsert\b)|^\s*with\b[\s\S]*\b(?:insert|update|delete|merge)\b/i],
  ['code.calls', /^\s*select\b|^\s*call\b/i],
  ['transaction', /^\s*(?:begin|commit|rollback|set\s+local)\b/i],
  ['transaction.locks', /^\s*lock\s+table\b/i],
];

export function classifyStatement(statement) {
  const normalized = normalizeSqlCode(statement).replace(/\s+/g, ' ').trim();
  const classes = CLASSIFIERS.filter(([, pattern]) => pattern.test(normalized)).map(([name]) => name);
  if (/^\s*do\b/i.test(normalized)) {
    const nested = [
      ['data.seed', /\binsert\s+into\b/i],
      ['data.backfill', /\b(?:update|delete\s+from|truncate|merge|upsert)\b/i],
      ['ddl.tables', /\b(?:create|alter|drop)\s+table\b/i],
      ['ddl.indexes', /\b(?:create|drop)\s+(?:unique\s+)?index\b/i],
      ['ddl.constraints', /\b(?:add|drop)\s+constraint\b|\b(?:check|foreign\s+key|primary\s+key|unique)\s*\(/i],
      ['ddl.types', /\b(?:create|alter|drop)\s+(?:type|domain)\b/i],
      ['ddl.sequences', /\b(?:create|alter|drop)\s+sequence\b/i],
      ['security.rls', /\b(?:enable|disable|force)\s+row\s+level\s+security\b/i],
      ['security.policies', /\b(?:create|alter|drop)\s+policy\b/i],
      ['security.grants', /\b(?:grant|revoke)\b/i],
      ['security.ownership', /\bowner\s+to\b/i],
      ['security.default_privileges', /\balter\s+default\s+privileges\b/i],
      ['code.functions', /\b(?:create|alter|drop)(?:\s+or\s+replace)?\s+function\b/i],
      ['code.procedures', /\b(?:create|alter|drop)(?:\s+or\s+replace)?\s+procedure\b/i],
      ['code.triggers', /\b(?:create|alter|drop)\s+trigger\b/i],
      ['platform.extensions', /\b(?:create|alter|drop)\s+extension\b/i],
      ['platform.publications', /\b(?:create|alter|drop)\s+publication\b/i],
      ['code.calls', /\b(?:perform|call|select)\s+[A-Za-z_][A-Za-z0-9_.]*\s*\(/i],
    ];
    for (const [name, pattern] of nested) if (pattern.test(normalized) && !classes.includes(name)) classes.push(name);
  }
  const callExpressions = enumerateSqlCallExpressions(normalized).filter((name) => ![
    'check', 'unique', 'primary', 'foreign', 'values', 'in', 'case',
  ].includes(name));
  return {
    classes: classes.length ? classes : ['other'],
    fingerprint: sha256(normalized),
    callExpressions,
  };
}

export function analyzeMigration(filename, sql) {
  const statements = splitSqlStatements(sql);
  const classified = statements.map(classifyStatement);
  const counts = {};
  for (const item of classified) {
    for (const category of item.classes) counts[category] = (counts[category] ?? 0) + 1;
  }
  return {
    filename,
    sha256: sha256(sql),
    statementCount: statements.length,
    classes: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    statementFingerprints: classified.map((item) => item.fingerprint),
    callExpressions: [...new Set(classified.flatMap((item) => item.callExpressions))].sort(),
  };
}

export function buildInvariantInventory(frozen, migrationRoot) {
  return {
    formatVersion: 1,
    versions: frozen.migrations.map((entry) => {
      const sql = readFileSync(path.join(migrationRoot, entry.filename), 'utf8');
      const statements = splitSqlStatements(sql);
      return {
        version: entry.filename.slice(0, 4),
        filename: entry.filename,
        canonicalSha256: entry.sha256,
        invariants: statements.map((statement, index) => {
          const item = classifyStatement(statement);
          const destructive = /\b(?:drop|delete\s+from|truncate|update)\b/i.test(statement);
          return {
            invariantId: `${entry.filename.slice(0, 4)}:${String(index + 1).padStart(3, '0')}:${item.fingerprint}`,
            statementSha256: item.fingerprint,
            categories: item.classes.slice().sort(),
            callExpressions: item.callExpressions,
            proofStatus: destructive || item.classes.includes('data.backfill') ? 'UNPROVABLE' : 'REQUIRES_EVIDENCE',
          };
        }),
      };
    }),
  };
}

export function assertExpectedProjectRef(actual) {
  if (actual !== REQUIRED_PROJECT_REF) {
    throw new Error(`Project ref rejected; expected exactly ${REQUIRED_PROJECT_REF}.`);
  }
}

export function assertCliVersion(actual) {
  if (actual !== REQUIRED_CLI_VERSION) {
    throw new Error(`Supabase CLI rejected; expected exactly ${REQUIRED_CLI_VERSION}.`);
  }
}

export function readLinkedProjectRef(supabaseRoot) {
  const refPath = path.join(supabaseRoot, '.temp', 'project-ref');
  let raw;
  try {
    raw = readFileSync(refPath, 'utf8');
  } catch {
    throw new Error('Linked project ref is missing.');
  }
  const refs = raw
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (refs.length !== 1) throw new Error('Linked project ref must contain exactly one value.');
  assertExpectedProjectRef(refs[0]);
  return refs[0];
}

export function hashFiles(root, filenames) {
  return Object.fromEntries(
    filenames
      .slice()
      .sort()
      .map((filename) => [filename, sha256(readFileSync(path.join(root, filename)))]),
  );
}

export function createPreflightReceipt(input) {
  const body = {
    formatVersion: 1,
    projectRef: input.projectRef,
    cli: {
      executable: path.resolve(input.cliExecutable),
      version: input.cliVersion,
      sha256: input.cliSha256,
    },
    artifacts: canonicalize(input.artifacts),
    nonce: input.nonce,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  };
  if (!/^[A-Za-z0-9_-]{24,}$/.test(body.nonce)) throw new Error('Receipt nonce is invalid.');
  if (
    !Number.isFinite(Date.parse(body.issuedAt)) ||
    !Number.isFinite(Date.parse(body.expiresAt)) ||
    Date.parse(body.expiresAt) <= Date.parse(body.issuedAt)
  )
    throw new Error('Receipt time window is invalid.');
  return { ...body, receiptSha256: sha256(normalizedJson(body)) };
}

export function verifyPreflightReceipt(receipt, current, now = new Date()) {
  const { receiptSha256, ...body } = receipt;
  if (sha256(normalizedJson(body)) !== receiptSha256) throw new Error('Receipt hash mismatch.');
  if (receipt.projectRef !== REQUIRED_PROJECT_REF || current.projectRef !== REQUIRED_PROJECT_REF) {
    throw new Error('Receipt project mismatch.');
  }
  if (
    path.resolve(receipt.cli.executable) !== path.resolve(current.cli.executable) ||
    receipt.cli.version !== current.cli.version ||
    receipt.cli.sha256 !== current.cli.sha256
  )
    throw new Error('Receipt CLI mismatch.');
  if (normalizedJson(receipt.artifacts) !== normalizedJson(current.artifacts)) {
    throw new Error('Receipt artifact mismatch.');
  }
  if (now.getTime() < Date.parse(receipt.issuedAt) || now.getTime() >= Date.parse(receipt.expiresAt)) {
    throw new Error('Receipt is not currently valid.');
  }
  return true;
}

export function createEvidenceEnvelope(input) {
  const body = {
    formatVersion: 1,
    evidenceType: input.evidenceType,
    receiptSha256: input.receipt.receiptSha256,
    projectRef: input.receipt.projectRef,
    nonce: input.receipt.nonce,
    querySha256: input.querySha256,
    collectedAt: input.collectedAt,
    records: canonicalize(input.records),
  };
  return { ...body, evidenceSha256: sha256(normalizedJson(body)) };
}

export function verifyEvidenceEnvelope(envelope, receipt, evidenceType, querySha256, exactRecords) {
  const { evidenceSha256, ...body } = envelope;
  if (sha256(normalizedJson(body)) !== evidenceSha256) throw new Error('Evidence hash mismatch.');
  if (envelope.evidenceType !== evidenceType) throw new Error('Evidence type mismatch.');
  if (envelope.receiptSha256 !== receipt.receiptSha256) throw new Error('Evidence receipt mismatch.');
  if (envelope.projectRef !== receipt.projectRef) throw new Error('Evidence project mismatch.');
  if (envelope.nonce !== receipt.nonce) throw new Error('Evidence nonce mismatch.');
  if (envelope.querySha256 !== querySha256) throw new Error('Evidence query mismatch.');
  const collected = Date.parse(envelope.collectedAt);
  if (!Number.isFinite(collected) || collected < Date.parse(receipt.issuedAt) || collected >= Date.parse(receipt.expiresAt)) {
    throw new Error('Evidence collection time is outside the receipt window.');
  }
  if (!Array.isArray(envelope.records) || (exactRecords !== undefined && envelope.records.length !== exactRecords)) {
    throw new Error(`Evidence must contain exactly ${exactRecords} record(s).`);
  }
  return true;
}

export function validateExternalApproval(anchor, actualPackageSha256, now = new Date()) {
  if (anchor?.approval !== 'APPROVED') throw new Error('External authority must explicitly be APPROVED.');
  if (
    typeof anchor.reviewer !== 'string' || !anchor.reviewer.trim() ||
    typeof anchor.authority !== 'string' || !anchor.authority.trim()
  ) throw new Error('External approval reviewer and authority are required.');
  if (
    anchor.projectRef !== REQUIRED_PROJECT_REF ||
    anchor.accountSlug !== 'kingrand' ||
    anchor.scope !== 'STAGING_READ_ONLY_MIGRATION_AUDIT' ||
    anchor.singleUsePolicy !== 'ONE_PROCESS_FRESH_PREFLIGHT'
  ) throw new Error('External approval scope, project, or single-use policy mismatch.');
  if (
    !anchor.windowsTrust ||
    Object.keys(anchor.windowsTrust).sort().join(',') !== 'systemRoot,toolSha256' ||
    typeof anchor.windowsTrust.systemRoot !== 'string' ||
    !path.isAbsolute(anchor.windowsTrust.systemRoot) ||
    !anchor.windowsTrust.toolSha256 ||
    Object.keys(anchor.windowsTrust.toolSha256).sort().join(',') !== 'icacls,powershell,whoami' ||
    Object.values(anchor.windowsTrust.toolSha256).some((digest) => !/^[0-9a-f]{64}$/.test(digest))
  ) throw new Error('External approval Windows trust binding is invalid.');
  const approved = Date.parse(anchor.approvedAt);
  const expires = Date.parse(anchor.expiresAt);
  if (
    !Number.isFinite(approved) || !Number.isFinite(expires) ||
    approved > now.getTime() || expires <= now.getTime() || expires <= approved
  ) throw new Error('External approval time window is invalid or not current.');
  if (normalizedJson(anchor.packageSha256) !== normalizedJson(actualPackageSha256)) {
    throw new Error('User-approved package implementation drift.');
  }
  if (anchor.packageDigest !== sha256(normalizedJson(actualPackageSha256))) {
    throw new Error('External approval package digest mismatch.');
  }
  return true;
}

export function optionalLedgerScriptForPresence(records) {
  const presence = Array.isArray(records) && records.length === 1 ? records[0] : null;
  return presence?.category === 'ledger_presence' &&
    presence?.object_key === 'supabase_migrations.schema_migrations' &&
    presence?.definition?.relation === 'supabase_migrations.schema_migrations'
    ? 'catalog-ledger-readonly.sql'
    : null;
}

export function optionalCronScriptForPresence(records) {
  const presence = Array.isArray(records) && records.length === 1 ? records[0] : null;
  return presence?.category === 'cron_presence' &&
    presence?.object_key === 'cron.job' &&
    presence?.definition?.relation === 'cron.job'
    ? 'cron-config-readonly.sql'
    : null;
}

export function verifyFrozenInventory(root, frozen) {
  const mismatches = [];
  const expectedNames = frozen.migrations.map((entry) => entry.filename).sort();
  const actualNames = readdirSync(root)
    .filter((filename) => filename.endsWith('.sql'))
    .sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    mismatches.push({ filename: '<inventory>', expected: expectedNames, actual: actualNames });
  }
  for (const entry of frozen.migrations) {
    const absolute = path.join(root, entry.filename);
    let actual = null;
    try {
      actual = sha256(materializeCrlf(readFileSync(absolute)));
    } catch {
      actual = 'MISSING';
    }
    if (actual !== entry.sha256) mismatches.push({ filename: entry.filename, expected: entry.sha256, actual });
  }
  if (mismatches.length) {
    throw new Error(`Frozen migration drift: ${JSON.stringify(mismatches)}`);
  }
  return true;
}

export function validateStatusManifest(frozen, manifest, inventory = null) {
  const digest = /^[0-9a-f]{64}$/;
  const frozenVersions = new Set(
    frozen.migrations.map((migration) => migration.filename.slice(0, 4)),
  );
  const validObjectEvidence = (items, requireMatch) =>
    Array.isArray(items) && items.length > 0 && items.every((item) =>
      item && typeof item.category === 'string' && item.category.trim() &&
      typeof item.key === 'string' && item.key.trim() &&
      digest.test(item.canonicalSha256) && digest.test(item.remoteSha256) &&
      (!requireMatch || item.canonicalSha256 === item.remoteSha256));
  if (
    !Array.isArray(manifest.versions) ||
    manifest.versions.length !== frozen.migrations.length ||
    new Set(manifest.versions.map((entry) => entry.version)).size !== manifest.versions.length
  )
    throw new Error('Status manifest must map one-to-one to the frozen ledger.');
  for (let index = 0; index < frozen.migrations.length; index += 1) {
    const migration = frozen.migrations[index];
    const entry = manifest.versions[index];
    const expectedVersion = String(index + 1).padStart(4, '0');
    const versionInventory = inventory?.versions?.[index];
    if (inventory && (
      versionInventory?.version !== expectedVersion ||
      versionInventory?.filename !== migration.filename ||
      versionInventory?.canonicalSha256 !== migration.sha256 ||
      !Array.isArray(versionInventory?.invariants)
    )) throw new Error(`Invariant inventory mismatch at ${expectedVersion}.`);
    if (
      entry.version !== expectedVersion ||
      entry.filename !== migration.filename ||
      !migration.filename.startsWith(`${expectedVersion}_`) ||
      entry.evidence?.canonicalSha256 !== migration.sha256 ||
      !digest.test(entry.evidence?.canonicalSha256 ?? '') ||
      !MANIFEST_STATUSES.includes(entry.status)
    )
      throw new Error(`Invalid status manifest entry at ${expectedVersion}.`);
    const hasRemote =
      entry.evidence.remoteLedgerVersion !== null &&
      entry.evidence.remoteCatalogFingerprint !== null &&
      entry.evidence.reviewedAt !== null &&
      entry.evidence.reviewer !== null;
    if (entry.status === 'UNPROVABLE' && hasRemote) {
      throw new Error(`UNPROVABLE ${entry.version} cannot claim remote evidence.`);
    }
    if (entry.status === 'UNPROVABLE') {
      if (
        entry.evidence.remoteLedgerVersion !== null ||
        entry.evidence.remoteCatalogFingerprint !== null ||
        entry.evidence.reviewedAt !== null ||
        entry.evidence.reviewer !== null
      )
        throw new Error(`UNPROVABLE ${entry.version} evidence must remain null.`);
    } else if (!hasRemote) {
      throw new Error(`${entry.status} ${entry.version} requires complete remote evidence.`);
    }
    if (entry.status !== 'UNPROVABLE') {
      const evidence = entry.evidence;
      if (typeof evidence.remoteLedgerVersion !== 'string' || evidence.remoteLedgerVersion !== entry.version) {
        throw new Error(`${entry.status} ${entry.version} has invalid remote ledger version.`);
      }
      if (!digest.test(evidence.remoteCatalogFingerprint) || !digest.test(evidence.receiptSha256 ?? '')) {
        throw new Error(`${entry.status} ${entry.version} requires lowercase SHA-256 evidence.`);
      }
      const reviewed = Date.parse(evidence.reviewedAt);
      const issued = Date.parse(evidence.issuedAt);
      const expires = Date.parse(evidence.expiresAt);
      if (
        !Number.isFinite(reviewed) || !Number.isFinite(issued) || !Number.isFinite(expires) ||
        reviewed < issued || reviewed >= expires
      ) throw new Error(`${entry.status} ${entry.version} has invalid evidence time window.`);
      if (typeof evidence.reviewer !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(evidence.reviewer.trim())) {
        throw new Error(`${entry.status} ${entry.version} has invalid reviewer identity.`);
      }
      if (entry.status === 'PROVEN' && !validObjectEvidence(evidence.objectEvidence, true)) {
        throw new Error(`PROVEN ${entry.version} requires exact matching object evidence.`);
      }
      if (entry.status === 'PROVEN' && versionInventory) {
        if (versionInventory.invariants.some((item) => item.proofStatus === 'UNPROVABLE')) {
          throw new Error(`PROVEN ${entry.version} contains explicitly UNPROVABLE invariants.`);
        }
        const expected = versionInventory.invariants.map((item) => item.invariantId).sort();
        const supplied = (evidence.invariantEvidence ?? []).map((item) => item.invariantId).sort();
        if (
          normalizedJson(expected) !== normalizedJson(supplied) ||
          !digest.test(evidence.catalogEnvelopeAggregate ?? '') ||
          !digest.test(evidence.configEnvelopeAggregate ?? '')
        ) throw new Error(`PROVEN ${entry.version} requires complete invariant envelope coverage.`);
      }
      if (
        entry.status === 'SUPERSEDED' &&
        (!validObjectEvidence(evidence.originalObjectEvidence, false) ||
          !validObjectEvidence(evidence.successorEvidence, true))
      ) throw new Error(`SUPERSEDED ${entry.version} requires original and successor evidence.`);
      if (entry.status === 'SUPERSEDED' && versionInventory) {
        const mappings = evidence.supersessionMap ?? [];
        const expectedIds = new Set(versionInventory.invariants.map((item) => item.invariantId));
        const mapped = new Set(mappings.map((item) => item.invariantId));
        const mappedSuccessors = new Set(mappings.map((item) => item.successorVersion));
        const declaredSuccessors = new Set(entry.supersededBy);
        if (
          mapped.size !== mappings.length ||
          mapped.size !== expectedIds.size ||
          [...mapped].some((id) => !expectedIds.has(id)) ||
          mappedSuccessors.size !== declaredSuccessors.size ||
          [...mappedSuccessors].some((version) => !declaredSuccessors.has(version)) ||
          mappings.some((item) =>
            !digest.test(item.successorProofSha256 ?? '') ||
            typeof item.successorVersion !== 'string' ||
            !entry.supersededBy.includes(item.successorVersion))
        ) throw new Error(`SUPERSEDED ${entry.version} must map every invariant to an exact successor proof.`);
      }
      if (
        entry.status === 'DRIFTED' &&
        (!validObjectEvidence(evidence.mismatchDetails, false) ||
          !evidence.mismatchDetails.some((item) => item.canonicalSha256 !== item.remoteSha256))
      ) throw new Error(`DRIFTED ${entry.version} requires concrete mismatch details.`);
    }
    if (entry.status === 'SUPERSEDED') {
      if (
        !Array.isArray(entry.supersededBy) ||
        entry.supersededBy.length === 0 ||
        new Set(entry.supersededBy).size !== entry.supersededBy.length ||
        entry.supersededBy.some((version) =>
          typeof version !== 'string' ||
          version <= entry.version ||
          !frozenVersions.has(version))
      )
        throw new Error(`SUPERSEDED ${entry.version} requires unique existing later versions.`);
    } else if ((entry.supersededBy ?? []).length !== 0) {
      throw new Error(`${entry.status} ${entry.version} cannot claim supersession.`);
    }
  }
  return true;
}

export function assertStatusTransition(previous, next) {
  const allowed = {
    UNPROVABLE: new Set(['UNPROVABLE', 'PROVEN', 'DRIFTED']),
    PROVEN: new Set(['PROVEN', 'DRIFTED', 'SUPERSEDED']),
    DRIFTED: new Set(['DRIFTED', 'PROVEN']),
    SUPERSEDED: new Set(['SUPERSEDED']),
  };
  if (!allowed[previous]?.has(next)) throw new Error(`Forbidden status transition ${previous} -> ${next}.`);
  return true;
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function normalizedJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function validateAllowlist(allowlist, now = new Date()) {
  const exceptions = allowlist?.exceptions;
  if (!Array.isArray(exceptions)) throw new Error('Allowlist exceptions must be an array.');
  const allowedCategories = new Set(['storage_bucket', 'extension']);
  for (const item of exceptions) {
    if (
      !item ||
      typeof item.category !== 'string' ||
      typeof item.key !== 'string' ||
      typeof item.path !== 'string' ||
      typeof item.rationale !== 'string' ||
      !item.rationale.trim() ||
      typeof item.reviewer !== 'string' ||
      !item.reviewer.trim() ||
      typeof item.expiresAt !== 'string' ||
      !Object.hasOwn(item, 'canonicalValue') ||
      !Object.hasOwn(item, 'remoteValue')
    )
      throw new Error('Allowlist exception is missing required review evidence.');
    if (!/^\/definition\/(?:[^/~]|~[01])+$/.test(item.path)) {
      throw new Error('Allowlist paths must identify a definition leaf.');
    }
    if (/\/(?:count|fingerprint|valid|ready|live)(?:\/|$)/i.test(item.path) || !allowedCategories.has(item.category)) {
      throw new Error('This category or aggregate/security/validity evidence cannot be allowlisted.');
    }
    if (!Number.isFinite(Date.parse(item.expiresAt)) || Date.parse(item.expiresAt) <= now.getTime()) {
      throw new Error('Allowlist exception is expired or invalid.');
    }
  }
  return exceptions;
}

function recordMap(records) {
  const map = new Map();
  const unclassified = [];
  for (const record of records) {
    if (!record || typeof record.category !== 'string' || typeof record.object_key !== 'string') {
      unclassified.push(record);
      continue;
    }
    const key = `${record.category}\u0000${record.object_key}`;
    if (map.has(key)) throw new Error(`Duplicate catalog key: ${key}`);
    map.set(key, normalizeCatalogRecord(record));
  }
  return { map, unclassified };
}

function normalizeCatalogRecord(record) {
  const normalized = canonicalize(record);
  const setValuedLeaves = {
    policy: new Set(['roles']),
    relation: new Set(['acl']),
    routine: new Set(['acl']),
    default_privilege: new Set(['acl']),
    storage_bucket: new Set(['allowed_mime_types']),
  };
  const leaves = setValuedLeaves[normalized.category] ?? new Set();
  for (const leaf of leaves) {
    if (Array.isArray(normalized.definition?.[leaf])) {
      normalized.definition[leaf] = normalized.definition[leaf]
        .map(canonicalize)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
  }
  return normalized;
}

export function fingerprintCatalogRecords(records) {
  const { map, unclassified } = recordMap(records);
  const objects = [...map.values()]
    .map((record) => ({
      category: record.category,
      key: record.object_key,
      sha256: sha256(normalizedJson(record)),
    }))
    .sort((a, b) => `${a.category}\u0000${a.key}`.localeCompare(`${b.category}\u0000${b.key}`));
  return {
    objects,
    aggregateSha256: sha256(normalizedJson(objects)),
    unclassified,
  };
}

function removeAllowlistedLeaves(category, key, canonicalRecord, remoteRecord, exceptions) {
  const left = structuredClone(canonicalRecord);
  const right = structuredClone(remoteRecord);
  for (const item of exceptions.filter((entry) => entry.category === category && entry.key === key)) {
    const leaf = item.path.slice('/definition/'.length).replace(/~1/g, '/').replace(/~0/g, '~');
    if (
      normalizedJson(item.canonicalValue) !== normalizedJson(left.definition?.[leaf]) ||
      normalizedJson(item.remoteValue) !== normalizedJson(right.definition?.[leaf])
    ) continue;
    delete left.definition[leaf];
    delete right.definition[leaf];
  }
  return normalizedJson(left) === normalizedJson(right);
}

export function compareCatalogRecords(canonical, remote, allowlist = { exceptions: [] }) {
  const exceptions = validateAllowlist(allowlist);
  const left = recordMap(canonical);
  const right = recordMap(remote);
  const missing = [];
  const extra = [];
  const changed = [];
  for (const [compound, record] of left.map) {
    if (!right.map.has(compound)) {
      missing.push({ category: record.category, key: record.object_key });
      continue;
    }
    const other = right.map.get(compound);
    if (
      normalizedJson(record) !== normalizedJson(other) &&
      !removeAllowlistedLeaves(record.category, record.object_key, record, other, exceptions)
    ) {
      changed.push({
        category: record.category,
        key: record.object_key,
        canonicalSha256: sha256(normalizedJson(record)),
        remoteSha256: sha256(normalizedJson(other)),
      });
    }
  }
  for (const [, record] of right.map) {
    const compound = `${record.category}\u0000${record.object_key}`;
    if (!left.map.has(compound)) extra.push({ category: record.category, key: record.object_key });
  }
  const unclassified = [...left.unclassified, ...right.unclassified];
  const canonicalFingerprint = fingerprintCatalogRecords(canonical);
  const remoteFingerprint = fingerprintCatalogRecords(remote);
  return {
    equal: !missing.length && !extra.length && !changed.length && !unclassified.length,
    missing,
    extra,
    changed,
    unclassified,
    canonicalAggregateSha256: canonicalFingerprint.aggregateSha256,
    remoteAggregateSha256: remoteFingerprint.aggregateSha256,
  };
}

export function compareCatalogs(canonical, remote) {
  const normalizeInput = (value) => {
    if (
      Array.isArray(value) &&
      value.every((record) => record && typeof record.category === 'string' && typeof record.object_key === 'string')
    ) {
      return [...recordMap(value).map.values()]
        .sort((a, b) => `${a.category}\u0000${a.object_key}`.localeCompare(`${b.category}\u0000${b.object_key}`));
    }
    return canonicalize(value);
  };
  const canonicalJson = `${JSON.stringify(normalizeInput(canonical), null, 2)}\n`;
  const remoteJson = `${JSON.stringify(normalizeInput(remote), null, 2)}\n`;
  const canonicalHash = sha256(canonicalJson);
  const remoteHash = sha256(remoteJson);
  return { equal: canonicalHash === remoteHash, canonicalHash, remoteHash };
}

export function assertCatalogMatch(canonical, remote, allowlist = { exceptions: [] }) {
  const result = compareCatalogRecords(canonical, remote, allowlist);
  if (!result.equal) {
    throw new Error(`Catalog mismatch; execution approval is forbidden: ${JSON.stringify(result)}.`);
  }
  return result;
}

export function assertReadOnlyCatalogSql(sql) {
  const normalizedSql = normalizeSqlCode(sql);
  const statements = splitSqlStatements(normalizedSql).map((statement) => statement.trim());
  if (!/^begin\s+(?:transaction\s+)?read\s+only$/i.test(statements[0] ?? '')) {
    throw new Error('Catalog SQL must begin with BEGIN READ ONLY.');
  }
  if (!/^rollback$/i.test(statements.at(-1) ?? '')) {
    throw new Error('Catalog SQL must end with ROLLBACK.');
  }
  for (const statement of statements.slice(1, -1)) {
    if (!/^(?:set\s+local|select|with)\b/i.test(statement)) {
      throw new Error(`Mutating or unsupported catalog statement: ${statement.slice(0, 40)}`);
    }
  }
  const forbidden = [
    /^\s*with\b[\s\S]*\b(?:insert|update|delete|upsert|merge|truncate)\b/im,
    /\b(body|caption|message|email|phone|voice_ref|image_url|avatar_url|cover_url)\b/i,
    /\bfrom\s+(?:public\.)?(?:posts|post_comments|stories|buddy_messages|profiles|notifications)\b/i,
    /\bselect\s+\*\b/i,
    /\b(?:pg_sleep|dblink(?:_exec)?|lo_(?:import|export|put|write)|set_config|nextval|setval|pg_advisory_\w+|http_\w+|net\.\w+)\s*\(/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(normalizedSql)) throw new Error(`Unsafe catalog SQL matched ${pattern}.`);
  }
  return true;
}

export function assertReadOnlyCurrentStateSql(sql) {
  const normalizedSql = normalizeSqlCode(sql);
  const statements = splitSqlStatements(normalizedSql).map((statement) => statement.trim());
  if (!/^begin\s+(?:transaction\s+)?read\s+only$/i.test(statements[0] ?? '')) {
    throw new Error('Current state SQL must begin with BEGIN READ ONLY.');
  }
  if (!/^rollback$/i.test(statements.at(-1) ?? '')) {
    throw new Error('Current state SQL must end with ROLLBACK.');
  }
  if (statements.length !== 6 || statements.slice(1, -2).some((statement) => !/^set\s+local\b/i.test(statement))) {
    throw new Error('Current state SQL framing rejected.');
  }
  const query = statements.at(-2) ?? '';
  if (!/^select\s+'current_state_flag'\s+as\s+category\b/i.test(query)) {
    throw new Error('Current state SQL projection rejected.');
  }
  if ((query.match(/\bunion\s+all\b/gi) ?? []).length !== 6) {
    throw new Error('Current state SQL flag count rejected.');
  }
  const keys = [
    '0051_buddy_messages_retain_false',
    '0067_profiles_location_verified_true',
    '0074_profiles_display_name_unsanitized',
    '0078_posts_group_audience_mismatch',
    '0078_posts_page_audience_mismatch',
    '0078_posts_event_type_mismatch',
    '0078_posts_photo_type_mismatch',
  ];
  if (keys.some((key) => query.split(`'${key}'`).length !== 2)) {
    throw new Error('Current state SQL key set rejected.');
  }
  const forbidden = [
    /\b(?:insert|update|delete|upsert|merge|truncate)\b/i,
    /\b(body|caption|email|phone|voice_ref|avatar_url|cover_url)\b/i,
    /\bselect\s+\*\b/i,
    /\b(?:pg_sleep|dblink(?:_exec)?|lo_(?:import|export|put|write)|set_config|nextval|setval|pg_advisory_\w+|http_\w+|net\.\w+)\s*\(/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(query)) throw new Error(`Unsafe current state SQL matched ${pattern}.`);
  }
  return true;
}

export function assertCatalogIdentifiersAllowlisted(sql, allowlist) {
  const normalizedSql = normalizeSqlCode(sql);
  const relations = [
    ...normalizedSql.matchAll(/\b(?:from|join)\s+([A-Za-z_][A-Za-z0-9_.]*)/gi),
  ].map((match) => match[1].toLowerCase()).filter((name) => name !== 'lateral');
  const functions = enumerateSqlCallExpressions(normalizedSql, {
    additionalSyntax: ['all', 'from'],
  });
  const unexpectedRelations = [...new Set(relations)].filter(
    (name) => !allowlist.catalogRelations.includes(name),
  );
  const unexpectedFunctions = [...new Set(functions)].filter(
    (name) => !allowlist.catalogFunctions.includes(name),
  );
  if (unexpectedRelations.length || unexpectedFunctions.length) {
    throw new Error(
      `Catalog identifier allowlist mismatch: ${JSON.stringify({ unexpectedRelations, unexpectedFunctions })}`,
    );
  }
  return true;
}

export function enumerateSqlCallExpressions(sql, { additionalSyntax = [] } = {}) {
  const scrubbed = normalizeSqlCode(sql, { maskSingleQuotedStrings: true });
  const syntax = new Set([
    'as', 'case', 'cast', 'check', 'coalesce', 'distinct', 'exists', 'extract',
    'filter', 'in', 'not', 'nullif', 'over', 'partition', 'select', 'values', 'when',
    ...additionalSyntax,
  ]);
  return [...new Set(
    [...scrubbed.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)]
      .map((match) => match[1].toLowerCase())
      .filter((name) => !syntax.has(name)),
  )].sort();
}
