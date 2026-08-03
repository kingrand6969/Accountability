# Private R2 media design

## Outcome

New photos stored in Cloudflare R2 remain private. The database stores an opaque
`r2://...` reference, never a permanent public URL. A signed-in viewer receives a
short-lived GET URL only after Supabase confirms that viewer may see the matching
post, story, avatar, or cover.

## Trust boundaries and abuse cases

- The mobile client is untrusted. It may request only an allow-listed media kind,
  declared MIME type, bounded byte count, and safe operation ID.
- Upload credentials remain only in Supabase Edge Function secrets.
- A media reference supplied by a client is validated and must match a visible
  database row; knowing or guessing an object key does not grant access.
- Signed GET URLs expire after 60 seconds and are never stored in Postgres.
- The R2 bucket has no public development domain and no public custom domain.
- Existing HTTPS media remains readable for backward compatibility.
- External public shares never copy a private `r2://` reference into public share
  metadata. A separately generated public share asset can be added later.

## Authorization

- Post image: the authenticated request must be able to select the post through
  the existing `can_view_post`/RLS policy.
- Story image: the authenticated request must be able to select the story through
  its existing owner/buddy/expiry RLS policy.
- Avatar or cover: the authenticated request must be able to select the exact
  reference from `public_profiles`.
- Unknown prefixes and unmatched references are denied with a generic 404.

## Client behavior

- Upload returns `r2://<object-key>`.
- Shared image components resolve private references just before display and keep
  an in-memory cache only until shortly before expiry.
- Save-to-device, My Day, and other download actions resolve the reference first.
- Legacy HTTPS URLs pass through unchanged.

## Failure behavior

- Missing R2 secrets fail closed.
- Expired signed URLs are refreshed automatically by a new authorized request.
- Permission changes take effect no later than the current 60-second URL expiry.
- Errors reveal neither object existence nor another member's relationship data.

