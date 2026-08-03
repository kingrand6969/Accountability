# Staging migration-ledger forensic audit

Date: 2026-07-30  
Scope: repository migrations `0001` through `0093`  
Execution state: **LOCAL ARTIFACTS ONLY — NO DATABASE COMMAND EXECUTED**

## Safety boundary

This package does not contain credentials and does not invoke Supabase. Preflight reads the actual `supabase/.temp/project-ref`; missing, multiple, non-staging, and known-production values hard-stop. It resolves the actual `supabase` executable from the operating system, requires exactly one result, invokes that binary locally with `--version`, requires `2.110.0`, and hashes the executable.

Preflight emits a five-minute, random-nonce receipt containing the exact project reference, executable path/version/SHA-256, and package hashes. It requires a distinct approval file stored outside `scripts/migration-audit` plus the digest the user approved. The verifier rejects the checked-in pending template and requires `approval: APPROVED`, named reviewer and authority, current approval/expiry timestamps, the exact staging project and read-only audit scope, the one-process fresh-preflight policy, exact package hashes, and the package aggregate digest. The checked-in template deliberately contains no usable approval or digest and must never be cited as approval.

The read-only catalog query:

- begins with `BEGIN READ ONLY`;
- applies local statement, lock, and idle-transaction timeouts;
- reads canonical keyed catalog definitions, raw relation ACLs, and keyed relation/sequence/table, column, and routine privileges, including `PUBLIC`;
- never selects member content, notification content, media references, object names, credentials, or secrets;
- covers both the `public` schema and repository-managed `storage` catalog;
- always ends with `ROLLBACK`.

No MD5 is used. Each keyed record and the aggregate are normalized and SHA-256 hashed offline after collection. No linked command is included in this evidence because linked execution requires separate approval and an exact, unexpired receipt.

Catalog evidence necessarily emits database schema object identifiers such as schema, table, column, constraint, index, routine, trigger, role, and policy names. “No object names” refers specifically to rows in `storage.objects`: storage object/member-media names and paths are never queried. Member content and user-created media references are also never queried.

Ledger presence is collected by a dedicated query. Its evidence envelope is bound to the receipt hash, staging project, nonce, exact query hash, collection time within the receipt window, and exactly one record. Version rows are in a separate optional read-only script and may be considered only after that bound presence evidence proves the relation exists. Any optional ledger result must receive its own independently bound envelope.

## Frozen canonical ledger

`scripts/migration-audit/frozen-ledger.json` freezes all 93 migration filenames and their SHA-256 hashes. The audit hard-stops if a file is missing, renamed, added outside the declared range, or its bytes differ from the frozen digest.

`scripts/migration-audit/audit.mjs analyze` performs local parsing only. It splits SQL without breaking quoted or dollar-quoted function bodies and classifies:

- table/column DDL;
- constraints and indexes;
- RLS enablement and policies;
- functions and triggers;
- grants and revocations;
- extensions and storage configuration;
- seed inserts and backfill/update/delete statements.

Each statement receives a normalized SHA-256 fingerprint. No SQL is executed during analysis.

## Version evidence status

`scripts/migration-audit/version-status-manifest.json` contains one record per version with the only permitted states:

- `PROVEN`: matching remote ledger and catalog evidence was captured.
- `SUPERSEDED`: later canonical migrations intentionally replace the version’s final invariant.
- `UNPROVABLE`: evidence has not been collected or cannot establish the invariant.
- `DRIFTED`: canonical and remote fingerprints disagree outside the explicit allowlist.

All versions remain `UNPROVABLE` in this local-only artifact. This is deliberate: no remote evidence was fabricated. Each record includes canonical hash, remote ledger version, remote catalog fingerprint, review timestamp, reviewer, supersession links, and notes placeholders.

## Deterministic comparison

Catalog JSON is recursively key-sorted and array-sorted before hashing. Comparison is keyed by category and object identifier and separately reports missing, extra, changed, and unclassified records. Differences abort approval.

The comparator allowlist is `scripts/migration-audit/allowlist.json`. It is empty. Future exceptions must identify one definition leaf and include rationale, reviewer, expiry, and exact expected canonical and remote values. Counts, fingerprints, and all security categories cannot be excepted.

The catalog includes relations and partition properties; complete column identity; constraints; index predicates and readiness; RLS and policies; views and materialized views; sequences; enums, domains, and composite types; routines and their owners, ACLs, security mode, and configuration; triggers; raw ACL/privilege grants including `PUBLIC`; default privileges; extensions; publications/realtime membership; and storage configuration.

