import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_EVIDENCE_AGE_MS,
  evaluateChallengeLockdownReadiness,
} from './check-challenge-lockdown-rollout.mjs';

const now = Date.parse('2026-08-17T04:00:00.000Z');

const approvedReport = {
  gate: 'challenge_participant_privacy_v1',
  decision: 'APPROVED',
  activeLegacyClients: 0,
  observedAt: '2026-08-17T03:30:00.000Z',
  minimumVersion: '1.0.1',
  reviewer: 'Release Owner',
  evidence: 'Authoritative active-client query: zero legacy clients.',
};

test('accepts only a reviewed, fresh zero-legacy adoption report', () => {
  assert.deepEqual(evaluateChallengeLockdownReadiness(approvedReport, now), {
    ready: true,
    checks: {
      gate: true,
      approved: true,
      noLegacyClients: true,
      minimumVersion: true,
      reviewer: true,
      evidence: true,
      freshEvidence: true,
    },
  });
});

test('rejects any report that still observes a legacy client', () => {
  const result = evaluateChallengeLockdownReadiness(
    { ...approvedReport, activeLegacyClients: 1 },
    now,
  );
  assert.equal(result.ready, false);
  assert.equal(result.checks.noLegacyClients, false);
});

test('rejects pending or stale evidence', () => {
  const pending = evaluateChallengeLockdownReadiness(
    { ...approvedReport, decision: 'PENDING' },
    now,
  );
  const stale = evaluateChallengeLockdownReadiness(
    {
      ...approvedReport,
      observedAt: new Date(now - MAX_EVIDENCE_AGE_MS - 1).toISOString(),
    },
    now,
  );

  assert.equal(pending.ready, false);
  assert.equal(pending.checks.approved, false);
  assert.equal(stale.ready, false);
  assert.equal(stale.checks.freshEvidence, false);
});
