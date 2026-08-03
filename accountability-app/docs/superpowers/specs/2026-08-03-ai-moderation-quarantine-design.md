# AI Moderation Quarantine Design

## Objective

Protect members from AI-confirmed safety violations without making every piece of content wait for manual approval. Posts, comments, and stories publish normally. Confirmed violations are hidden immediately and held for an administrator's decision. Private buddy messages are outside this system.

## Scope

Included content:

- Posts, including public-feed, buddy, group, page, and verified activity posts.
- Post comments.
- Stories.
- Manual reports submitted by members about supported content.

Excluded content:

- Private buddy messages.
- Pre-publication administrator approval of ordinary content.
- Automatic sanctions based solely on an AI result.

## Content States

Each supported content row has a server-controlled moderation state:

- `visible`: available according to its existing privacy and audience rules.
- `quarantined`: unavailable to all normal clients, including its author, pending administrator review.

Only the service role through reviewed server operations may change this state. Clients cannot set, clear, or bypass quarantine. Existing audience, ownership, blocking, group, and expiry rules remain in force for visible content.

## Automatic Safety Check

1. A member creates a post, comment, or story.
2. The content publishes normally under its existing visibility rules.
3. The existing asynchronous moderation worker sends the supported text and image inputs to the AI moderation service.
4. A successful safe result leaves the content visible and records the completed check.
5. A confirmed violation invokes one idempotent database operation that atomically:
   - changes the content state to `quarantined`;
   - creates or updates exactly one open moderation flag for that source row;
   - records the AI categories, score, check time, and reason for quarantine.
6. Feed, detail, comment, story, sharing, and interaction policies exclude quarantined content.

An AI timeout, unavailable service, malformed response, or internal error is not treated as a safe result or a confirmed violation. The content remains visible, the failed attempt is recorded without sensitive payloads, and the check is eligible for bounded retry. Repeated failure is surfaced operationally; it does not silently create a violation finding.

## Manual Reports

One valid manual report immediately creates an administrator-review item and triggers a priority AI recheck. The report alone does not hide the content, preventing report abuse from becoming a censorship mechanism.

- Confirmed violation: quarantine the content atomically and retain the manual report for administrator context.
- AI says safe: leave the content visible and retain the report for administrator review because AI can miss context such as bullying or misinformation.
- AI is unavailable, errors, or cannot determine: leave the content visible and retain the report for administrator review.

Duplicate reports may be grouped for display, but every reporter's audit record is retained. Report counts do not automatically quarantine content in this version.

## Administrator Decisions

The administrator dashboard presents the content snapshot, current source state, AI result, manual-report context, and relevant audit history.

- Approve quarantined content: restore it to `visible`, close the moderation flag as approved, record the administrator and timestamp, and leave the content otherwise unchanged.
- Reject quarantined content: delete the source content using the existing removal path, close the flag as removed, and retain the existing warning and strike workflow.
- Resolve a visible manual report as allowed: keep the content visible and close the report with the administrator decision recorded.
- Remove visible manually reported content: use the existing removal, warning, and strike workflow.

Every administrator action remains protected by the existing administrator allowlist. A decision must be idempotent so retries cannot add duplicate strikes or reverse a later decision.

## Data and Transaction Boundaries

The database migration will add moderation state and minimal check metadata to supported content tables, plus uniqueness and lookup support for flags. A server-only database function will own the quarantine transaction. It accepts only allowlisted source tables and validated identifiers, verifies that the source exists, and prevents duplicate open flags.

Row-level security is the enforcement boundary. Application-side filtering may improve presentation but is not trusted for safety. Public-share resolution and rendered previews must reject quarantined posts even when a previously issued share identifier exists.

## Threat Model

Trust boundaries include member-created text and media, manual reports, the AI service response, Edge Function requests, service-role database writes, and administrator decisions.

Primary abuse cases and controls:

- A client tries to clear quarantine: moderation fields are not client-writable and RLS enforces visibility.
- A user mass-reports legitimate content: one report triggers review but does not hide content.
- A forged moderation callback hides content: the worker retains shared-secret authentication and the database operation is service-only.
- Duplicate callbacks create repeated flags or sanctions: quarantine and decisions are idempotent with database uniqueness.
- AI output is malformed or manipulated: output is treated as untrusted, structurally validated, and restricted to known categories and bounded scores.
- A share link bypasses quarantine: share lookup and preview generation enforce source visibility at read time.
- An administrator decision is repudiated: actor, decision, timestamp, source, and prior state are retained in the audit trail.

## Failure Handling

- Missing or deleted source rows produce a successful no-op.
- A database quarantine failure returns an error to the worker and remains retryable; it must never create a flag without hiding the content or hide content without a flag.
- AI failures use bounded retries and operational alerts to avoid infinite request or cost loops.
- Administrator actions report partial failures as errors and rely on idempotent server operations for safe retry.

## Verification

Tests must prove:

- Visible content continues to obey all existing audience and privacy rules.
- AI-confirmed posts, comments, and stories disappear from list, detail, interaction, and share paths.
- Authors cannot read quarantined content through owner-readback policies.
- One manual report triggers an AI recheck but does not itself hide content.
- Safe, uncertain, and failed AI outcomes retain the manual report for administrator review.
- Approval restores visibility; rejection removes content and adds at most one strike.
- Private buddy messages never enter the moderation worker.
- Duplicate AI callbacks and administrator retries are idempotent.
- Non-admin and ordinary authenticated users cannot invoke privileged moderation transitions.
- Existing app RPCs, administrator workflows, and public sharing continue to work for non-quarantined content.

The change will be replayed and tested in the disposable canonical database before any separately hash-approved staging migration or function deployment. Production remains outside the staging verification workflow.