Deterministic non-content configuration has its own read-only query and evidence envelope: rate-limit configuration, storage bucket configuration, and official challenge seed identifiers/fields only. It never selects member-created challenges or user content.

Cron presence has a separate safe `to_regclass` query and receipt-bound exact one-record envelope. An explicit `null` relation is valid absence evidence. Cron identity, schedule, and command SHA-256 are queried by a separate optional script only when the bound presence envelope proves `cron.job` exists.

`invariant-inventory.json` freezes the exact statement fingerprints, categories, and call expressions for every migration version. Destructive and backfill invariants are explicitly `UNPROVABLE`. A future `PROVEN` state requires complete invariant coverage tied to catalog/config envelope aggregates; supersession must map each invariant to an exact later proof, and drift evidence must identify concrete mismatches.

Storage object totals are not part of schema/catalog equality. They live in a separate operational query and evidence file, with restricted access because usage volume may itself be sensitive. Object names, media references, and member content are never emitted.

## Local verification performed

- Parser and classifier tests
- Deterministic normalization/hash tests
- Leaf-only allowlist evidence, expiry, and forbidden-security tests
- Missing/extra/changed/unclassified comparator tests
- Exact staging-reference and CLI-version rejection tests
- Frozen migration and audit-artifact drift tests
- Nonce, expiry, binary, project, receipt, artifact, query, and evidence-envelope mismatch tests
- Windows regular-`.exe` resolution and wrapper/ambiguity rejection tests
- Exact-leaf allowlist removal with remaining-record comparison
- Recursive `DO`-body effects and unknown SQL call-expression rejection tests
- Read-only SQL safety tests
- Content-column, side-effecting function, CTE-DML, and mutation rejection tests
- Complete 93-version manifest validation
- Actual 0001–0093 statement classification coverage

The actual local link file contained the staging reference, but no `supabase` executable was resolvable from the operating system. Therefore the real preflight correctly hard-stopped before issuing a receipt. This document does **not** claim CLI or remote readiness.

## Future approved evidence flow

1. Re-run local tests and frozen-file verification.
2. Obtain separate approval for a read-only staging execution.
3. A future executor must run fresh preflight, query collection, and envelope creation in one process; it must not accept an old receipt as authority.
4. Run the presence query and validate its exact one-record envelope; run the ledger-version query only if bound presence evidence proves the relation.
5. Run the single frozen 19-body `UNION ALL` schema catalog query and place any optional operational counts in a separate restricted evidence file.
6. Save only keyed catalog definitions and approved operational aggregates—never member rows or content.
7. Normalize, SHA-256 hash, and compare against canonical output.
8. Mark each version only from collected evidence; any mismatch remains a hard stop.

The only enabled collection entry point is `collect-readonly.mjs`, which accepts exactly an external approved-anchor path, its independently approved digest, and a new output directory. It creates a fresh preflight inside the same process and rejects external receipt, plan, or executable authority. Immediately before every subprocess it rechecks approval, staging link, absolute CLI path/version/hash, frozen artifacts, receipt validity, and the exact query hash/read-only/call allowlist. Its only database command shape is the frozen absolute executable with `db query --linked --file <absolute-frozen-sql>`.

The pinned local CLI help for exact binary `2.110.0` / SHA-256 `14814afa6fe59081eb9f24709fc077226bf89bc25cf77ee3bcb19565f3ef8899` was captured without a database query and frozen as `supabase-2.110.0-db-query-help.txt`. It proves `--output-format json` is supported. The fixed command therefore ends with `--output-format json`; no alternative output mode is accepted.

Collection order is ledger presence, cron presence, `catalog-union-readonly.sql`, deterministic configuration, operational counts, then optional ledger and cron queries only when their exact receipt-bound presence envelopes prove the relations exist. The union query contains all 19 original SELECT bodies in frozen manifest order inside one `BEGIN READ ONLY` transaction and returns one ordered result set from one shared snapshot. Generation removes only each source statement's terminal separator before embedding; every other body byte is preserved. The CASE order is bound to the manifest category order and then `object_key`. The former monolith and 19 split files remain frozen decomposition provenance; the split files are used at runtime only as individual leaves of the failure-localization tree described below. The normal successful path has five base calls and at most seven calls when both optional queries are present. A validated union failure instead stops normal collection and may use at most ten deterministic localization probes, so the absolute maximum is thirteen calls. At 15 seconds per subprocess the maximum sequential timeout budget is 195 seconds; the collector additionally reserves a fixed 30-second finalization margin, so it refuses to start unless the fresh five-minute receipt has at least 225 seconds remaining. Every call receives the smaller of 15 seconds and the remaining global deadline. JSON output is schema-validated and buffered; subprocess failures, timeouts, malformed output, drift, deadline loss, or expiry publish nothing. Evidence is written as restricted files through a temporary directory and atomically renamed only after the complete run. Command status, argument list, executable hash, and stdout/stderr hashes are recorded without logging credentials or raw content to stdout. This package change requires a new external approval; no checked-in pending template is approval.

