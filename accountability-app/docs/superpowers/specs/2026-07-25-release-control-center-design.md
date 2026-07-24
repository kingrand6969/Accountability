# AccountAbility Release Control Center Design

Date: 2026-07-25  
Status: Approved for implementation planning  
Owner: AccountAbility founder  

## Purpose

The Release Control Center gives the founder one safe place to review, approve, stage, monitor, stop, and recover application releases. Codex and Claude may prepare release candidates, evidence, and fixes, but neither agent may approve or publish a release.

The system must make this guarantee:

> No production release occurs until the founder approves one exact, immutable candidate, and a code rollback never rewinds user accounts, posts, pictures, messages, or other live user content.

## Fixed Decisions

- Only the founder may approve, stop, or recover a release.
- Approval automatically starts the release after required checks pass.
- Releases begin on the founder's registered test devices.
- Healthy releases progress through staged percentages before reaching everyone.
- Every release has a selectable history and recovery path.
- The immediately previous safe release is the recommended recovery target.
- Destructive database changes are permanently blocked from the normal release path.
- Visual changes require before-and-after screenshots.
- Backend-only changes may replace screenshots with relevant test evidence.
- GitHub is the private, immutable source-of-truth for code versions.
- Cloudflare hosts the admin interface.
- Supabase stores release-control state, evidence metadata, approvals, and audit events.
- Expo EAS performs mobile builds, updates, and supported rollouts.

## System Boundaries

### Code and configuration

GitHub stores every candidate as an immutable commit. Approval is tied to:

- Commit SHA
- Release manifest hash
- App version and runtime version
- Migration set
- Assets
- Deployment workflow version
- Evidence bundle

Any change to these inputs creates a new candidate and invalidates previous checks and approval.

### User data

Supabase production data and object storage remain live during code recovery. Routine rollback must not restore an earlier database snapshot.

Protected user data includes:

- Accounts and profiles
- Posts, comments, and reactions
- Pictures and other uploaded files
- Messages
- Timeline, goals, reminders, finance, and activity records
- Moderation, support, consent, and audit records

Point-in-time or full-database restoration is a separate disaster-recovery procedure. It is never shown as a normal release rollback because it can cause downtime and remove user activity created after the selected restore point.

## Architecture

```text
Codex or Claude
      |
      | prepares candidate, manifest, explanation, screenshots, and tests
      v
Private GitHub repository
      |
      | locks exact commit and runs untrusted pre-release checks
      v
Release Control Center in Cloudflare
      |
      | founder reviews complete release package
      v
Supabase approval function
      |
      | verifies founder, MFA, candidate integrity, checks, and deployment lock
      v
GitHub Actions production workflow
      |
      +--> Expo EAS update/build/store rollout
      +--> Supabase forward-only migrations
      +--> post-deploy verification and monitoring
      |
      v
Signed status callback to Supabase
      |
      v
Dashboard monitoring, staged promotion, stop, or recovery
```

The browser never receives GitHub, Expo, Supabase service-role, store, signing, or monitoring credentials. Production actions execute only in server-side functions and protected deployment workflows.

## Release Classes and Recovery Contracts

### Expo code update

- Used only when compatible with the installed runtime.
- Supports staged EAS Update percentages.
- Recovery may re-publish the previous safe update or return clients to the embedded build.
- Only one rollout may run on a production branch at a time.

Dashboard label: **Fast code rollback**

### Native store binary

- Used for native dependency, permission, runtime, or binary changes.
- Uses Apple and Google phased or staged release controls.
- An installed binary cannot be instantly removed from devices.
- Risky functionality requires a tested server-controlled feature switch.

Dashboard label: **Phased recovery; installed binary remains**

### Database migration

- Normal migrations must be additive and backward-compatible.
- Removals use an expand-and-contract sequence across separate releases.
- Application recovery uses forward fixes, not database rewind.
- Production schema changes must come from committed migration files only.

Dashboard label: **Forward-fix only; user data retained**

### Configuration or feature-switch change

- Uses versioned, audited configuration.
- Supports rapid restore to a known safe configuration.
- Security-critical changes require the full release gate.

Dashboard label: **Fast configuration restore**

### Mixed release

- Inherits the slowest and least reversible recovery contract of its parts.
- Dashboard displays each component separately.

## Required Release Package

Every candidate requires:

1. Plain-English summary
2. What changed and why
3. Exact version, runtime version, commit SHA, and manifest hash
4. Features, screens, APIs, tables, storage buckets, and workflows affected
5. Before-and-after screenshots for visual changes
6. Test evidence for backend-only changes
7. Security and privacy impact
8. Tests performed and complete results
9. Database and storage impact
10. Known risks and expected blast radius
11. Rollout plan and health thresholds
12. Rollback or forward-fix instructions
13. Backup verification where data is affected
14. Emergency feature-switch verification for store releases
15. Named evidence source, device, build, timestamp, and candidate hash
16. User-facing release notes

