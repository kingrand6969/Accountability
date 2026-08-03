# AccountAbility Task 2.5B Proof Image Normalization Plan

> **Status:** Conditional proposal. ADR-2.5B cannot be accepted until both
> feasibility gates in Session 2.5B-0 pass. This document is a
> staging-only implementation plan. It does not authorize implementation,
> secrets changes, deployment, migration, production access, or production
> mutation.

## Problem and non-negotiable boundary

`proofExport.ts` correctly treats render images as opaque capabilities, but the
Expo SDK 56 JavaScript client cannot prove all of the following before a local
or remote image is decoded: bounded bytes, trusted magic MIME, bounded pixel
dimensions, redirect control, and DNS-rebinding resistance. Calling
`Image.getSize`, rendering an untrusted URI, or following a signed/public URL in
the app is not an acceptable substitute because decoding or network resolution
may already have happened.

Task 2.5B supplies one trusted normalization boundary. Only its canonical output
may become a `RenderAssetHandle`. Failure leaves the approved bundled Daily
Proof background in place; it never falls back to the untrusted source.

## ADR-2.5B: Authenticated staging Edge Function

### Status

Proposed, contingent on the deployed-runtime codec/probe gate and physical
Expo SDK 56 client-transport gate. Failure of either gate stops this plan and
requires a revised native-module ADR; it does not authorize an approximation.

### Context

The app is Expo SDK 56 and presently uses Supabase Edge Functions
(`media-read`, `r2-sign`) and private `r2://` references. The Group 2 plan freezes
native configuration and aims to remain OTA-compatible. Local picker images and
authorized buddy-avatar media need the same canonical-image contract. Route
media is a desired future input, but the current repository has no identified
route-image persistence/authorization contract.

### Options considered

| Option | Advantages | Costs and failure modes |
|---|---|---|
| Native Expo module/config plugin | Mature platform metadata probes can inspect bounds before full decode; local files need not leave the device; no server codec cost | Android and iOS implementations plus a config plugin; new preview APK/runtime; two security implementations; remote fetch still needs a hardened networking layer; higher rollback and long-term maintenance cost |
| Authenticated staging Supabase Edge Function | Reuses the repo's current auth, R2, and function deployment model; one normalization policy for Android/iOS; JS client remains OTA-compatible; remote private references can be read without exposing signed URLs | Bounded upload of local images; server CPU/memory/rate limits; a vetted Deno-compatible codec/probe must pass a feasibility gate; unavailable offline |

### Decision

Subject to both feasibility gates, use a new authenticated **staging-only** Edge Function named
`proof-image-normalize`, with a thin client adapter behind the existing
`RenderAssetAdapter` port.

The function accepts exactly one of:

1. `multipart/form-data` containing one local picker image; or
2. JSON containing an opaque `r2://avatars/...` reference plus the declared
   purpose `buddy-portrait`.

It does **not** accept an arbitrary HTTP(S) URL, signed URL, host, bucket, object
key, redirect target, or client-supplied storage endpoint. This is the primary
SSRF and DNS-rebinding defense. A legacy buddy value available only as an
HTTP(S) URL remains unavailable and the bundled background is used until its
upstream owner stores an authorized opaque reference.

**Route images remain unavailable in Task 2.5B.** Inspection found no identified
route-image/ref column, table/view, or RLS authorization contract in the current
repository, and `win-card.tsx` currently supplies no route handle. A future
route-image task must first name its table/view, opaque-ref column,
ownership/visibility rule, and RLS tests. Neither a key prefix nor a user ID
embedded in an R2 key is authorization.

The function constructs the R2 endpoint from staging secrets and the
strictly-parsed opaque reference, signs the GET itself, uses
`redirect: "manual"`, and rejects every 3xx response. No response Location is
followed. The configured R2 hostname must be the exact expected
`<account-id>.r2.cloudflarestorage.com` host derived from staging secrets.
Callers cannot supply or influence a hostname, scheme, port, path prefix, DNS
name, IP address, or redirect. The function does not claim that a separate DNS
lookup followed by ordinary Deno `fetch` pins an address; that would contain a
TOCTOU gap. DNS rebinding is instead removed from caller control by the single
immutable Cloudflare R2 origin and `redirect: "manual"`. If a future source
requires a caller-influenced host, it must use a separately audited egress proxy
that resolves once, pins the connection, and blocks private/reserved IPv4/IPv6.

