# Group 2 Entry and Create Release Evidence

## Task 2.7 automated gates — Steps 1–2

- Execution timestamp: `2026-07-30T02:16:46.311+08:00`
- Time zone: Australia/Perth (`+08:00`)
- Working directory: `C:\Users\KinGrand\New folder\accountability-app`
- Branch: `codex/offline-beauty-safety`
- HEAD: `da2b9ca6660c72790c8942b1dce2693cff522335`
- Scope: automated verification only; the integration/evidence owner made no application-source changes.
- Worktree state: pre-existing modified and untracked application files were preserved. No stash, reset, clean, commit, or source repair was performed.

### Step 1 — Fresh focused verification

#### Focused Jest

Command:

```powershell
npm.cmd test -- src/entry/welcomeContract.test.ts src/entry/promiseSelection.test.ts src/entry/promisePersistence.test.ts src/entry/createFlow.test.ts src/entry/composeDraft.test.ts src/entry/accountDraftCleanup.test.ts src/entry/pickerRecovery.test.ts src/entry/proofPrivacy.test.ts src/entry/proofExport.test.ts src/entry/proofActions.test.ts src/entry/pendingProofActions.test.ts src/auth/validation.test.ts src/feed/videoPolicy.test.ts src/feed/publicShare.test.ts src/media/uploadPolicy.test.ts src/media/privateMedia.test.ts --runInBand
```

- Exit code: `0`
- Process wall duration: `6.6350795 s`
- Jest-reported duration: `4.759 s` (estimated `6 s`)
- Suites: `16 passed / 16 total`
- Tests: `307 passed / 307 total`
- Snapshots: `0 total`
- Failures: none
- Result: `PASS`

Passing suites:

```text
src/entry/welcomeContract.test.ts
src/entry/promiseSelection.test.ts
src/entry/accountDraftCleanup.test.ts
src/entry/proofActions.test.ts
src/entry/composeDraft.test.ts
src/auth/validation.test.ts
src/entry/proofExport.test.ts
src/entry/createFlow.test.ts
src/feed/videoPolicy.test.ts
src/media/privateMedia.test.ts
src/entry/promisePersistence.test.ts
src/entry/proofPrivacy.test.ts
src/entry/pendingProofActions.test.ts
src/feed/publicShare.test.ts
src/entry/pickerRecovery.test.ts
src/media/uploadPolicy.test.ts
```

#### TypeScript

Command:

```powershell
npx.cmd tsc --noEmit
```

- Exit code: `0`
- Process wall duration: `9.7715468 s`
- Diagnostics: none
- Failures: none
- Result: `PASS`

#### Specified changed-path lint

Command:

```powershell
npx.cmd eslint src/app/sign-in.tsx src/ui/AuthShell.tsx src/app/onboarding.tsx src/app/compose.tsx src/app/win-card.tsx src/entry
```

- Exit code: `0`
- Process wall duration: `6.4907483 s`
- Errors: `0`
- Warnings: `0`
- Failures: none
- Result: `PASS`

### Step 2 — Repository gates

#### Full Jest

Command:

```powershell
npm.cmd test -- --runInBand
```

- Exit code: `0`
- Process wall duration: `24.1312196 s`
- Jest-reported duration: `22.344 s`
- Suites: `70 passed / 70 total`
- Tests: `997 passed / 997 total`
- Snapshots: `1 passed / 1 total`
- Failures: none
- Known baseline failures: none observed
- Result: `PASS`

#### Update-budget tests

Command:

```powershell
npm.cmd run test:update-budget
```

- Exit code: `0`
- Process wall duration: `0.9968655 s`
- Node test-reported duration: `67.6666 ms`
- Tests: `3 passed / 3 total`
- Failed: `0`
- Cancelled: `0`
- Skipped: `0`
- Todo: `0`
- Failures: none
- Result: `PASS`

Passing checks:

```text
accepts a compact production update
warns before blocking
blocks an update above the hard transfer budget
```

## Automated-gate conclusion

Task 2.7 Steps 1–2 are `PASS`: all `310` explicitly invoked focused/update-budget tests passed (`307 + 3`), TypeScript and lint passed as separate command gates, and the full repository run passed `997` tests. There are no automated-gate failures to assign to an application-source owner.

This evidence does not by itself complete Group 2. Task 2.7 Steps 3–4 and Task 2.8 installed-device, privacy/RLS, accessibility, visual-comparison, staging-identity, and rollback evidence remain separate required gates.
