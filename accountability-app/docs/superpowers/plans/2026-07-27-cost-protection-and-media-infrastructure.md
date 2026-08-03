# Cost Protection and Media Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make R2 the observable, abuse-resistant path for new public media, reserve OTA updates for recovery releases, and expose provider capacity without deleting or rewriting existing user content.

**Architecture:** The mobile app compresses media and requests short-lived R2 upload URLs from an authenticated Supabase Edge Function. Database triggers enforce write frequency and provider fallbacks are counted rather than hidden. Release metadata and the admin dashboard surface cost exposure; routine production changes ship through store builds.

**Tech Stack:** Expo/React Native, TypeScript, Supabase Postgres/RLS/Edge Functions, Cloudflare R2, EAS Build/Update, Jest.

---

### Task 1: Correct R2 capability metadata

**Files:**
- Modify: `src/lib/r2.ts`
- Modify: `supabase/functions/r2-sign/index.ts`
- Test: `src/lib/r2.test.ts`

- [ ] Add tests for supported kinds, required byte counts, and stable versus unique upload behavior.
- [ ] Export a single typed capability map shared conceptually by client and signer.
- [ ] Remove the stale “not yet wired” comment and document the compatibility fallback accurately.
- [ ] Run `npm test -- --runInBand src/lib/r2.test.ts`.

### Task 2: Make fallback usage observable

**Files:**
- Create: `supabase/migrations/0082_media_upload_telemetry.sql`
- Create: `src/media/uploadTelemetry.ts`
- Modify: `src/feed/uploadPostImage.ts`
- Modify: `src/profiles/avatar.ts`
- Test: `src/feed/uploadPostImage.test.ts`

- [ ] Create a write-only `media_upload_events` table with authenticated ownership, provider, kind, byte count, success, failure class, and timestamp.
- [ ] Add server-enforced event-rate limits and indexes.
- [ ] Record R2 success and Supabase fallback without storing filenames, image data, or secrets.
- [ ] Ensure telemetry failure never causes a completed media upload to fail.
- [ ] Run the focused upload tests and migration lint.

### Task 3: Harden R2 signing against upload abuse

**Files:**
- Modify: `supabase/functions/r2-sign/index.ts`
- Modify: `supabase/migrations/0057_r2_sign_limit.sql`
- Create: `supabase/functions/r2-sign/index.test.ts`

- [ ] Reject missing R2 configuration with a controlled `503` response.
- [ ] Reject unsupported extensions, mismatched MIME types, invalid byte values, and requests above the per-kind ceiling.
- [ ] Use collision-resistant unique keys for posts rather than millisecond-only names.
- [ ] Reduce the hourly signing ceiling from bulk-import scale to a generous human scale while retaining stable avatar/cover updates.
- [ ] Test unauthorized, oversized, unsupported, rate-limited, and successful requests.

### Task 4: Prevent Supabase fallback from becoming the normal route

**Files:**
- Create: `src/media/uploadPolicy.ts`
- Modify: `src/feed/uploadPostImage.ts`
- Modify: `src/profiles/avatar.ts`
- Test: `src/media/uploadPolicy.test.ts`

- [ ] Classify transient R2 failures separately from authorization, validation, quota, and rate-limit failures.
- [ ] Permit fallback only for transient availability failures.
- [ ] Never bypass an R2 `401`, `413`, `415`, or `429` by uploading the same object to Supabase.
- [ ] Present a safe retry message for blocked uploads.
- [ ] Preserve successful existing Supabase URLs and idempotent post behavior.

### Task 5: Control production update bandwidth

**Files:**
- Modify: `app.json`
- Modify: `eas.json`
- Create: `scripts/check-update-budget.mjs`
- Modify: `package.json`
- Test: `scripts/check-update-budget.test.mjs`

- [ ] Configure production updates for recovery checking rather than automatic routine feature delivery.
- [ ] Keep staging update behavior separate from production.
- [ ] Add a bundle-size budget check that fails a production release when embedded assets or bundle growth exceed the approved threshold.
- [ ] Emit exact bundle bytes and estimated 1,000-user transfer in release evidence.
- [ ] Run the configuration tests and Expo configuration validation.

### Task 6: Add cost and capacity data contracts

**Files:**
- Create: `admin-site/src/lib/capacity.ts`
- Create: `admin-site/src/lib/capacity.test.ts`
- Create: `supabase/functions/admin-capacity/index.ts`
- Create: `supabase/migrations/0083_capacity_rollups.sql`

- [ ] Define typed metrics with `value`, `unit`, `source`, `capturedAt`, `status`, and `connected`.
- [ ] Calculate database-controlled metrics: active users, daily uploads, rejected uploads, and media-provider mix.
- [ ] Return `connected: false` for provider metrics lacking server-side credentials; never return a fabricated zero.
- [ ] Restrict the function to the existing sole-admin authorization path.
- [ ] Add threshold evaluation for 50%, 75%, 90%, and 100%.

### Task 7: Build the Cost & Capacity dashboard

**Files:**
- Create: `admin-site/src/components/CostCapacityPanel.tsx`
- Modify: `admin-site/src/App.tsx`
- Modify: `admin-site/src/styles.css`
- Test: `admin-site/src/components/CostCapacityPanel.test.tsx`

- [ ] Display provider connection state, capacity, threshold, and last refresh.
- [ ] Show active users, database size, storage, upload traffic, Supabase egress, R2 operations, Expo updated users, and estimated cost when connected.
- [ ] Show ad revenue, subscription revenue, and cost per active user only when their data sources exist.
- [ ] Use accessible warning colors and plain-language remediation.
- [ ] Add a release blocker when a required provider is unknown or at 100%.

### Task 8: Verify without destructive migration

**Files:**
- Modify: `docs/superpowers/specs/2026-07-27-cost-protection-and-media-infrastructure-design.md`
- Create: `docs/release-evidence/cost-protection-verification.md`

- [ ] Run unit, type, lint, migration, Edge Function, and admin-site tests.
- [ ] Verify one old Supabase media URL and one new R2 media URL render together in staging.
- [ ] Verify no migration contains deletes or rewrites of existing media rows.
- [ ] Record R2 secrets and deployment connectivity as pass/fail without printing secret values.
- [ ] Record rollback as disabling new R2 uploads while retaining all stored URLs and rows.