### Consequences

- The same policy protects local and authorized buddy images. Route images stay
  hidden until a separately approved storage/authorization contract exists.
- Existing staging APKs can receive the client integration through an OTA when
  runtime compatibility is proven.
- Local custom images require connectivity. Offline, timeout, 401, 403, 404,
  413, 415, 422, 429, and 5xx all fail closed to the bundled background with a
  retryable, non-sensitive message.
- A function rollback is independent of an OTA rollback, so both immutable
  rollback identifiers must be recorded.
- If the codec feasibility gate fails, do not substitute `Image.getSize`,
  browser/React Native rendering, an unrestricted fetch, or a different
  unreviewed image library. Re-open this ADR and implement the native option.

## Canonical normalization contract

Input limits are server policy, not trusted client metadata:

- maximum request body: 12 MiB;
- maximum source pixels: 16,000,000;
- maximum width or height: 8,192;
- accepted magic formats: JPEG, PNG, and WebP only;
- HEIC/HEIF is initially unavailable unless the chosen probe/codec proves
  bounded metadata parsing and deterministic decoding in the deployed Supabase
  runtime;
- animation is rejected rather than silently choosing a frame;
- malformed, truncated, polyglot, mismatched declared MIME, excessive metadata,
  and unsupported color/profile inputs are rejected.

The function must:

1. Reject missing/invalid JWTs using `supabase.auth.getUser()`.
2. Apply a per-user rate/concurrency limit before expensive work.
3. Check `Content-Length` when present, then read the body stream chunk by chunk,
   aborting immediately when the byte cap is exceeded. Never call
   `arrayBuffer()`, `formData()`, or a decoder on an unbounded body.
4. For an R2 reference, accept only `r2://avatars/<owner UUID>/<safe filename>`.
   Authorize it through a narrow audited
   `authorize_proof_avatar(p_owner uuid, p_ref text)` RPC. The
   `security definer` function fixes `search_path`, derives the caller only from
   `auth.uid()`, returns one boolean (no row/ref), and requires:
   - the owner is the caller, or a normalized `(least(caller, owner),
     greatest(caller, owner))` row exists in `buddy_links`;
   - no `buddy_blocks` row exists in either direction; and
   - the exact owner's `profiles.avatar_url` equals the requested reference.
   Revoke execution from `public`/`anon` and grant only `authenticated`.
   Authenticated discovery visibility alone is not buddy authorization. Pending,
   declined, unlinked, mismatched, nonexistent, or removed relationships fail
   closed. Tests must also apply the existing block/unlink semantics so a
   relationship that is no longer usable cannot authorize a fresh derivative.
   Never accept an object merely because its R2 key is syntactically valid.
5. Fetch only the constructed staging R2 object with `redirect: "manual"`;
   enforce the same streaming byte cap on the response.
6. Detect format from magic bytes. Declared MIME and extension are hints only
   and must agree with magic when present.
7. Run a bounds-only parser before decoder allocation. Reject invalid,
   animated, over-dimension, or over-pixel inputs before full decode.
8. Decode only after those gates using the exact audited/pinned codec selected
   by the feasibility spike. Strip EXIF, GPS, comments, thumbnails, ICC/XMP,
   filenames, and all other metadata; correct orientation during rendering.
9. Resize without upscaling to fit 2,048 × 2,048, correct orientation, composite
   alpha onto the pinned background color `#FFFFFF`, convert to sRGB, and encode
   one JPEG at quality 85 with explicitly pinned 4:2:0 subsampling,
   non-progressive mode, optimized-coding setting, metadata/profile stripping,
   codec version, and codec build checksum. The canonical output cap is 4 MiB
   and 4,194,304 pixels. A result above either cap is rejected. Golden fixture
   hashes must be stable within the exact deployed codec build; cross-build
   byte identity is not assumed.
