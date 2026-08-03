# Private R2 media implementation plan

1. Change upload signing to return a private `r2://` reference and remove the
   public-base configuration.
2. Add an authenticated `media-read` Edge Function that validates the reference,
   checks row-level visibility, and returns a 60-second signed GET URL.
3. Add a client resolver and hook with expiry-aware memory caching.
4. Route core post, avatar, profile, story, memory, and My Day image reads through
   the resolver while preserving legacy HTTPS images.
5. Prevent private references from entering public share previews.
6. Add unit tests, run TypeScript/tests/security checks, then deploy only the Edge
   Functions to the linked staging project. Do not touch production.
