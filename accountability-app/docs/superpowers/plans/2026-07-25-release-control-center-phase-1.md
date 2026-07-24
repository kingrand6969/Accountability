# Release Control Center Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a safe, owner-only Release Control Center foundation that stores immutable release candidates, checks, evidence metadata, and audit events, and displays them in the admin dashboard without enabling production deployment.

**Architecture:** Supabase owns the release state machine and authorization through security-definer RPCs gated by the existing `admin_assert()` function. The Cloudflare-hosted dashboard reads only those RPCs using the founder's authenticated JWT. Phase 1 deliberately contains no GitHub, Expo, store, database-push, stop, or rollback credentials; production controls render as locked until later phases satisfy MFA and provider integration requirements.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Supabase JavaScript client, existing single-file admin dashboard, Node/Jest contract tests, Cloudflare Pages static hosting.

---

## File Structure

- Create `supabase/migrations/0078_release_control_center.sql` — release types, tables, RLS, immutable audit trigger, owner-only read RPCs, and grants.
- Create `tests/release-control-contract.test.js` — static security and UI contract tests that run without production credentials.
- Modify `admin/index.html` — Releases navigation, candidate list, release detail, locked action rail, and fail-closed error states.
- Modify `admin-site/public/dashboard.html` — generated copy of the validated admin dashboard used by the existing Sites wrapper; Cloudflare continues deploying `admin/`.
- Create `admin/_headers` — Cloudflare security headers for the public admin shell.
- Modify `docs/superpowers/plans/2026-07-25-release-control-center-phase-1.md` — mark completed steps during execution.

### Task 1: Database security contract

**Files:**
- Create: `supabase/migrations/0078_release_control_center.sql`
- Test: `tests/release-control-contract.test.js`

- [ ] **Step 1: Write the failing migration contract test**

```js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/0078_release_control_center.sql'),
  'utf8'
);

test('release tables are denied to browser roles', () => {
  expect(sql).toMatch(/alter table public\.admin_release_candidates enable row level security/i);
  expect(sql).toMatch(/revoke all on public\.admin_release_candidates from anon, authenticated/i);
  expect(sql).toMatch(/revoke all on public\.admin_release_events from anon, authenticated/i);
});

test('release reads are gated by admin_assert', () => {
  expect(sql).toMatch(/create or replace function public\.admin_release_list/);
  expect(sql).toMatch(/perform admin_assert\(\)/i);
});

test('audit events cannot be updated or deleted', () => {
  expect(sql).toMatch(/create trigger admin_release_events_immutable/i);
  expect(sql).toMatch(/raise exception 'release audit events are immutable'/i);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the minimal secure schema**

Create:

```sql
create type public.admin_release_kind as enum
  ('expo_update', 'store_binary', 'database', 'configuration', 'mixed');

create type public.admin_release_state as enum
  ('draft', 'checking', 'blocked', 'stale', 'ready', 'rehearsing',
   'awaiting_approval', 'deploying', 'owner_testing', 'rolling_out',
   'paused', 'failed', 'recovering', 'recovered', 'stable', 'cancelled');

