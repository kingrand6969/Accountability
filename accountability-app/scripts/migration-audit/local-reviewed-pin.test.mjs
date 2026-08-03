import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { validateApprovedLocalPin } from './local-reviewed-pin.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function approved() {
  return {
    formatVersion: 1, status: 'APPROVED', reviewer: 'external-reviewer',
    scope: 'LOCAL_CANONICAL_REPLAY_0001_0096_ONLY',
    approvedAt: '2026-08-02T00:00:00.000Z', expiresAt: '2026-08-03T00:00:00.000Z',
    docker: { executableSha256: 'a'.repeat(64) },
    package: { collectorSha256: 'b'.repeat(64), collectorTestSha256: 'c'.repeat(64), queryPlanSha256: 'd'.repeat(64), packageSha256: 'e'.repeat(64) },
    container: { id: 'f'.repeat(64), stableProjectionSha256: '1'.repeat(64), entrypointCommandSha256: '2'.repeat(64) },
    psql: { absolutePath: '/nix/store/d43fya852vmrp5hws2lrw47ccq1ngakz-postgresql-17.6/bin/psql', executableSha256: '3'.repeat(64), version: 'psql (PostgreSQL) 17.6' },
    database: { serverVersionNum: '170006', currentDatabase: 'postgres', databaseOid: '5', systemIdentifier: '123' },
    ledgerVersions: Array.from({ length: 96 }, (_, i) => String(i + 1).padStart(4, '0')),
  };
}

test('approved local pin is digest, scope, time, identity, and exact-ledger bound', () => {
  const bytes = Buffer.from(JSON.stringify(approved()));
  const result = validateApprovedLocalPin(bytes, digest(bytes), new Date('2026-08-02T12:00:00.000Z'));
  assert.equal(result.status, 'APPROVED');
  assert.equal(result.pinSha256, digest(bytes));
});

test('pin rejects pending values, digest drift, expiry, and incomplete ledger', () => {
  for (const mutate of [
    (pin) => { pin.status = 'REVIEW_CANDIDATE_PENDING'; },
    (pin) => { pin.psql.executableSha256 = 'PENDING_REVIEW'; },
    (pin) => { pin.expiresAt = '2026-08-02T01:00:00.000Z'; },
    (pin) => { pin.ledgerVersions.pop(); },
  ]) {
    const pin = approved(); mutate(pin); const bytes = Buffer.from(JSON.stringify(pin));
    assert.throws(() => validateApprovedLocalPin(bytes, digest(bytes), new Date('2026-08-02T12:00:00.000Z')), /pin|approved|pending|ledger|expired/iu);
  }
  const bytes = Buffer.from(JSON.stringify(approved()));
  assert.throws(() => validateApprovedLocalPin(bytes, '0'.repeat(64), new Date('2026-08-02T12:00:00.000Z')), /digest/u);
});
