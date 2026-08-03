import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UPDATE_MAX_BYTES,
  UPDATE_WARN_BYTES,
  evaluateUpdateBudget,
} from './check-update-budget.mjs';

test('accepts a compact production update', () => {
  assert.equal(evaluateUpdateBudget(UPDATE_WARN_BYTES).status, 'ok');
});

test('warns before blocking', () => {
  assert.equal(evaluateUpdateBudget(UPDATE_WARN_BYTES + 1).status, 'warning');
});

test('blocks an update above the hard transfer budget', () => {
  const result = evaluateUpdateBudget(UPDATE_MAX_BYTES + 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.estimatedTransferFor1000Users, (UPDATE_MAX_BYTES + 1) * 1000);
});