Each query accepts only the observed Supabase CLI 2.110.0 JSON wrapper with the exact top-level keys `boundary`, `rows`, and `warning`; `rows` must be an array. The hash-pinned binary establishes that `boundary` is generated by `crypto.randomBytes(16).toString("hex")`, so it must be exactly 32 lowercase hexadecimal ASCII characters. The collector reconstructs the binary's exact protective warning from the boundary inserted once between a frozen 133-byte prefix and 13-byte suffix, requires byte-for-byte equality and exactly 178 UTF-8 bytes, and only then discards both metadata strings. A raw top-level row array, missing or extra wrapper fields, wrong types, malformed boundary, or any warning mismatch is rejected with a fixed value-free error and publishes nothing. Row validation then enforces the exact category allowlist, definition keys/types, row shape, duplicate identities, and presence leaves.

SQL copies are staged and validated before the CLI is inspected. On Windows their DACL is then reduced to read-only for the exact current SID (and the directory to read/execute) for the entire query window; hashes and canonical paths are checked immediately before and after each subprocess. These controls protect against accidental drift and modification by other principals, but a malicious process already running as the same Windows principal may be able to change its own DACL, modify a copy, execute it, and restore it between checks. That residual same-principal risk is explicitly accepted for this staging-only collector; eliminating it requires a separately administered identity or stronger operating-system isolation. Write access is restored only during fail-closed cleanup. `icacls` is used only to apply the ACL. A frozen PowerShell/.NET inspector enumerates every directory and child, projects raw `SecurityIdentifier.Value` rules to strict JSON, and proves exact target coverage, protected inheritance, exactly one total current-SID rule, no inherited rules, and absence of the forbidden broad SIDs `S-1-1-0`, `S-1-5-11`, and `S-1-5-32-545`; the sole current-SID rule must be non-inherited `Allow` with the exact requested rights, so an additional full-control, alternate, or deny rule fails closed. This does not depend on localized ACL names or `icacls /findsid` exit behavior. Rights remain exact rather than permissive: Windows standard `R` is the canonical `Read | Synchronize` mask `1179785`, `RX` is `ReadAndExecute | Synchronize` mask `1179817`, and full control is `2032127`. Real temporary-file integration verifies the observed read-only mask. The distinct external approval binds the canonical Windows root and exact SHA-256 identities for `whoami.exe`, `icacls.exe`, and Windows PowerShell. Runtime does not use `process.env.SystemRoot` as identity: it resolves only the approved root, requires canonical regular non-link tools beneath its canonical `System32`, verifies the approved hashes, and invokes their exact absolute paths. A complete canonical fake Windows tree therefore fails unless it is separately and explicitly approved with different identities. Microsoft Authenticode signatures are not revalidated; the external reviewer’s bound hashes and root are the trust mechanism. Supabase discovery enumerates `PATH` entries in Node and then applies canonical and pinned-binary validation; neither `where.exe` nor `which` is executed. The real Windows integration fixtures run only against temporary directories and files and restore their ACLs before deletion. The local host does not permit unprivileged symlink creation, so the live symlink test is skipped here and must be rerun on privileged CI; traversal and project-containment tests run locally.

Cleanup is a separate post-query phase: it restores exactly one current-SID full-control rule on the protected temporary tree using the same approved absolute tools, re-runs the complete ACL proof, and only then deletes the tree. The full-control restoration is never used during the query window. If restoration or verification fails, deletion is not attempted and the protected temporary tree remains for diagnosis. Because evidence is buffered until atomic publication, an absent output directory proves that no receipt or evidence bundle was published but does not by itself prove that no read-only query ran.

