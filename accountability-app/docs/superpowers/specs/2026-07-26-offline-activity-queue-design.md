# Offline Activity Queue Design

**Status:** Approved design  
**Date:** 2026-07-26  
**Scope:** Run, walk, and ride recordings created by the mobile app

## Purpose

No completed activity may be lost merely because the phone has no internet, the
authentication session expires, the app closes, or an upload is retried.

The app will save a completed recording on the phone before attempting a server
upload. It will then upload queued activities automatically, in order, when the
correct account is signed in and connectivity is available.

## User Experience

### Completing an activity

1. The user taps **Stop & Save**.
2. The app stops location tracking and assembles the complete activity.
3. The app writes the activity to its private local queue.
4. Only after that local write succeeds does the app clear the raw tracking
   session.
5. The result screen immediately displays **Saved on phone**.
6. The app attempts an upload when possible.

The result screen must never claim that a recording is safe until the complete
queued activity has been written successfully.

### Visible states

Each locally queued activity has one of these user-facing states:

- **Saved on phone** — the durable local write succeeded.
- **Uploading** — a server upload is in progress.
- **Waiting for internet** — the last attempt could not reach the server.
- **Sign in to upload** — no valid session exists for the activity owner.
- **Needs attention** — the record cannot be read or the server rejected it for
  a non-transient reason.
- **Synced** — the server confirmed the activity; this state may be shown
  briefly before the queue entry is removed.

The finished-activity screen shows the current state and a **Retry now** action
when retrying is meaningful. Activity history shows a small cloud-status marker
for queued activities. A compact **Uploads** panel lists pending activities and
allows retrying them.

### Sharing

The app may generate and externally share a polished run image or video from
the local activity without waiting for the server. The receiving application
may still require its own internet connection.

**Post to Feed** remains unavailable until the activity has synced, so the feed
cannot reference a missing server activity.

## Local Data Model

Every completed recording receives a client-generated UUID before it enters the
queue. That UUID is also the server activity ID and is the idempotency key for
all retries.

Each queue entry contains:

- schema version;
- client activity UUID;
- owner user UUID;
- activity type (`run`, `walk`, or `ride`);
- distance in metres;
- duration in seconds;
- full route points;
- recording start time;
- local creation time;
- queue status;
- attempt count;
- next permitted retry time;
- last error category and safe user-facing message.

Queue entries are stored separately in the existing private application storage,
with a small ordered index referencing them. A queue-entry write must finish
before the index advertises the entry. Startup recovery also scans for completed
entries missing from the index so an interruption between those two writes
cannot orphan an activity.

The operating system's application sandbox protects these records from other
ordinary applications. This design does not claim separate application-level
encryption beyond the phone's own device and application-storage protection.

## Account Isolation

A queue entry is permanently bound to the user UUID that created it.

- It may upload only while that same account is authenticated.
- Signing out does not delete it.
- Signing back into the same account resumes automatic uploading.
- Signing into a different account pauses it and never changes its owner.
- The upload request and database row both use the bound owner UUID.
- Server row-level security remains the final authorization boundary.

The Uploads panel may show that another account has pending items on the device,
but it must not reveal their route, time, distance, or other private details to
the currently signed-in account.

## Synchronization

The queue is drained oldest first and only one activity is uploaded at a time.
Synchronization is triggered:

- immediately after a local save;
- when connectivity returns while the app is running;
- when the app launches;
- when the app returns to the foreground;
- when the correct account signs in or refreshes its session;
- when the user taps **Retry now**.

If the app is fully closed, the design does not promise background execution;
the next launch or foreground event resumes synchronization.

Transient failures use capped exponential backoff with jitter. Manual retry may
request an immediate attempt but cannot start a second concurrent upload for the
same entry.

The server insert uses the client activity UUID. A repeated insert with that UUID
is treated as success only after the app confirms that the existing server row
belongs to the same authenticated owner and represents the queued activity.
This prevents duplicate activities when an acknowledgment is lost.

The local queue entry is removed only after server confirmation. Raw GPS points
are cleared after the durable queue write, not after the network upload.

## Error Handling

Authentication lookup errors must be preserved and classified. The app must not
replace a network error with **Not signed in**.

Error categories and behavior:

- **Offline or transient network failure:** retain the entry, show **Waiting for
  internet**, and retry automatically.
- **Expired or missing session:** retain the entry, show **Sign in to upload**,
  and resume only for the original owner.
- **Transient server failure:** retain the entry and retry with backoff.
- **Permanent validation or authorization failure:** retain the entry, show
  **Needs attention**, and make diagnostic details available without exposing
  secrets.
- **Unreadable local entry:** never silently delete it; quarantine it as
  **Needs attention** for recovery and diagnostics.
- **Local-storage write failure:** do not clear the raw tracking points and do
  not claim **Saved on phone**.

Uninstalling the app or explicitly clearing its storage can remove queued
activities. The interface should explain that limitation wherever pending
uploads are managed.

## Component Boundaries

### Activity queue store

Owns durable queue reads and writes, ordering, schema validation, recovery, and
owner-filtered summaries. It does not perform network requests.

### Activity synchronizer

Observes connectivity, app lifecycle, and authentication state. It drains the
queue one entry at a time, applies retry policy, and reports status changes.

### Activity server API

Accepts a complete activity with a caller-provided UUID. It preserves real
authentication and network errors and implements idempotent confirmation.

### Run tracker

Owns live GPS collection. On completion it hands an immutable activity to the
queue store, waits for the durable local result, and then clears the raw
tracking session.

### Upload status UI

Reads queue summaries and exposes statuses and safe retry actions. It cannot
change activity ownership or mutate recorded activity data.

## Database Compatibility

The existing `activities.id` UUID is used as the client-generated idempotency
key. If the current schema or policies do not permit authenticated clients to
provide this ID, a reviewed migration and matching row-level-security policy
change are required before release.

No user post, picture, story, or unrelated activity data is modified by queue
synchronization or rollback.

## Required Tests

### Unit tests

- Durable queue entry and index write ordering.
- Recovery of an entry written before its index update.
- Queue ordering and single-flight synchronization.
- Account ownership filtering.
- Exponential backoff and manual retry.
- Authentication, network, server, validation, and storage error
  classification.
- Idempotent retry after a lost server acknowledgment.
- Local data is removed only after confirmed success.

### Integration tests

- Finish an activity in airplane mode.
- Force-close and reopen with a pending activity.
- Record several offline activities and preserve their order.
- Restore connectivity and upload automatically.
- Tap retry repeatedly without creating duplicates.
- Sign out and sign into the same account.
- Sign into a different account and verify isolation.
- Expire the session during a recording.
- Simulate a server outage and a normal application update.
- Confirm matching route, time, distance, type, and owner on phone and server.

### Sharing tests

- Generate every supported share-card background from a queued activity.
- Share an image or video from local data.
- Navigate back, select a different background, regenerate, and share again.
- Confirm **Post to Feed** becomes available only after synchronization.

## Release Requirements

This feature is a release blocker for reliable activity recording.

Before production approval:

- all required tests pass on Android staging;
- at least one real outdoor activity is saved offline, survives a force-close,
  and syncs after connectivity returns;
- server inspection confirms no duplicate row;
- an account-switch test confirms no cross-account upload or data disclosure;
- the release-control entry includes test evidence and screenshots for every
  visible state;
- rollback preserves the `activities` table and all user content.