The release remains blocked when any required item is missing, stale, failed, or tied to a different candidate.

## Permanent Database Safety Policy

The normal approval path rejects migrations containing unapproved destructive patterns, including:

- Dropping or truncating tables
- Dropping or renaming populated columns
- Destructive type conversions
- Unbounded deletes or updates
- Storage-object deletion
- Disabling row-level security
- Weakening ownership or admin checks

An exceptional destructive change requires a separate future procedure with:

- Verified restorable backup
- Tested recovery rehearsal
- Exact affected-row and storage counts
- Maintenance window
- Strong warning explaining possible loss
- A separate typed destructive confirmation

That exceptional procedure is outside the first implementation.

## Dashboard Information Architecture

The primary release page shows, in order:

1. Readiness state and blockers
2. Change class and recovery promise
3. Risk, blast radius, first audience, and production lock
4. Plain-English decision summary
5. Evidence and before/after comparison
6. Data protection and migration impact
7. Rollout plan and health baseline
8. Required actions and next step
9. Owner approval control

Sections:

- **Decision** — concise summary and owner action
- **Evidence** — screenshots, tests, scans, devices, and provenance
- **Safety** — security, privacy, database, backup, and feature-switch checks
- **Rollout** — audiences, percentages, health windows, and progress
- **Recovery** — stop, disable feature, restore safe code, and runbook
- **Audit** — append-only event history and export

Routine and emergency actions must not share equal visual weight. **Approve & release** is the primary action only when ready. **Stop rollout** and **Restore safe version** appear in a clearly separated recovery area.

## Interaction States

| State | What the founder sees | Allowed actions |
|---|---|---|
| Empty | Explanation and “Prepare first candidate” guidance | View submission instructions |
| Draft | Missing release-package items | Edit or cancel candidate |
| Checking | Individual check progress and elapsed time | Cancel checks |
| Blocked | Exact failures, owner, and remediation | Re-run eligible checks |
| Stale | Candidate or evidence changed after checks | Create refreshed candidate |
| Ready | All checks passed and approval requirements shown | Rehearse release |
| Rehearsing | Simulation progress without user exposure | Stop rehearsal |
| Awaiting approval | Locked manifest and final consequences | Approve or reject |
| Deploying | Current protected workflow step | Stop if safely cancellable |
| Testing owner devices | Device adoption and health comparison | Stop or continue after minimum window |
| Rolling out | Current percentage, health, and next stage | Stop rollout |
| Paused | Pause reason and preserved evidence | Resume only after checks |
| Failed | Failure cause and recommended recovery | Retry, disable feature, or recover |
| Recovering | Target version and recovery progress | No conflicting release actions |
| Recovered | Restored code/config and retained user data statement | Verify recovery |
| Stable | Final health comparison and completed audit record | Close release |

Loading, empty, error, success, and partial-data states must use text and icons in addition to color.

## Approval Ceremony

Approval is valid only when:

- Founder has a current authenticated admin session
- MFA assurance is current
- Candidate and evidence hashes still match
- All required checks pass
- Release rehearsal passes
- Founder-device test passes
- No production release or recovery holds the deployment lock
- Monitoring is operational

The founder must:

1. Re-authenticate
2. Complete MFA
3. Review the final consequences
4. Type the exact release version
5. Confirm **Approve & release**

Approval expires after 30 minutes. A candidate change, workflow change, failed check, disabled monitoring source, or deployment-lock conflict invalidates approval.

## Staged Rollout

Default Expo code-update path:

1. Founder registered devices
2. 5% of eligible users
3. 25%
4. 100%

Each stage has a minimum health window. Promotion occurs automatically only if every threshold remains healthy compared with the pre-release baseline.

Initial health signals:

- App start success
- JavaScript and native crash-free sessions
- Authentication success
- Critical screen load success
- Post and picture upload success
- API and Edge Function error rates
- Update adoption

Health telemetry must exclude post bodies, message bodies, pictures, passwords, access tokens, exact locations, and direct identity fields. Installation identifiers must be pseudonymous.

Automatic stop conditions include:

- Security check or secret exposure
- Crash-free rate below the configured threshold
- Material authentication regression
- Material upload regression
- Data-integrity error
- Monitoring unavailable during an active stage

Only one production rollout or recovery may run at a time.

## Recovery

### Stop rollout

Prevents additional users from receiving the candidate. It preserves logs and evidence and does not automatically change users already on the candidate.

### Disable affected feature

Uses a server-controlled feature switch for the smallest safe blast-radius reduction.

### Restore safe code

Defaults to the immediately previous stable compatible release. The founder may choose another compatible release from history. The dashboard must explain compatibility and consequences before recovery.

### Dashboard unavailable

A sealed break-glass runbook provides a restricted GitHub/Expo recovery workflow. It requires founder authentication and MFA, records a recovery audit event when connectivity returns, and cannot perform database restoration.