10. Compute SHA-256 over the exact output bytes and return:
    - binary `image/jpeg` body;
    - `Content-Length`;
    - `Digest: sha-256=<base64 digest>`;
    - `X-Proof-Width`, `X-Proof-Height`, and `X-Proof-Bytes`;
    - `X-Proof-Codec-Version`;
    - `Cache-Control: private, no-store`;
    - `X-Content-Type-Options: nosniff`;
    - one opaque request ID safe for support correlation.
    No source URL/ref, user ID, signed URL, storage key, or exception text is
    returned or logged.

## Ownership and planned files

Implementation requires a serialized exception to the Group 2 freeze. No two
owners edit these files concurrently.

**Platform/function owner**

- Create `supabase/functions/proof-image-normalize/index.ts`
- Create `supabase/functions/proof-image-normalize/policy.ts`
- Create `supabase/functions/proof-image-normalize/policy.test.ts`
- Create `supabase/functions/proof-image-normalize/imageProbe.ts`
- Create `supabase/functions/proof-image-normalize/imageProbe.test.ts`
- Create one reviewed migration defining an atomic
  `claim_proof_normalize_slot`/`release_proof_normalize_slot` lease contract
  only if no existing caller-scoped limiter can be safely reused. Apply it to
  staging only under the deployment guard below; production application remains
  prohibited.
- Create one reviewed migration for the narrow
  `authorize_proof_avatar(uuid,text)` RPC above, with explicit grants and
  two-user link/block tests. Apply it to staging only under the same guard.
- Create `scripts/deploy-proof-image-normalize-staging.ps1`, which accepts only
  the pinned staging project ref and rejects the production ref.

**Social/client owner, only after function contract approval**

- Modify `src/entry/proofExport.ts`
- Modify `src/entry/proofExport.test.ts`
- Create `src/entry/proofImageNormalizeAdapter.ts`
- Create `src/entry/proofImageNormalizeAdapter.test.ts`
- Modify `src/app/win-card.tsx`

Package files, app identity, native permissions, config plugins, production
profiles/channels, and production functions remain frozen.

## Sequential implementation sessions

### Session 2.5B-0 — Mandatory feasibility ADR prerequisites

This session is a separate decision prerequisite, not implementation
authorization for Sessions 2.5B-1 through 2.5B-4.

- Pin an exact Deno/Supabase-compatible image probe and codec version, dependency
  URL/source, lock/checksum, license, supported formats, and known CVEs.
- Prove locally, under production-like memory limits, that bounds are parsed
  before decoder allocation for JPEG, PNG, and WebP.
- Run a decompression-bomb corpus, malformed/truncated corpus, animated WebP,
  polyglots, oversized dimensions, EXIF/GPS/orientation fixtures, and codec
  timeout/memory tests.
- Deploy a throwaway, non-routable staging feasibility function and record
  Supabase-runtime CPU, peak memory, timeout, output hashes, and cleanup. Delete
  it before any product function work.
- Prove on the physical Android staging device which exact installed Expo SDK 56
  API can perform authenticated POST upload, access response headers, cancel,
  and save/read a response with hard caps. Test both upload and download,
  partial-file cleanup, abort, and preservation of `Content-Length`, `Digest`,
  and `X-Proof-*` headers through the Supabase gateway.
- If the only available API buffers request/response data, record bounded
  buffering explicitly and prove the combined source + canonical response +
  codec/client overhead stays inside the approved peak-memory budget. Do not
  describe it as streaming.

**Gate:** an independent security reviewer must confirm that the probe does not
fully decode and the decoder is not invoked until byte/dimension checks pass.
The reviewer must also confirm the exact deployed dependency artifacts and
measured budgets, and the exact client API/peak-memory behavior. Failure of
either proof stops the Edge Function plan and reopens the native option.

### Session 2.5B-1 — Pure server policy and authorization

