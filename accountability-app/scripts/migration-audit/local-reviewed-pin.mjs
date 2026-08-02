import { createHash } from 'node:crypto';

const HEX = /^[0-9a-f]{64}$/u;
const EXPECTED_LEDGER = Array.from({ length: 96 }, (_, index) => String(index + 1).padStart(4, '0'));
const keys = (value) => Object.keys(value).sort().join(',');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function exact(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || keys(value) !== expected.slice().sort().join(',')) {
    throw new Error(`Approved local pin ${label} shape rejected.`);
  }
}
function hasPending(value) {
  if (typeof value === 'string') return /pending/iu.test(value);
  if (Array.isArray(value)) return value.some(hasPending);
  return value && typeof value === 'object' && Object.values(value).some(hasPending);
}

export function validateApprovedLocalPin(bytes, approvedDigest, now = new Date()) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > 1024 * 1024 || !HEX.test(approvedDigest ?? '') || sha256(bytes) !== approvedDigest) {
    throw new Error('Approved local pin digest rejected.');
  }
  let pin;
  try { pin = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Approved local pin JSON rejected.'); }
  exact(pin, ['formatVersion','status','reviewer','scope','approvedAt','expiresAt','docker','package','container','psql','database','ledgerVersions'], 'root');
  if (pin.formatVersion !== 1 || pin.status !== 'APPROVED' || pin.scope !== 'LOCAL_CANONICAL_REPLAY_0001_0096_ONLY' ||
      typeof pin.reviewer !== 'string' || !pin.reviewer.trim() || hasPending(pin)) throw new Error('Approved local pin authority or pending value rejected.');
  const approvedAt = Date.parse(pin.approvedAt); const expiresAt = Date.parse(pin.expiresAt); const current = now.getTime();
  if (![approvedAt, expiresAt, current].every(Number.isFinite) || approvedAt > current || current >= expiresAt || expiresAt - approvedAt > 24 * 60 * 60 * 1000) {
    throw new Error('Approved local pin expired or time window rejected.');
  }
  exact(pin.docker, ['executableSha256'], 'docker');
  exact(pin.package, ['collectorSha256','collectorTestSha256','queryPlanSha256','packageSha256'], 'package');
  exact(pin.container, ['id','stableProjectionSha256','entrypointCommandSha256'], 'container');
  exact(pin.psql, ['absolutePath','executableSha256','version'], 'psql');
  exact(pin.database, ['serverVersionNum','currentDatabase','databaseOid','systemIdentifier'], 'database');
  for (const value of [pin.docker.executableSha256, ...Object.values(pin.package), pin.container.id,
    pin.container.stableProjectionSha256, pin.container.entrypointCommandSha256, pin.psql.executableSha256]) {
    if (!HEX.test(value)) throw new Error('Approved local pin SHA-256 field rejected.');
  }
  if (pin.psql.absolutePath !== '/nix/store/d43fya852vmrp5hws2lrw47ccq1ngakz-postgresql-17.6/bin/psql' || !/^psql \(PostgreSQL\) \d+(?:\.\d+)+$/u.test(pin.psql.version) ||
      !/^\d{6}$/u.test(pin.database.serverVersionNum) || pin.database.currentDatabase !== 'postgres' ||
      !/^\d+$/u.test(pin.database.databaseOid) || !/^\d+$/u.test(pin.database.systemIdentifier)) {
    throw new Error('Approved local pin database identity rejected.');
  }
  if (!Array.isArray(pin.ledgerVersions) || pin.ledgerVersions.length !== 96 ||
      pin.ledgerVersions.some((version, index) => version !== EXPECTED_LEDGER[index])) {
    throw new Error('Approved local pin ledger must be exactly 0001 through 0096.');
  }
  return Object.freeze({ ...pin, pinSha256: approvedDigest });
}
