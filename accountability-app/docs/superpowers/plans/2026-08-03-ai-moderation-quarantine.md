# AI Moderation Quarantine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Immediately hide AI-confirmed violations in posts, comments, and stories pending administrator review while retaining human review of every manual report and excluding private messages.

**Architecture:** Migration `0096` makes row-level security the quarantine boundary and exposes narrowly privileged, idempotent server transitions. The moderation Edge Function validates AI output and calls those transitions; structured manual reports trigger priority rechecks but never hide content by themselves. Existing admin removal remains the sanction path, while approval atomically restores visibility and records the decision.

**Tech Stack:** PostgreSQL 17/RLS/PLpgSQL, Supabase Edge Functions on Deno, Supabase JS, React Native/Expo, static admin dashboard JavaScript, Jest, Node test runner, SQL integration tests.

---

## File map

- Create `supabase/migrations/0096_ai_moderation_quarantine.sql`: states, audit fields, idempotent server RPCs, report trigger, and RLS enforcement.
- Create `supabase/tests/ai_moderation_quarantine.sql`: role-level SQL integration and transaction tests.
- Create `src/moderation/quarantineContract.test.ts`: source-level migration and client contract checks.
- Modify `supabase/functions/moderate-content/index.ts`: supported sources, response validation, priority report input, and quarantine RPC.
- Create `supabase/functions/moderate-content/index.test.ts`: worker behavior tests with injected dependencies.
- Modify `src/feed/api.ts`: structured post/comment reporting through the reporting RPC.
- Modify `src/stories/api.ts`: structured story reporting.
- Modify `src/app/post/[id].tsx`: expose report action for comments the viewer does not own.
- Modify `src/app/story/[userId].tsx`: expose report action for stories the viewer does not own.
- Modify `supabase/functions/admin-actions/index.ts`: idempotent approve/remove decisions for quarantined sources.
- Modify `admin-site/public/dashboard.html`: show quarantine state and explicit Approve/Remove actions.
- Modify `admin-site/tests/rendered-html.test.mjs`: dashboard action contract.
- Modify `scripts/migration-audit/*`: extend frozen canonical provenance through 0096 after the migration is final.

### Task 1: Database quarantine boundary

**Files:**
- Create: `supabase/tests/ai_moderation_quarantine.sql`
- Create: `supabase/migrations/0096_ai_moderation_quarantine.sql`

- [ ] **Step 1: Write the failing SQL integration test**

Create fixtures for one post, comment, and story, then assert this contract before `0096` exists:

```sql
begin;
select plan(14);

select has_column('public', 'posts', 'moderation_state');
select has_column('public', 'post_comments', 'moderation_state');
select has_column('public', 'stories', 'moderation_state');
select has_function('public', 'quarantine_moderated_content', array['text','uuid','text[]','numeric','text']);
select has_function('public', 'review_quarantined_content', array['uuid','text']);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and verify it fails**

Run the repository's Supabase SQL-test command against the disposable canonical database, targeting `supabase/tests/ai_moderation_quarantine.sql`.

Expected: FAIL because the columns and functions do not exist.

- [ ] **Step 3: Add states, audit metadata, and uniqueness**

Implement these exact foundations in `0096`:

```sql
alter table public.posts
  add column if not exists moderation_state text not null default 'visible'
    check (moderation_state in ('visible', 'quarantined'));
alter table public.post_comments
  add column if not exists moderation_state text not null default 'visible'
    check (moderation_state in ('visible', 'quarantined'));
alter table public.stories
  add column if not exists moderation_state text not null default 'visible'
    check (moderation_state in ('visible', 'quarantined'));

alter table public.moderation_flags
  add column if not exists quarantine_reason text,
  add column if not exists check_status text not null default 'confirmed'
    check (check_status in ('confirmed', 'safe', 'uncertain', 'error'));

create unique index if not exists moderation_flags_open_source_idx
  on public.moderation_flags(source_table, source_id)
  where status = 'open';
