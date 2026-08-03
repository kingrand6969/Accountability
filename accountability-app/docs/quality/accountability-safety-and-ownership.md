# AccountAbility Safety, Ownership, and Release Guardrails

Date: 2026-07-29  
Status: Mandatory for all implementation groups

## Current baseline

- Git root: `C:\Users\KinGrand\New folder`
- App path: `C:\Users\KinGrand\New folder\accountability-app`
- Branch: `codex/offline-beauty-safety`
- Baseline HEAD: `da2b9ca6660c72790c8942b1dce2693cff522335`
- The working state is changing as planning evidence is added. No hard-coded
  file count is an acceptance criterion.
- Preservation evidence must record its timestamp and both:
  - `git status --porcelain=v1 --untracked-files=normal` with its generated count;
  - `git status --porcelain=v1 --untracked-files=all` with its generated count.
- Existing candidate copies are not accepted as backups unless their manifest
  matches the current state.

## Preservation gate

Before application source changes:

1. Create a timestamped, access-controlled local snapshot outside the Git root.
2. Include ignored environment files but exclude regenerable `node_modules`,
   `.expo`, and `dist`.
3. Keep environment-containing snapshots out of cloud storage and sibling
   candidate folders unless encryption and access controls are proven.
4. Record:
   - branch and HEAD;
   - complete app-scoped status with all untracked files;
   - binary Git diff;
   - file-count and SHA-256 manifest.
5. Verify every included file against the complete SHA-256 manifest. A
   file-count comparison and hash sampling may be recorded as additional checks
   but do not replace full-manifest verification.
6. Do not stash, reset, clean, or create a mixed checkpoint commit.

## Environment guardrail

`app.config.js` selects production unless `APP_VARIANT` equals `staging`.
Therefore every staging config, export, build, or update command must set:

```powershell
$env:APP_VARIANT = 'staging'
```

Before any EAS action, the public Expo config must prove:

| Field | Required staging value |
|---|---|
| App name | `AccountAbility Staging` |
| Scheme | `accountabilityapp-staging` |
| Android/iOS identity | `com.awldesk.accountability.staging` |
| EAS profile/environment/channel | `preview` |
| EAS project | `@kingrand/accountability-app` |
| EAS project ID | `f91c0791-4a6e-4080-88fd-5cc9a4e720bf` |

Run EAS only from the app directory with `EAS_NO_VCS=1`.

## Forbidden without separate production approval

- Production EAS build, update, submit, or store release.
- Production Supabase migration, function deployment, secret change, or data
  mutation.
- Production R2 credential or bucket changes.
- Production hosting/domain deployment.
- Copying production credentials into preview or `.env.local`.
- Any EAS command whose profile, channel, environment, or identity is not proven.

## File ownership

| Area | Exclusive owner |
|---|---|
| `app.config.js`, `app.json`, `eas.json`, package files, `.easignore`, root layouts | Integration and shell owner |
| `src/ui/theme.ts`, shared primitives, brand assets | Design-system owner |
| Feed, Discover, posts, encouragement, create/share UI | Social feature owner |
| Momentum, Path, Journal, Body, achievements UI | Journey feature owner |
| Finance and business screens | Finance feature owner |
| Run/location/offline UI | Run feature owner |
| Auth, onboarding, Profile, Messages UI | Identity feature owner |
| APIs, Supabase client, R2, media policy, payments, offline queues | Data/platform owner |
| Supabase migrations/functions | Serialized backend owner |
| Independent comparison and regression evidence | QA auditor who implemented none of the target group |

Every worker must declare an exact file list before editing. Shared files require
an explicit handoff. Broad formatters and autofix commands are forbidden.

## Verification layers

1. Focused red/green tests for each task.
2. Changed-path lint and TypeScript.
3. Full Jest suite and update-budget tests.
4. Route/deep-link and state matrix.
5. Two-user RLS and private-media tests.
6. Installed Android staging comparison.
7. Accessibility, performance, offline, background/relaunch, and account-switch tests.
8. Independent audit.
9. Product-owner approval.

Before any source-changing group, read the exact versioned Expo SDK 56
documentation required by `AGENTS.md`:
`https://docs.expo.dev/versions/v56.0.0/`. Record the relevant pages in that
group's implementation plan before editing.

## Rollback

- Record the previous staging APK and compatible preview update before every
  candidate.
- Roll back source or preview update without deleting user data.
- Database corrections are forward-only compensating migrations.
- Never rewind or delete user-generated posts, media, messages, runs, or finance
  records as part of a code rollback.

## Platform gates

- Android installed-device evidence is required for every implementation group.
- iOS device/simulator and platform-behavior validation remains mandatory before
  any production release, as required by the approved specification.
- Passing Android staging review does not waive the iOS production gate.
