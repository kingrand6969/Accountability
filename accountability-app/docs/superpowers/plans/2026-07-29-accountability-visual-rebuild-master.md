# AccountAbility Visual Rebuild Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce all 26 approved AccountAbility mobile reference screens while preserving every existing function, user record, privacy boundary, and compatibility route.

**Architecture:** Treat the work as a UI refit around preserved Expo Router and service/API seams. Build shared visual foundations first, deliver one vertical product group at a time, and require independent installed-device visual and functional audits before product-owner approval.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, Expo Router, TypeScript, Jest, Supabase, Cloudflare R2, EAS preview builds and preview-channel updates.

---

## Required contracts

- `docs/quality/accountability-reference-contract.md`
- `docs/quality/accountability-route-contract.md`
- `docs/quality/accountability-safety-and-ownership.md`
- `docs/superpowers/specs/2026-07-27-accountability-final-experience-design.md`

## Group sequence

| Group | Scope | Product-owner gate |
|---|---|---|
| 0 | Reference/route contract, safety baseline, ownership, plans | Approve documents and preservation evidence |
| 1 | Brand, tokens, shared components, shell/navigation | Approve installed component gallery and representative screens |
| 2 | Welcome, Promise, Create, Share Proof | Approve complete entry/create recording and comparisons |
| 3 | Feed, Discover, Post Detail, Encouragement | Approve social flow and two-user staging evidence |
| 4 | Momentum, Path, Journal, Body, Profile | Approve Journey/Profile flow and data-preservation evidence |
| 5 | Friendly Finance | Approve approachable flow and accounting reconciliation |
| 6 | Accounting Finance and Business | Approve calculations, atomic operations, and all business flows |
| 7 | Run, Messages, compatibility, cross-app hardening | Approve native/offline/deep-link regression |
| 8 | Independent integrated audit and staging candidate | Approve release candidate; production remains separate |

## Reference-to-owner matrix

| Reference IDs | Owner group | Current route/state owner | Independent gate |
|---|---:|---|---|
| ENTRY-WELCOME-01, PROMISE-START-01, CREATE-HUB-01, SHARE-PROOF-01 | 2 | `/sign-in`, `/onboarding`, `/compose`, `/win-card` | Entry/Create auditor |
| SOC-FEED-01, SOC-DISC-01, SOC-POST-01, SOC-ENCOURAGE-01 | 3 | `/`, screen-local Discover, `/post/[id]` | Social auditor plus two-user RLS/media evidence |
| JOURNEY-OVERVIEW-01, JOURNEY-MOMENTUM-01, JOURNEY-PATH-01, JOURNEY-PATH-02, JOURNEY-JOURNAL-01, JOURNEY-BODY-01, PROFILE-MAIN-01 | 4 | `/activity`, `/journey-path`, `/today`, `/body`, `/profile` | Journey/Profile auditor plus record-count evidence |
| FIN-FRIENDLY-TODAY-01, FIN-FRIENDLY-ADD-01, FIN-FRIENDLY-GOALS-01, FIN-FRIENDLY-MORE-01 | 5 | `/finance` friendly tabs/sheet | Friendly Finance auditor plus accounting reconciliation |
| FIN-ACCOUNTING-ACTIVITY-01, FIN-ACCOUNTING-ACCOUNTS-01, FIN-ACCOUNTING-PLAN-01, FIN-BUSINESS-FOOD-01, FIN-BUSINESS-ITEM-01, FIN-BUSINESS-PROPERTY-01, FIN-BUSINESS-PORTFOLIO-01 | 6 | `/finance`, Finance panes, `/business`, Finance forms | Finance auditor plus atomicity/tenant/reconciliation evidence |

Group 1 owns only the shared visual foundations used by all 26 references; it
does not claim a reference screen complete.

## Group 0 tasks

### Task 0.1: Preserve the live working state

**Files:**
- Create outside Git root: timestamped protected snapshot directory
- Create outside Git root: `status.txt`, `working-tree.patch`, `manifest.sha256`
- Do not modify application files