The broad structure-only discovery diagnostic was removed after identifying the exact pinned-CLI wrapper. Its value-free provenance is frozen in `supabase-2.110.0-json-envelope-provenance.json`: the approved staging query identity and hash, capture date and approved-at lower bound, stdout byte count and hash, bounded structure, exact pinned binary path/version/hash, sanitization, and limitations. The exact capture timestamp was not retained and is not invented. The two hashed top-level names are independently reproducible offline by verifying the pinned binary, extracting complete ASCII identifier tokens, and matching token lengths and SHA-256 values; the diagnostic itself explicitly allowlisted `rows` and the three row structural keys in plaintext. No raw stdout or catalog scalar value is retained.

The temporary metadata-fingerprint diagnostic was removed after the hash-pinned binary established the generator and rendering semantics. The warning is an expected advisory identifying returned database rows as untrusted, not a degraded-result or query-failure signal. The provenance artifact records the exact binary hash, approximate source offsets, generator rule, template-with-placeholder, component lengths and hashes, observed value-free fingerprints, semantic assessment, and limitations. Boundary and warning contents are never logged.

If and only if the exact frozen `catalog-union-readonly.sql` subprocess fails, a bounded `CATALOG_SUBPROCESS_ONLY` diagnostic is appended to the fixed stderr hard-stop. It contains only that fixed filename, a safe integer or `null` exit code, timeout boolean, allowlisted `ETIMEDOUT` error code or `null`, stdout/stderr UTF-8 byte lengths and SHA-256 values, and an optional SQLSTATE from the frozen allowlist. When stdout is valid JSON within the 16 MiB stream cap, it also emits a value-free structural fingerprint: fixed structural keys may remain plaintext, unknown keys become only SHA-256 plus UTF-8 length, and every scalar becomes only its type, SHA-256, and UTF-8 length. The fingerprint is capped at depth 4, 16 object entries, and 8 array items; invalid or oversized JSON produces no structure. For the exact pinned `Error` / `LegacyDbQueryUnexpectedStatusError` envelope only, a second fail-closed parser requires the exact object keys, a message of at most 64 KiB, and the byte-exact anchored `unexpected status <three digits>: <body>` template derived from the verified CLI binary. It emits only the fixed enum, an allowlisted 4xx/5xx status or `null`, and the body’s UTF-8 length, SHA-256, bounded value-free JSON structure, and strict allowlisted SQLSTATE. SQLSTATE is otherwise accepted only from an exact top-level JSON `code`, exact `error.code`, or a strictly anchored stdout/stderr line. Raw scalar values, messages, response bodies, unknown identifiers, paths, SQL, and catalog values are never emitted; malformed diagnostic metadata falls back to the fixed error. The first failure stops execution, presence or other query failures never receive this diagnostic, and failure never publishes any buffered evidence.

After that exact validated union failure, and before throwing, the collector may run a frozen no-publication localization tree. It first executes the exact read-only ranges 1–10 and 11–19, then executes both frozen children of the first failing range, repeatedly splitting at `floor((start + end) / 2)`. At most ten probes identify either the first failing individual category in manifest order or the smallest known failing UNION wrapper whose two children both pass. Every subset and individual leaf is a separately hash-frozen `BEGIN READ ONLY` transaction with the same statement, lock, and idle timeouts. Probe output is discarded. The diagnostic emits only each frozen range and filename, `PASS` / `FAIL` / `TIMEOUT`, safe exit code, allowlisted HTTP status or `null`, and the internally derived terminal category/filename or wrapper range. Any plan, freshness, deadline, validation, budget, or execution exception becomes fixed `INCOMPLETE` metadata. No probe path can resume normal collection or publish buffered evidence.

After query execution, cleanup independently restores the approved Windows principal's full control over the staged frozen-SQL tree, removes it, and verifies that the root no longer exists. Cleanup is attempted for success, child failure, and timeout. If both the query and cleanup fail, the original query failure remains visible and only the fixed `CLEANUP_STATUS: FAILED` marker is appended; raw cleanup details are suppressed. A cleanup-only failure is itself a hard stop.

The production bounded-subprocess wrapper and Windows integration test prove timeout and reaping of the direct child while it holds a staged file, followed by successful staged-tree removal and no bundle publication. Node `spawnSync` does not provide a safe generic guarantee that arbitrary descendants are terminated. The pinned Bun `db query` path is invoked as one direct process and is not expected to create persistent helper descendants; this package deliberately does not add broad `taskkill` authority. If a future pinned CLI starts descendants, it requires separately reviewed job/process-tree containment. A timed-out catalog query retains the exact `catalog-union-readonly.sql` filename in the `Read-only query subprocess timeout` prefix before the bounded diagnostic.