create table public.admin_release_candidates (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{7,64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  kind public.admin_release_kind not null,
  state public.admin_release_state not null default 'draft',
  risk text not null check (risk in ('low', 'medium', 'high', 'critical')),
  summary text not null check (length(summary) between 1 and 4000),
  change_reason text not null check (length(change_reason) between 1 and 8000),
  recovery_contract text not null check (length(recovery_contract) between 1 and 8000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version, manifest_sha256)
);
```

Add focused `admin_release_checks`, `admin_release_evidence`, and `admin_release_events` tables. Enable RLS, create no direct browser policies, revoke all table privileges from `anon` and `authenticated`, and grant browser access only through admin RPCs.

- [ ] **Step 4: Add immutable audit enforcement**

```sql
create or replace function public.reject_release_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'release audit events are immutable' using errcode = '55000';
end $$;

create trigger admin_release_events_immutable
before update or delete on public.admin_release_events
for each row execute function public.reject_release_event_mutation();
```

- [ ] **Step 5: Run the contract test**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0078_release_control_center.sql tests/release-control-contract.test.js
git commit -m "feat(admin): add secure release control schema"
```

### Task 2: Owner-only read RPCs

**Files:**
- Modify: `supabase/migrations/0078_release_control_center.sql`
- Modify: `tests/release-control-contract.test.js`

- [ ] **Step 1: Add failing RPC contract assertions**

```js
test('release RPCs expose bounded owner-only reads', () => {
  expect(sql).toMatch(/admin_release_list\(p_limit int default 50, p_offset int default 0\)/);
  expect(sql).toMatch(/least\(coalesce\(p_limit, 50\), 100\)/);
  expect(sql).toMatch(/admin_release_detail\(p_release uuid\)/);
  expect(sql.match(/perform admin_assert\(\)/gi).length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: FAIL because the RPCs are absent.

- [ ] **Step 3: Add bounded list and detail RPCs**

```sql
create or replace function public.admin_release_list(
  p_limit int default 50,
  p_offset int default 0
) returns json
language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(r)), '[]'::json) into result
  from (
    select id, version, commit_sha, manifest_sha256, kind, state, risk,
           summary, created_at, updated_at
    from public.admin_release_candidates
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0))
  ) r;
  return result;
end $$;
```

`admin_release_detail(p_release uuid)` returns the candidate plus ordered checks, evidence metadata, and audit events. It must not return private storage paths, secrets, raw HTML, or provider credentials.

- [ ] **Step 4: Grant only the RPCs**

```sql
grant execute on function public.admin_release_list(int, int) to authenticated;
grant execute on function public.admin_release_detail(uuid) to authenticated;
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: PASS.

```bash
git add supabase/migrations/0078_release_control_center.sql tests/release-control-contract.test.js
git commit -m "feat(admin): add release review RPCs"
```

### Task 3: Dashboard release-review workspace

**Files:**
- Modify: `admin/index.html`
- Modify: `tests/release-control-contract.test.js`

- [ ] **Step 1: Add failing dashboard assertions**

```js
const html = fs.readFileSync(path.join(root, 'admin/index.html'), 'utf8');

test('dashboard includes a fail-closed Releases workspace', () => {
  expect(html).toContain('data-view="releases"');
  expect(html).toContain('id="releaseList"');
  expect(html).toContain('id="releaseDetail"');
  expect(html).toContain('Production actions are locked');
  expect(html).not.toMatch(/onclick="[^"]*(deploy|rollback|release)/i);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: FAIL because the Releases workspace is absent.

- [ ] **Step 3: Add Releases navigation and workspace**

Reuse the existing navigation and view patterns. Add:

```html
<button class="nav-item" data-view="releases" type="button">
  <span>Releases</span><span class="nav-badge" id="releaseBadge">—</span>
</button>
```

The workspace must render:

- Readiness, release kind, risk, recovery promise, and locked commit
- Candidate list with meaningful empty, loading, partial, and error states
- Decision, Evidence, Safety, Rollout, Recovery, and Audit subsections
- Text plus icon statuses; never color alone
- A locked action rail stating why production actions are unavailable in Phase 1

- [ ] **Step 4: Add bounded RPC loading**

```js
async function loadReleases() {
  setReleaseState('loading');
  try {
    const rows = await rpc('admin_release_list', { p_limit: 50, p_offset: 0 });
    renderReleaseList(Array.isArray(rows) ? rows : []);
  } catch (error) {
    renderReleaseError(error);
  }
}
```

Use `textContent` for all agent-supplied text. Do not use `innerHTML` with release content.

- [ ] **Step 5: Add detail loading and stale-request protection**

Keep an incrementing request token. Ignore a detail response when its token no longer matches the selected release.

- [ ] **Step 6: Run tests and validate both inline scripts**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: PASS.

Run a Node `vm.Script` parse against both inline script blocks.  
Expected: both parse without syntax errors.

- [ ] **Step 7: Commit**

```bash
git add admin/index.html tests/release-control-contract.test.js
git commit -m "feat(admin): add release review workspace"
```

### Task 4: Cloudflare shell hardening

**Files:**
- Create: `admin/_headers`
- Modify: `tests/release-control-contract.test.js`

- [ ] **Step 1: Add failing header assertions**

```js
const headers = fs.readFileSync(path.join(root, 'admin/_headers'), 'utf8');
expect(headers).toMatch(/X-Frame-Options: DENY/i);
expect(headers).toMatch(/X-Content-Type-Options: nosniff/i);
expect(headers).toMatch(/Referrer-Policy: no-referrer/i);
expect(headers).toMatch(/Permissions-Policy:/i);
```

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: FAIL because `_headers` does not exist.

- [ ] **Step 3: Add the Cloudflare headers file**

```text
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