```

- [ ] **Step 4: Implement the atomic service-only quarantine function**

Use a `SECURITY DEFINER` function with `set search_path = public`, validate `p_source_table` against `posts`, `post_comments`, and `stories`, update exactly that allowlisted table using `format('%I', ...)`, and upsert the open flag in the same transaction. Revoke from `public`, `anon`, and `authenticated`; grant only `service_role`.

```sql
create or replace function public.quarantine_moderated_content(
  p_source_table text, p_source_id uuid, p_categories text[],
  p_max_score numeric, p_reason text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare changed boolean;
begin
  if p_source_table not in ('posts', 'post_comments', 'stories') then
    raise exception 'unsupported moderation source' using errcode = '22023';
  end if;
  execute format(
    'update public.%I set moderation_state = ''quarantined'' where id = $1 returning true',
    p_source_table
  ) into changed using p_source_id;
  if coalesce(changed, false) = false then return false; end if;
  insert into public.moderation_flags
    (source_table, source_id, categories, max_score, quarantine_reason, check_status)
  values
    (p_source_table, p_source_id, coalesce(p_categories, '{}'), p_max_score,
     left(p_reason, 500), 'confirmed')
  on conflict (source_table, source_id) where status = 'open'
  do update set categories = excluded.categories, max_score = excluded.max_score,
                quarantine_reason = excluded.quarantine_reason,
                check_status = 'confirmed';
  return true;
end $$;
```

- [ ] **Step 5: Rebuild read and interaction policies**

Add `moderation_state = 'visible'` to post, comment, and story SELECT policies, including the post-owner branch. Add parent-post visibility checks to like/comment INSERT and SELECT paths so a quarantined post cannot be inspected or interacted with. Update `can_view_post`, `get_public_share`, and `resolve_public_share_post` so a quarantined post always returns no result.

- [ ] **Step 6: Prove role isolation and atomicity**

Extend the SQL test to assert:

```sql
select function_privs_are(
  'public', 'quarantine_moderated_content',
  array['text','uuid','text[]','numeric','text'], 'service_role', array['EXECUTE']
);
select throws_ok(
  $$ select public.quarantine_moderated_content('buddy_messages', gen_random_uuid(), '{}', 1, 'x') $$,
  '22023'
);
```

Also assert that quarantine hides each fixture from `authenticated`, author readback cannot bypass it, public shares stop resolving, a second callback retains one open flag, and a missing source creates no flag.

- [ ] **Step 7: Run SQL tests and commit**

Expected: all `ai_moderation_quarantine.sql` assertions pass and the migration applies twice in the disposable clone without error.

Commit only the migration and SQL test:

```bash
git add supabase/migrations/0096_ai_moderation_quarantine.sql supabase/tests/ai_moderation_quarantine.sql
git commit -m "feat: add atomic moderation quarantine"
```

### Task 2: Moderation worker decisions

**Files:**
- Modify: `supabase/functions/moderate-content/index.ts`
- Create: `supabase/functions/moderate-content/index.test.ts`

- [ ] **Step 1: Extract and test a strict decision parser**

Add tests for safe, confirmed, malformed, missing, and out-of-range results. Define:

```ts
export type ModerationDecision =
  | { kind: 'safe' }
  | { kind: 'confirmed'; categories: string[]; maxScore: number }
  | { kind: 'uncertain'; reason: string };

export function parseModerationResult(value: unknown): ModerationDecision;
```

Expected initially: FAIL because the export does not exist.

- [ ] **Step 2: Implement bounded validation**

Accept only an object with a boolean `flagged`, boolean category values, finite scores from `0` through `1`, at most 64 categories, and known string category names. Malformed output returns `uncertain`; it must never call the quarantine RPC.

- [ ] **Step 3: Remove private messages from the worker**

Set the exact source allowlist to:

```ts
const SOURCES = {
  posts: { text: 'body', image: 'image_url', author: 'user_id' },
  post_comments: { text: 'body', author: 'user_id' },
  stories: { text: 'caption', image: 'image_url', author: 'user_id' },
} as const;
```

Test that `buddy_messages` returns `400 bad input` and does not call OpenAI or Supabase.

- [ ] **Step 4: Call the atomic RPC on confirmed violations**

Replace direct flag insertion with:

```ts
const { error } = await admin.rpc('quarantine_moderated_content', {
  p_source_table: table,
  p_source_id: id,
  p_categories: decision.categories,
  p_max_score: decision.maxScore,
  p_reason: requestReason === 'manual_report' ? 'manual report AI confirmation' : 'automatic AI confirmation',
});
if (error) throw error;
```

Test that safe/uncertain/error results never quarantine, confirmed results call once, and a database error produces a retryable non-2xx response rather than a false success.

- [ ] **Step 5: Add bounded retry metadata**

Record attempt outcome and count without storing full content or API responses. Cap automated retry scheduling at three attempts with increasing delays; manual reports may enqueue a new priority attempt independently. Test the cap and ensure secrets/content are absent from logs.

- [ ] **Step 6: Run and commit**

Run the Deno test file and the repository moderation contract tests. Expected: PASS.

```bash
git add supabase/functions/moderate-content/index.ts supabase/functions/moderate-content/index.test.ts
git commit -m "feat: quarantine AI-confirmed violations"
```

### Task 3: Structured manual reports and priority AI recheck

**Files:**
- Modify: `supabase/migrations/0096_ai_moderation_quarantine.sql`
- Modify: `supabase/tests/ai_moderation_quarantine.sql`
- Modify: `src/feed/api.ts`
- Modify: `src/stories/api.ts`
- Create: `src/moderation/quarantineContract.test.ts`

- [ ] **Step 1: Write failing report contract tests**

Assert that report payloads use `source_table` and `source_id`, do not encode identifiers inside free-text reasons, preserve a report when AI returns safe/uncertain/error, and enqueue one priority moderation request.

- [ ] **Step 2: Add structured report fields and RPC**

Add nullable `source_table` and `source_id` to `buddy_reports`, constrain supported sources, and create:

```sql
public.report_content(p_source_table text, p_source_id uuid, p_reason text)
```

The authenticated function derives `reporter` from `auth.uid()`, derives the content author server-side, forbids self-reporting, bounds the reason length, inserts the report, and enqueues `{ table, id, reason: 'manual_report', report_id }` through the existing secret-backed moderation endpoint. Grant it to `authenticated` only.

- [ ] **Step 3: Update client APIs**

Use the RPC from `reportPost`, add `reportComment(commentId)` and `reportStory(storyId)`, and propagate database errors unchanged. Do not report or scan voice encouragements or buddy messages through this content path.

- [ ] **Step 4: Verify manual-report semantics**

SQL tests must prove one report does not change `moderation_state`, confirmed AI quarantine retains the report, and safe/uncertain/error outcomes leave both visible content and an unresolved report.

- [ ] **Step 5: Run and commit**

Run the focused Jest contract and SQL integration tests. Expected: PASS.

```bash
git add supabase/migrations/0096_ai_moderation_quarantine.sql supabase/tests/ai_moderation_quarantine.sql src/feed/api.ts src/stories/api.ts src/moderation/quarantineContract.test.ts
git commit -m "feat: trigger safety recheck from manual reports"
```

### Task 4: Comment and story reporting UI

**Files:**
- Modify: `src/app/post/[id].tsx`
- Modify: `src/app/story/[userId].tsx`
- Modify: `src/moderation/quarantineContract.test.ts`

- [ ] **Step 1: Write failing interaction contracts**

Assert that non-owners receive a Report action, owners do not, confirmation is required, duplicate taps are locked while pending, and success/error feedback is accessible.

- [ ] **Step 2: Add comment reporting**

Add a compact accessible action to comment rows owned by another user. Confirmation text must state that the content stays visible unless AI confirms a violation or an administrator removes it.

- [ ] **Step 3: Add story reporting**

Add the same guarded action to the active story viewer for another member's story, calling `reportStory(story.id)`.

- [ ] **Step 4: Run and commit**

Run the focused Jest test plus TypeScript checking. Expected: PASS with no new type errors.

```bash
git add src/app/post/[id].tsx src/app/story/[userId].tsx src/moderation/quarantineContract.test.ts
git commit -m "feat: add comment and story safety reports"
```

### Task 5: Idempotent administrator review

**Files:**
- Modify: `supabase/functions/admin-actions/index.ts`
- Modify: `supabase/migrations/0096_ai_moderation_quarantine.sql`
- Modify: `supabase/tests/ai_moderation_quarantine.sql`

- [ ] **Step 1: Write failing decision tests**

Cover approve, reject, repeated approve, repeated reject, non-admin denial, stale source, and conflicting later decisions. Assert rejection creates at most one strike.

- [ ] **Step 2: Implement the review transaction**

Create service-only `review_quarantined_content(p_flag uuid, p_decision text)` with decisions `approve` and `remove`. Lock the flag row, reject already-final decisions as idempotent no-ops, restore the allowlisted source on approve, and mark the flag `approved`. Extend the status constraint to `open`, `approved`, `actioned`, `dismissed`, and `removed`.

- [ ] **Step 3: Route admin actions through the transaction**

Add `approve_content` to `admin-actions`. Keep removal, warning, and strike changes in one server-side transaction or a single RPC so a retry cannot double-strike. Validate UUIDs, decision names, source tables, and administrator identity before using service authority.

- [ ] **Step 4: Run and commit**

Run SQL and Edge Function tests. Expected: all decision/idempotency assertions pass.

```bash
git add supabase/functions/admin-actions/index.ts supabase/migrations/0096_ai_moderation_quarantine.sql supabase/tests/ai_moderation_quarantine.sql
git commit -m "feat: add safe admin quarantine decisions"
```

### Task 6: Administrator dashboard

**Files:**
- Modify: `admin-site/public/dashboard.html`
- Modify: `admin-site/tests/rendered-html.test.mjs`

- [ ] **Step 1: Write failing dashboard contract tests**

Assert open AI flags show `Quarantined`, an `Approve` button, and `Remove + warn`; visible manual reports show `Visible pending review`; no action interpolates unescaped content into JavaScript.

- [ ] **Step 2: Implement explicit decisions**

Replace ambiguous `Dismiss`/`Handled` behavior for quarantined flags with `Approve` and `Remove + warn`. Approval invokes `admin-actions` with `{ action: 'approve_content', flag_id }`, asks for confirmation, locks the button during the request, refreshes flags/reports/overview, and displays server errors without internal stack traces.

- [ ] **Step 3: Preserve manual-report review**

Show the AI outcome beside every structured report but keep administrator Allow/Remove controls regardless of `safe`, `uncertain`, or `error`. Do not auto-close reports when AI says safe.

- [ ] **Step 4: Run and commit**

Run `node --test admin-site/tests/rendered-html.test.mjs`. Expected: PASS.

```bash
git add admin-site/public/dashboard.html admin-site/tests/rendered-html.test.mjs
git commit -m "feat: review quarantined content in admin"
```

### Task 7: Regression, audit provenance, and staging gate

**Files:**
- Modify: `scripts/migration-audit/frozen-ledger.json`
- Modify: `scripts/migration-audit/version-status-manifest.json`
- Modify: `scripts/migration-audit/frozen-artifacts.json`
- Modify: `scripts/migration-audit/invariant-inventory.json`
- Modify: exact 0095-bound validator and test files under `scripts/migration-audit/`
- Create: `scripts/migration-audit/0096-postconditions-readonly.sql`

- [ ] **Step 1: Run focused and full regression suites**

Run SQL quarantine tests, Edge Function tests, focused Jest contracts, admin HTML tests, the full migration-audit Node suite, TypeScript checking, lint, and the committed-lockfile native dependency audit. Record and triage any reachable high/critical advisories; do not force dependency upgrades.

- [ ] **Step 2: Replay canonical migrations through 0096**

Rebuild a disposable PostgreSQL 17 canonical database from exactly `0001` through `0096`, apply `0096` twice to prove idempotency, and run the read-only postconditions. Expected: all safety, privilege, RLS, share, and admin decision checks are true.

- [ ] **Step 3: Extend frozen audit provenance**

Append the immutable `0095` and final `0096` hashes, regenerate invariant inventory, advance all exact range validators and fixtures from `0001-0094` to `0001-0096`, and mark `0095`/`0096` `UNPROVABLE` until separately approved fresh staging evidence exists.

- [ ] **Step 4: Prepare deployment artifacts without deploying**

Calculate and report separate SHA-256 digests for the final `0096` migration, `moderate-content` bundle, and `admin-actions` bundle. Do not mutate staging until the user approves those exact digests. Do not touch production.

- [ ] **Step 5: Commit the verified package**

```bash
git add scripts/migration-audit supabase/migrations/0096_ai_moderation_quarantine.sql supabase/tests/ai_moderation_quarantine.sql supabase/functions/moderate-content supabase/functions/admin-actions src/moderation src/feed/api.ts src/stories/api.ts src/app/post/[id].tsx src/app/story/[userId].tsx admin-site/public/dashboard.html admin-site/tests/rendered-html.test.mjs
git commit -m "feat: quarantine confirmed safety violations"
```

Expected: only reviewed feature and audit files are staged; unrelated dirty-worktree files remain untouched.