- Write failing tests for strict source unions, opaque-ref grammar, exact
  `buddy_links` plus avatar-equality authorization, exact staging R2 host
  construction, redirect rejection,
  immutable-origin enforcement, streaming caps, magic MIME, dimensions,
  animation, and sanitized errors/logs.
- Implement pure policy/probe helpers before wiring `Deno.serve`.
- Add tests proving client-controlled URL/host/key/signed URL fields are ignored
  or rejected, including encoded, mixed-case, IPv4 variants, IPv6, localhost,
  metadata-service, credential/userinfo, and redirect payloads. Assert that the
  only fetch target is the function-constructed staging Cloudflare R2 origin.

**Outcome:** deterministic policy tests pass without network or secrets.

### Session 2.5B-2 — Function adapter

- Add JWT authentication, confirmed-buddy/self plus exact-avatar authorization,
  rate/concurrency limiting, bounded stream readers, fixed-origin R2 fetch,
  normalization, integrity headers, cancellation, and generic failure
  responses.
- Use a single-part streaming multipart parser pinned in the feasibility lock.
  Enforce: total body ≤12 MiB, exactly one file part, at most two total parts,
  per-part headers ≤8 KiB, field/filename ≤128 bytes, no nested multipart, no
  transfer encoding, and no filesystem spill. Abort on the first violation.
- The distributed limiter is an atomic database lease acquired before body
  buffering or codec allocation. Pin its per-user window, maximum active leases,
  lease expiry, idempotent release, stale-lease cleanup, and fail-closed database
  error behavior in tests. A process-local counter is not sufficient.
- Unit-test with fake streams and fetch; integration-test against an isolated
  local/staging fixture bucket containing only synthetic media.
- Abort upstream fetch and codec work when the caller disconnects or deadlines
  expire.

**Outcome:** the function contract passes locally; nothing is deployed.

### Session 2.5B-3 — Client adapter

- Upload local picker bytes only after explicit selection. Send buddy media
  only as the authorized opaque avatar reference and purpose. Do not send or
  render route media in this task.
- Use only the exact physical-device-proven transport from Session 2.5B-0. Save
  the canonical response into a random temporary file under the app-managed
  proof-render root with a client-side 4 MiB cap. Describe the path as streaming
  only if the feasibility evidence proves it.
- Verify status, exactly one well-formed `Content-Length`, `Digest`,
  `X-Proof-Width`, `X-Proof-Height`, `X-Proof-Bytes`, and codec-version header;
  reject missing, duplicate, conflicting, malformed, out-of-range, or
  unsupported values. Verify `image/jpeg`, JPEG magic, exact bytes, managed-root
  canonical path, and SHA-256 using a constant-time digest comparison before
  atomic move. Width/height headers are authenticated server assertions, not
  independent client dimension verification; the client only range-checks
  them and does not invoke an unsafe decoder to re-probe.
- Return the existing `StagedRenderAsset`; only then may
  `createProofRenderAssetStore` mint an opaque owner/store-bound handle.
- On cancellation, account switch, screen unmount, timeout, mismatch, or any
  failure, delete temp/final artifacts and use the bundled background.
- Never persist input refs/URLs in export DTOs, drafts, logs, alerts, telemetry,
  or pending actions. Revoke owner handles on account change and all handles on
  screen disposal.

**Outcome:** local and authorized buddy-avatar sources yield the same canonical,
integrity-checked managed JPEG; route remains unavailable; all failures remain
private and fail closed.

### Session 2.5B-4 — Staging deployment and evidence

Deployment occurs only after separate approval and fresh backup/status evidence.

1. Use only `scripts/deploy-proof-image-normalize-staging.ps1`. It requires the
   exact pinned staging project ref, compares it with the linked ref, rejects
   the recorded production ref, and refuses a missing/unknown ref.
2. The function fails closed at runtime unless the project ref parsed from
   `SUPABASE_URL` equals `EXPECTED_STAGING_PROJECT_REF`, the configured R2
   account/bucket equal explicit staging allowlist values, and
   `PROOF_IMAGE_NORMALIZE_ENABLED === "1"`. Add a negative production-ref test
   that returns bounded generic 503 before auth, R2, or codec work.
