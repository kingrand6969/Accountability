# Unified Meta-Style Feed Design

**Date:** 2026-08-11  
**Status:** Approved design

## Goal

Replace the oversized Buddies/Discover switch with one continuous social Feed similar to Facebook. Move discovery into Menu, blend relevant suggestions into the Feed without overwhelming connection content, rename the user-facing “Encourage” action to “Cheer,” and fix the staging refresh failure at the database boundary.

## Current Problem

The Feed currently presents Buddies and Discover as a large full-width segmented control. Discover is a separate experience embedded in the Feed surface, which makes navigation visually heavy and conceptually splits what should be one timeline.

The installed staging APK also fails refresh because the client calls `personal_feed_post_ids`, while the staging database has not received the migration that creates that function. This must be fixed by deploying the required database contract, not by suppressing the error.

## Information Architecture

### Feed

The Feed has no mode switch. It contains one stable, paginated stream of:

1. the current user’s posts;
2. posts from buddies;
3. posts from followed people;
4. posts from joined groups;
5. posts from followed pages; and
6. occasional suggested public fitness content.

Suggested content is labeled **Suggested for you**. It must never visually masquerade as buddy or followed content.

### Discover

Menu gains a **Discover** destination. The Discover hub helps users find:

- people;
- groups;
- pages; and
- fitness interests or public content relevant to them.

The existing Buddies destination remains available for managing current buddy relationships. Discover is for finding new connections and communities.

## Ranking

Feed ranking is not determined solely by Cheer count. Ranking uses these signals in order:

1. relationship strength, favoring buddies and followed users;
2. freshness;
3. relevance to the user’s fitness interests, joined groups, followed pages, runs, workouts, and challenges;
4. engagement quality, with Cheers and comments providing a smaller boost; and
5. source diversity, preventing one person, group, or page from dominating the Feed.

The first implementation may use deterministic weighted tiers rather than machine learning. The result must remain explainable and testable.

Suggested posts must be limited so personal content remains dominant. A deterministic insertion policy should cap suggestions, such as no more than one suggestion in a block of connection posts, with no suggestion inserted when insufficient eligible content exists.

## Eligibility and Safety

The Feed excludes content that is:

- blocked;
- muted;
- explicitly hidden by the viewer;
- inaccessible under its audience policy;
- quarantined or not moderation-visible;
- from an unfollowed source where the item is not independently eligible as a suggestion; or
- already returned in the same pagination session.

Suggested content must be public and fitness-relevant. Existing public-content AI safety checks, manual reports, and admin review continue unchanged. Private buddy messages remain outside automated moderation.

## Cheer Wording

User-facing **Encourage** terminology becomes **Cheer** across:

- Feed actions;
- post detail actions;
- notifications and confirmation messages;
- empty, loading, and error copy where applicable; and
- accessibility labels.

Internal database names and stable API identifiers may retain existing encouragement terminology to avoid unnecessary data migration and compatibility risk.

## Data and API Design

A new staging migration provides a unified, server-side Feed RPC. The RPC:

- runs as `SECURITY INVOKER`;
- uses existing Row Level Security as the final authorization boundary;
- accepts a stable cursor and bounded page size;
- returns ranked post IDs plus source/reason metadata needed for labels;
- includes connection, group, page, and suggestion candidates;
- filters hidden and ineligible content server-side;
- prevents duplicates across a page; and
- uses deterministic tie-breaking.

The client hydrates only the returned IDs and preserves RPC order. It does not serialize large relationship lists into URLs or merge unlimited feeds on-device.

The implementation must verify and deploy all staging migrations required by the currently installed client, including the existing missing Feed RPC migration, before distributing a replacement APK.

## Failure Behavior

Core connection content and suggestions must have separate failure boundaries where practical:

- Failure to load suggestions must not prevent connection content from appearing.
- Failure of the unified core Feed query produces a clear retryable Feed error.
- Offline cached posts remain available under the existing offline behavior.
- Refresh never clears a previously visible valid Feed solely because a new request failed.
- Account changes invalidate old results and cursors.

## Client Experience

- Remove `SocialModeSelector` from the Feed.
- Feed opens directly to the unified timeline.
- Preserve My Day at the top of Feed.
- Preserve Create, reactions, Cheer, comments, share, report, hide, mute, unfollow, group/page navigation, pagination, refresh, and offline states.
- Preserve the single-visible-video lifecycle and bounded list rendering added by the performance work.
- Add Discover to Menu without changing the four primary tabs: Feed, Journey, Run, and Messages.

## Testing

Automated coverage must include:

- ranking tier order and deterministic tie-breaking;
- suggestion frequency caps;
- exclusion of blocked, muted, hidden, inaccessible, quarantined, and duplicate content;
- stable cursor pagination;
- account-switch and stale-response guards;
- suggestion failure with connection content still visible;
- refresh failure retaining existing rows;
- removal of the Feed mode selector;
- Menu navigation to Discover;
- people, group, and page discovery states;
- complete user-facing Encourage-to-Cheer wording coverage; and
- migration/RPC permissions and query boundaries.

The full Jest suite, TypeScript, lint, Android export, and staging-device smoke checks must pass before handoff.

## Rollout

1. Verify the staging Supabase project and migration state.
2. Apply the reviewed staging migrations only; never target production.
3. Verify the unified RPC as an authenticated staging user.
4. Ship the client changes in the release-like `preview` APK profile.
5. Install on the connected Android device.
6. Test refresh, pagination, suggestions, Discover, Cheer, account changes, Feed videos, and My Day.

Production deployment remains out of scope without an approved Release Control record.

