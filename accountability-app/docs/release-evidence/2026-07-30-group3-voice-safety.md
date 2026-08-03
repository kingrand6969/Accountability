# Group 3 voice-safety staging evidence

Date: 2026-07-30  
Target: accountability staging only  
Verified project ref: `ksvcjvwawamwyquzsizk`

## Local gates

- Focused Jest: 63/63 passed before migration creation; 64/64 passed after the migration contract was added.
- Scoped ESLint: passed.
- Full TypeScript validation: passed.
- Independent API/security audit: passed.
- Independent SQL/RLS audit: passed.

## Migration decision

The rollback-contained staging harness initially passed 11/13 assertions. The two failures proved that a sender could not delete their own encouragement after the post owner blocked them. The deployed sender-only DELETE policy existed, but the SELECT policy hid the sender's own row after `can_view_post` became false.

Migration `0093_voice_encouragement_operations.sql` narrowly replaces only `encouragements_select` with:

`user_id = auth.uid() OR public.can_view_post(post_id, auth.uid())`

The sender-only DELETE policy remains unchanged. No RPC, SECURITY DEFINER function, parallel report/block table, or unrelated schema change was added.

SHA-256: `579EB00BBF8A564824FF212A0D9B5BBA644AC2F584AFFB681437950EBA0B9DDB`  
Supabase CLI: `2.110.0`

## Deployment method

`supabase db push --linked --dry-run` was hard-stopped because staging has no `supabase_migrations.schema_migrations` ledger and the CLI proposed replaying migrations 0001 through 0093.

After independent review, only the byte-audited 0093 file was applied through:

`supabase db query --linked --file supabase/migrations/0093_voice_encouragement_operations.sql`

The command exited successfully. A read-only `pg_policies` query then confirmed exactly one authenticated `encouragements_select` policy with:

`(user_id = auth.uid()) OR can_view_post(post_id, auth.uid())`

## Staging policy proof

The audited pgTAP harness ran through the linked Management API inside `BEGIN`/`ROLLBACK`. pgTAP itself, all fixtures, temporary output, and grants were transactional. All 13 assertions passed:

- canonical report/block tables exist;
- non-sender delete is rejected;
- reporter/blocker identity forgery is rejected;
- recipient report and block succeed;
- repeated reports remain two moderation events;
- duplicate block is rejected and leaves one row;
- sender deletion succeeds after recipient block;
- deletion removes exactly the intended row.

No migration 0094 or parallel safety schema was created.

## Operational warning

Do not run `supabase db push --linked` against this staging project until its missing migration-history ledger is repaired through a separate reviewed baseline procedure. Production was not queried or changed.