3. Deploy only `proof-image-normalize` to staging with JWT verification enabled.
4. Record immutable function version/deployment ID, source hash, dependency
   lock/checksums, staging project ref, and prior function state.
5. Publish an OTA only to the approved staging preview channel after runtime
   compatibility and update-budget gates pass. Record update ID, runtime,
   branch/commit, and rollback update.
6. Exercise synthetic local and buddy fixtures; never use production
   data or credentials.

## Required tests and evidence gates

Before Task 2.5B can pass:

- Pure server policy/probe tests pass.
- Function integration tests prove auth denial; unlinked/pending/declined/
  blocked/removed cross-user denial; confirmed-buddy and self success; exact
  avatar-ref equality; mismatched/nonexistent ref denial; RLS denial;
  body/response streaming caps; manual redirect rejection;
  immutable fixed-host enforcement; proof that no client-influenced DNS/host
  input reaches fetch; timeout/cancellation; magic mismatch;
  bounds-before-decode; decompression bombs; animation; metadata stripping;
  canonical dimensions, exact encoder settings, same-build golden hashes,
  encoding, and digest.
- Client tests prove digest/header/magic/path verification, atomic move,
  owner/store isolation, account switch, revoke/dispose cleanup, offline,
  timeout, retry, malformed server response, partial download, and zero
  untrusted fallback rendering.
- Existing `proofExport`, `proofPrivacy`, compose, media, auth, RLS, TypeScript,
  changed-path lint, and full Jest gates remain green.
- Staging abuse test confirms 401/403/404/413/415/422/429/5xx return bounded
  generic bodies with no refs, keys, tokens, signed URLs, user IDs, source
  metadata, stack traces, or codec errors.
- Physical Android evidence proves selected images render only after successful
  normalization and every denial/offline/failure uses the bundled background.
  Account A's avatar must not render for unlinked Account B; a confirmed
  relationship may render it only after the explicit buddy-portrait privacy
  opt-in, and unlink/block immediately denies new normalization.
- Staging isolation tests prove an unknown or production project ref, wrong R2
  bucket/account, or disabled kill switch returns generic 503 before any source
  is read. Any limiter migration records its exact staging application,
  forward-only disable/reversal procedure, and negative production guard.
- An independent spec reviewer, security/privacy reviewer, and installed-device
  auditor must each return PASS before Group 2 completion.

## Rollback and incident behavior

- **Client rollback:** select the recorded previous compatible staging preview
  update, or reinstall the previous recorded staging APK if runtime changed
  elsewhere. No native change is planned here.
- **Function rollback:** first set the tested staging-only kill switch
  `PROOF_IMAGE_NORMALIZE_ENABLED=0`; the function must then return bounded
  generic 503 before auth, R2, request-body, or codec work. Verify the installed
  client fallback. Then redeploy the recorded previous immutable function
  source. If no previous version exists, run the pinned staging wrapper around
  the exact supported `supabase functions delete proof-image-normalize
  --project-ref <staging-ref>` operation, confirm 404, and preserve deployment
  and removal evidence. Restore by deploying the recorded source hash through
  the same guarded wrapper and rerunning smoke/security tests.
- **Data:** normalized output is response-only and private/no-store; no durable
  source or derivative row is required. Rollback does not delete or rewrite
  profiles, posts, runs, Memories, media, or user content.
- **Security incident:** disable the staging function first, revoke only
  staging-scoped secrets if exposure is suspected, preserve sanitized request
  IDs and deployment evidence, and do not rotate or touch production secrets as
  part of a staging rollback.

## Completion condition

Task 2.5B is complete only when the canonical image contract is enforced at the
server and re-verified by the client, all three independent reviews pass, the
installed staging Android evidence passes, and immutable dual rollback targets
are recorded. Until then, local and buddy proof images remain fail-closed and
the approved bundled background is the only renderable fallback. Route images
remain hidden until a separate schema/RLS plan passes.