- [ ] Record the exact branch and HEAD.
- [ ] Record app-scoped tracked and untracked status.
- [ ] Create the protected filesystem snapshot without `node_modules`, `.expo`, or `dist`.
- [ ] Create a binary diff and SHA-256 manifest.
- [ ] Verify every included snapshot file against the complete SHA-256
      manifest; record file counts and hash samples only as additional checks.
- [ ] Record snapshot location without exposing environment values.

**Acceptance:** The exact timestamped working state, measured with both normal
and all-untracked porcelain modes, is fully verified against its manifest and
recoverable without Git stash, reset, or production mutation.

### Task 0.2: Capture the software baseline

**Files:**
- Create: `docs/release-evidence/2026-07-29-group0-baseline.md`

- [ ] Set `APP_VARIANT=staging`.
- [ ] Run `npx expo config --type public` and verify the staging name, scheme, and package.
- [ ] Run TypeScript, Jest, update-budget tests, and lint.
- [ ] Record exact commands, exit codes, counts, failures, and legacy debt.
- [ ] Do not call EAS, Supabase, R2, or production services.

**Acceptance:** Baseline results are fresh, reproducible, and tied to the exact preserved state.

### Task 0.3: Lock route and reference coverage

**Files:**
- Verify: `docs/quality/accountability-reference-contract.md`
- Verify: `docs/quality/accountability-route-contract.md`

- [ ] Map all 26 reference IDs to implementation groups.
- [ ] Map every destination to current and compatibility paths.
- [ ] List required visual/content/error/offline states.
- [ ] Confirm no approved reference or existing deep link is omitted.
- [ ] Generate the complete current route manifest from `src/app` and attach it
      to the Group 0 evidence.

**Acceptance:** Every approved reference and compatibility route has one accountable implementation group and one independent audit gate.

### Task 0.4: Lock ownership and task plans

**Files:**
- Verify: `docs/quality/accountability-safety-and-ownership.md`
- Create before each group: `docs/superpowers/plans/2026-07-29-accountability-group-N-<scope>.md`

- [ ] Assign exclusive owners for shared and feature files.
- [ ] Before each source-changing plan, read and cite the relevant exact Expo
      SDK 56 documentation at `https://docs.expo.dev/versions/v56.0.0/`.
- [ ] Write the next group plan with exact file paths, tests, commands, and expected results.
- [ ] Run the plan self-review: spec coverage, placeholder scan, and type consistency.
- [ ] Dispatch a plan auditor who did not author the plan.

**Acceptance:** This gate is evaluated separately for each Group N plan after
that plan exists. A group cannot start while it contains an XL task, conflicting
file writers, placeholders, or unmeasurable acceptance.

## Per-task execution protocol

1. Fresh implementer receives the full task and exact owned file list.
2. Implementer follows test-driven development and self-reviews.
3. Lead checks the diff and runs fresh verification.
4. Independent spec reviewer checks exact contract compliance.
5. Implementer corrects every spec gap.
6. Independent code-quality/security reviewer checks the corrected result.
7. Implementer corrects every material issue.
8. Independent installed-device auditor compares the exact candidate.
9. `FAIL` returns to implementation; only `PASS` reaches the product owner.
10. Product-owner corrections reopen the responsible task and its complete audit loop.

## Release and link protocol

- JavaScript/bundled-asset-only staging changes may use an approved `preview`
  update so the installed staging app refreshes without reinstalling.
- Native dependency, permission, configuration, identity, or runtime changes
  require a new preview APK.
- The permanent handoff is the Expo build-details page, never the expiring
  signed artifact URL.
- Every candidate includes build/update ID, preview channel, exact commit,
  checksum where applicable, device information, comparison gallery, test
  results, known differences, and rollback target.
- Production requires a separate Release Control record and explicit approval.

## Master definition of done

- All 26 reference screens have independent `PASS` evidence.
- All required approval journeys pass on an installed staging build.
- TypeScript, tests, accepted lint baseline, budget, route, RLS, media, finance,
  offline, accessibility, and performance gates pass.
- The candidate source is clean, reviewed, immutable, and tied to its EAS build.
- No blocker/high discrepancy remains.
- The product owner approves the integrated staging candidate.
- Android evidence is required for staging; iOS validation is an additional
  mandatory pre-production gate.
- Production is untouched until separately approved.
