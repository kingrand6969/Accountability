# Group 0 Baseline Evidence

Captured: 2026-07-29, Australia/Perth  
Scope: Read-only application baseline before visual implementation

## Source and preservation

- Git root: `C:\Users\KinGrand\New folder`
- App path: `C:\Users\KinGrand\New folder\accountability-app`
- Branch: `codex/offline-beauty-safety`
- HEAD before Group 0 documents: `da2b9ca6660c72790c8942b1dce2693cff522335`
- Final protected snapshot:
  `C:\Users\KinGrand\AccountAbility-Safe-Snapshots\accountability-app-group0-final-20260729-062336`
- Included and fully SHA-256 verified source files: 817
- Complete manifest: `manifest.sha256`
- Complete expanded status: `status.txt`
- Binary tracked-working-tree diff: `working-tree.patch`
- Branch/HEAD/timestamp receipt: `source-head.txt`
- Git status count recorded in `status.txt`, porcelain v1 with all untracked
  files expanded: 572
- Manifest SHA-256:
  `007737D7DA85D9A7E5BCB2218DA0BF9E49B61138DE03915BEB83D9CE75AB19F7`
- Status SHA-256:
  `12D7057739E7A7C9C1B68410D42C64BF24C0DAA4A62012833DFD0801F69E1EC5`
- Binary diff SHA-256:
  `E16F42EC7458F1CACBCDDB83BE6BC940C405808DAA05D90026B6DD0E1700BA60`
- Source receipt SHA-256:
  `56DDDCD8C76C93CF4B2461DF2FCE5B9BE4D61BEB01C9EC3E27A7F0A9F82FD773`
- Exclusions: root and nested `node_modules`, `.expo`, `dist`, `.wrangler`,
  temporary visual web folders, and `admin-site-deploy.tar.gz`
- Failed preliminary snapshots were removed. The earlier successfully verified
  pre-document snapshot remains as an additional recovery point; the final
  snapshot above is the authoritative Group 0 preservation artifact.

No Git stash, reset, clean, source commit, build, deployment, database mutation,
secret mutation, or production action was performed.

## Staging identity assertion

The config command ran with `APP_VARIANT=staging`.

| Field | Observed value | Result |
|---|---|---|
| Name | `AccountAbility Staging` | PASS |
| Slug | `accountability-app` | PASS |
| Scheme | `accountabilityapp-staging` | PASS |
| Android package | `com.awldesk.accountability.staging` | PASS |
| iOS bundle identifier | `com.awldesk.accountability.staging` | PASS |
| EAS project ID | `f91c0791-4a6e-4080-88fd-5cc9a4e720bf` | PASS |

No environment values or secrets are included in this evidence.

## Baseline commands and results

### TypeScript

Command: `npx.cmd tsc --noEmit`  
Exit code: 0  
Result: PASS

### Jest

Command: `npm.cmd test -- --runInBand`  
Exit code: 0

- Test suites: 51 passed / 51 total
- Tests: 649 passed / 649 total
- Snapshots: 0

Result: PASS

### Update-budget unit tests

Command: `npm.cmd run test:update-budget`  
Exit code: 0

- Tests: 3 passed / 3 total
- Failure/cancel/skip: 0

Result: PASS

### Lint

Command: `npm.cmd run lint`  
Exit code: 1

- Problems: 178
- Errors: 131
- Warnings: 47
- Automatically fixable: 0 errors and 16 warnings

Representative existing categories include React render purity, refs accessed
during render, state changes inside effects, unescaped entities, missing hook
dependencies, and unused values.

Result: FAIL — recorded legacy baseline. No autofix was run.

## Interpretation

- TypeScript and the current automated tests are green.
- Lint is not green and cannot be used as a completion claim.
- Each implementation task must run changed-path lint and introduce no new lint
  failures.
- Shared files touched by a task must correct relevant lint failures when doing
  so is safe and inside that task's approved ownership; unrelated legacy lint
  must not trigger broad refactoring.
- Group 8 requires a reviewed lint disposition and no unresolved blocker/high
  issue in changed code.