Keep the existing HTML Content Security Policy as the stricter script and connection policy.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: PASS.

```bash
git add admin/_headers tests/release-control-contract.test.js
git commit -m "security(admin): harden Cloudflare response headers"
```

### Task 5: Build, copy, and local verification

**Files:**
- Modify: `admin-site/public/dashboard.html`

- [ ] **Step 1: Copy the validated dashboard**

Run: `Copy-Item -LiteralPath admin/index.html -Destination admin-site/public/dashboard.html -Force`

- [ ] **Step 2: Verify the copy is exact**

Run:

```powershell
(Get-FileHash admin/index.html).Hash -eq
(Get-FileHash admin-site/public/dashboard.html).Hash
```

Expected: `True`.

- [ ] **Step 3: Run the full relevant test set**

Run: `npm test -- --runInBand tests/release-control-contract.test.js`  
Expected: PASS.

Run: `npm run lint`  
Expected: no new errors caused by Phase 1.

- [ ] **Step 4: Serve and inspect**

Serve `admin/` locally. Verify:

- Existing admin login still works.
- Non-admin users still fail server-side admin checks.
- Releases view shows an unavailable message until migration 0078 is applied.
- No production action is clickable.
- Keyboard focus order follows navigation, candidate list, tabs, and action rail.
- 375px, 768px, and desktop widths remain usable.

- [ ] **Step 5: Commit**

```bash
git add admin-site/public/dashboard.html
git commit -m "chore(admin): sync release dashboard artifact"
```

### Task 6: Controlled Phase 1 deployment

**Files:**
- No new application files

- [ ] **Step 1: Confirm prerequisites**

- Supabase CLI is authenticated and linked to the intended production project.
- A fresh database backup exists.
- Migration list is synchronized.
- Cloudflare Wrangler is authenticated to the correct account.
- `admin.kingrand.io` points to `accountability-admin.pages.dev`.

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push --include-all`

Expected: migration `0078_release_control_center.sql` applies successfully.

- [ ] **Step 3: Verify server-side access**

As the founder admin, `admin_release_list` returns `[]`.  
As an ordinary authenticated user, it returns SQLSTATE `42501`.

- [ ] **Step 4: Deploy the unchanged static shell plus Releases workspace**

Run: `npx wrangler pages deploy admin --project-name accountability-admin --branch main --commit-dirty=true`

Expected: Cloudflare reports deployment success.

- [ ] **Step 5: Verify production**

Check:

- `https://accountability-admin.pages.dev/` returns HTTP 200.
- `https://admin.kingrand.io/` returns HTTP 200 after domain activation.
- Security headers are present.
- Login and all existing admin sections still work.
- Releases view shows the warm empty state.
- Production actions remain locked.

- [ ] **Step 6: Record Phase 1 completion**

Add a release event documenting the read-only control-center deployment through a one-time service-side maintenance script, not a browser insert.

## Phase 1 Exit Gate

Phase 1 is complete only when:

- Schema and audit invariants pass.
- Existing admin behavior has no regression.
- The production dashboard is reachable through Cloudflare.
- Only the founder can read release-control records.
- No browser-accessible production deployment credential exists.
- No deploy, stop, feature-switch, database-push, or rollback action is enabled.

Phase 2 will add private GitHub candidate submission and evidence validation. Later phases add rehearsal, MFA approval, owner-device release, staged promotion, and recovery in the order fixed by the approved design.