## Audit and Notifications

Audit events are append-only and include:

- Actor and assurance level
- Release and candidate identifiers
- Previous and new state
- Check and evidence hashes
- Timestamp
- Reason
- Deployment provider identifiers
- Error and recovery outcomes

The dashboard provides exportable incident and release records.

Email notifications are sent for:

- Candidate ready
- Candidate invalidated
- Release approved or rejected
- Rollout advanced, paused, stopped, failed, or completed
- Recovery started or completed
- Emergency feature switch used

Notification links open the dashboard but never approve an action directly.

## Security Controls

- Owner allowlist enforced server-side
- Supabase RLS plus security-definer functions with fixed search paths
- MFA required for approval, stop, recovery, and emergency feature switches
- Short-lived server-issued action nonce
- CSRF-resistant same-origin action requests
- Strict input schemas and idempotency keys
- Rate limits on sensitive actions
- Content Security Policy, frame denial, no-referrer, MIME sniffing protection, and restrictive permissions policy
- Secrets stored only in server-side secret stores
- GitHub workflow permissions set to minimum required access
- Pinned GitHub Action versions
- Dependency, license, and secret scans
- Signed provider callbacks with replay protection
- Immutable candidate identifiers and append-only audit log
- Production action logs must not contain credentials or user content

## Accessibility and Responsive Behavior

- Full keyboard operation with visible focus
- Semantic landmarks, headings, tables, status messages, and dialogs
- Screen-reader announcements for state changes
- Minimum 44-by-44-pixel action targets
- Body text contrast of at least 4.5:1
- Status never communicated by color alone
- Reduced-motion support
- Desktop uses a primary review workspace and secondary decision rail
- Tablet keeps the decision summary before evidence
- Mobile presents readiness, blockers, and next action first; evidence follows in a linear review sequence
- Destructive confirmation dialogs trap focus and return focus correctly

## Error Handling

- Provider timeouts move the release to a recoverable paused state.
- Repeated callbacks are idempotent.
- Conflicting state transitions are rejected.
- A lost browser connection does not cancel a server-side release.
- Unknown deployment outcome is shown as **Needs verification**, never **Failed** or **Succeeded** without evidence.
- Partial monitoring data blocks automatic promotion.
- A failed database migration stops later deployment steps and starts the documented forward-fix procedure.
- Failed notification delivery does not alter release state but appears in the audit record.

## Testing Requirements

### Unit and policy tests

- State-machine transition rules
- Owner-only authorization
- MFA and approval expiry
- Manifest and evidence invalidation
- Destructive migration detection
- Idempotency and replay protection
- Release lock
- Recovery compatibility

### Integration tests

- GitHub candidate submission and protected workflow trigger
- Signed provider callbacks
- Expo rehearsal, rollout edit, stop, and rollback
- Supabase forward-only migration path
- Monitoring baseline and automatic stop
- Email notification delivery
- Break-glass audit reconciliation

### Interface tests

- Every interaction state
- Keyboard and screen-reader operation
- Mobile, tablet, and desktop layouts
- Long summaries and large evidence bundles
- Slow, partial, and failed network responses
- Confirmation cancellation and session expiry

### Release rehearsal

A rehearsal uses the exact candidate and production workflow definition but stops before production exposure. It must prove credentials, permissions, build compatibility, migration dry-run behavior, monitoring availability, callbacks, and recovery commands.

## Rollout of the Release Control Center

The control center itself ships in stages:

1. Read-only release history and candidate review
2. Automated checks and evidence validation
3. Rehearsal and owner-device deployment
4. Owner approval with MFA
5. Staged production rollout and automatic stop
6. Code/config recovery and break-glass workflow
7. Store-binary orchestration

Until a stage is verified, its production action remains unavailable.

## What Already Exists

- Supabase admin allowlist and server-side admin assertion
- Admin RPC pattern using authenticated user JWTs
- Moderation audit display pattern
- Expo EAS development, preview, and production channels
- Supabase migration history
- Cloudflare Pages deployment for the admin dashboard
- Admin Content Security Policy and no-referrer setting

## Not in Initial Scope

- Multi-admin or two-person approval
- Whole-database restore button
- Destructive database migration approval
- Arbitrary command execution from the browser
- Direct agent access to production credentials
- Multiple simultaneous production rollouts
- Automatic store submission without the founder's configured store accounts
- User-facing public release-note portal

## Success Criteria

The design is successful when:

- An agent cannot publish without founder approval.
- Approval always identifies one exact candidate.
- Missing, failed, stale, or unverifiable evidence blocks release.
- The founder understands impact and recovery within one review page.
- A safe candidate reaches founder devices before other users.
- Unhealthy rollout stops automatically.
- Code recovery preserves current user data.
- Every sensitive action is attributable and auditable.
- The system remains recoverable when the dashboard is unavailable.
