import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CHALLENGE_LOCKDOWN_GATE = 'challenge_participant_privacy_v1';
export const CHALLENGE_LOCKDOWN_FINALIZER =
  'public.finalize_challenge_participant_privacy_lockdown';
export const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

const meaningfulText = (value, minimumLength) =>
  typeof value === 'string' && value.trim().length >= minimumLength;

export function evaluateChallengeLockdownReadiness(report, now = Date.now()) {
  const observedAt = Date.parse(report?.observedAt ?? '');
  const evidenceAge = now - observedAt;
  const checks = {
    gate: report?.gate === 'challenge_participant_privacy_v1',
    approved: report?.decision === 'APPROVED',
    noLegacyClients: report?.activeLegacyClients === 0,
    minimumVersion: meaningfulText(report?.minimumVersion, 1),
    reviewer: meaningfulText(report?.reviewer, 3),
    evidence: meaningfulText(report?.evidence, 16),
    freshEvidence:
      Number.isFinite(observedAt) &&
      evidenceAge >= 0 &&
      evidenceAge <= MAX_EVIDENCE_AGE_MS,
  };

  return {
    ready: Object.values(checks).every(Boolean),
    checks,
  };
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    throw new Error(
      'Usage: npm run release:challenge-lockdown -- <reviewed-adoption-report.json>',
    );
  }

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const result = evaluateChallengeLockdownReadiness(report);

  if (!result.ready) {
    const failed = Object.entries(result.checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name)
      .join(', ');
    throw new Error(`Challenge privacy lockdown is not ready: ${failed}`);
  }

  console.log(
    `READY: ${CHALLENGE_LOCKDOWN_GATE} has reviewed, current evidence of zero active legacy clients.`,
  );
  console.log(
    `NEXT: a trusted operator may invoke ${CHALLENGE_LOCKDOWN_FINALIZER} with the exact reviewed report fields.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
