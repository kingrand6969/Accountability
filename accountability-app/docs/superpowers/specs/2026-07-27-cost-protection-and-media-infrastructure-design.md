# Cost Protection and Media Infrastructure Design

Date: 2026-07-27  
Status: Approved

## Decisions

- Free and Pro members both see the same clearly labelled, scrollable native ads.
- Ads never autoplay, interrupt, cover content, or appear in Journal, Finance details,
  Messages, active runs, onboarding, creation flows, or an empty Feed.
- Pro value comes from stronger features, not ad removal.
- Public media is delivered from Cloudflare R2. Existing Supabase media URLs remain
  valid; no user content is deleted or rewritten during this change.
- Large media bytes do not pass through Supabase.
- Production releases prefer store builds. EAS Update is reserved for approved
  recovery releases so routine updates do not create uncontrolled MAU and bandwidth
  charges.
- Upload authorization, type, size, ownership, quota, and rate limits are enforced
  server-side. Client checks are usability improvements, not security boundaries.

## Media flow

1. The signed-in client compresses an image before upload.
2. The `r2-sign` Edge Function verifies the session, kind, content type, declared
   size, per-user rate limit, and permitted object key.
3. The client uploads directly to a five-minute, content-type-bound R2 URL.
4. Only the resulting public media URL is stored in Postgres.
5. If R2 is temporarily unavailable, an explicitly monitored compatibility fallback
   may use the existing Supabase bucket. Fallback use must be counted so it cannot
   silently become the normal path.
6. Old Supabase URLs and new R2 URLs render together.

## Abuse and runaway-cost controls

- Images: JPEG/PNG only, compressed before upload, 12 MB absolute server ceiling.
- Upload URL requests: per-user rolling-hour limit.
- Posts, comments, likes, chat, stories, reports, Memories, and search: database
  write-rate limits.
- Text: database length limits.
- Memories: server trusts the stored object size, never a client-supplied size.
- R2 keys are scoped to the authenticated user.
- Signed uploads expire after five minutes and bind the approved content type.
- Stable avatar and cover objects are overwritten; post objects use unique names.
- Failed or unauthorized sign attempts never expose R2 credentials.
- Billing alerts and provider spend caps remain enabled.

## Expo update cost control

- Production runtime compatibility is tied to the native app version.
- Normal feature releases use reviewed store builds.
- OTA updates are used only for an approved recovery release.
- Release evidence records bundle size and estimated download impact.
- Large images, videos, and catalogs are hosted remotely, not embedded in update
  bundles.

## Cost and Capacity dashboard

The admin dashboard shows:

- active users;
- database size;
- media storage;
- daily uploads and rejected uploads;
- Supabase egress;
- R2 storage and operations;
- Expo updated users and update bandwidth;
- estimated monthly infrastructure cost;
- ad and subscription revenue when integrations are available;
- cost per active user;
- threshold status at 50%, 75%, 90%, and 100%.

Provider credentials remain server-side. If a provider metric is not connected, the
dashboard says `Not connected`; it never displays a fabricated zero.

## Data safety

- No migration deletes, moves, or invalidates existing user media.
- Switching storage providers affects new uploads first.
- Existing content is migrated only through a separate, reversible, audited release.
- Quota exhaustion blocks only new uploads. Existing user content stays accessible.
- Downgrading or losing Pro never deletes content.

## Verification

- Unit tests cover R2 signing requests, upload compatibility, content-type and size
  rejection, rate-limit handling, stable/unique object paths, and fallback behavior.
- Database migrations are reviewed for RLS, `security definer` search paths, indexes,
  and safe application to existing rows.
- Staging verifies old Supabase media and new R2 media in the same Feed.
- A cost gate blocks production approval when required provider limits or credentials
  are unknown.
