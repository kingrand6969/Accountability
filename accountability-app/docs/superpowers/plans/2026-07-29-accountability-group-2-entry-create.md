# AccountAbility Group 2 Entry and Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce `ENTRY-WELCOME-01`, `PROMISE-START-01`, `CREATE-HUB-01`, and `SHARE-PROOF-01` on staging while preserving authentication, optional per-user onboarding, compose/edit/media behavior, privacy boundaries, and all four Daily Proof destinations.

**Architecture:** Keep Expo Router screens as workflow coordinators and extract only deterministic view models/policies that can be tested without native modules. Refit the four screens using the approved Group 1 tokens, typography, brand, and primitives; retain the existing API, Supabase, R2, media, timeline, and navigation seams. Each screen has one exclusive sequential owner, followed by an integration/evidence owner who may change evidence only.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, Expo Router, TypeScript, Jest, Supabase, Cloudflare R2, `expo-image-picker`, `expo-sharing`, `expo-media-library`, `react-native-view-shot`, and EAS preview updates/APKs.

---

## Required reading and pinned SDK behavior

Read before changing source:

- [Expo SDK 56 reference](https://docs.expo.dev/versions/v56.0.0/)
- [Expo Sharing SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/sharing/)
- Expo ImagePicker and Router pages reached from the SDK 56 reference. At plan
  authoring time those exact links may redirect to latest documentation; do not
  infer latest-only behavior. Pin implementation to the installed SDK 56
  packages and their local TypeScript declarations.
- `docs/quality/accountability-reference-contract.md`
- `docs/quality/accountability-route-contract.md`
- `docs/quality/accountability-safety-and-ownership.md`
- `docs/superpowers/specs/2026-07-27-accountability-final-experience-design.md`
- `docs/superpowers/plans/2026-07-29-accountability-visual-rebuild-master.md`

Canonical visual source:

- `docs/references/group2/group2-approved-four-panel.png`
- Dimensions: `1121×682`
- SHA-256: `EDF6514B44A6566C17E075B1EC69F6E9BFE2A8CEEA1EF15ADE0EC06D2924CC4F`
- Full-column provenance crops (retain unchanged): ENTRY `x0 y0 w280 h682`;
  PROMISE `x280 y0 w280 h682`; CREATE `x560 y0 w280 h682`; SHARE
  `x840 y0 w281 h682`.
- App-viewport comparison crops: ENTRY `x27 y66 w236 h596`; PROMISE
  `x310 y64 w239 h598`; CREATE `x590 y64 w237 h598`; SHARE
  `x867 y64 w238 h598`. Task 2.8 overlays and difference images must consume
  these viewport crops only. They contain no phone bezel, panel title, or
  surrounding background. Use tighter rectangles only if recorded source-pixel
  inspection proves the measured app boundary and the independent auditor
  approves the replacement coordinates before comparison.

Run before implementation and again immediately before installed-device
comparison:

```powershell
$reference = 'docs/references/group2/group2-approved-four-panel.png'
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $reference).Hash
if ($actualHash -ne 'EDF6514B44A6566C17E075B1EC69F6E9BFE2A8CEEA1EF15ADE0EC06D2924CC4F') { throw "Reference hash mismatch: $actualHash" }
node -e "const sharp=require('sharp');sharp(process.argv[1]).metadata().then(m=>{if(m.width!==1121||m.height!==682)throw new Error('expected 1121x682, got '+m.width+'x'+m.height);console.log('PASS 1121x682')})" $reference
node -e "const sharp=require('sharp');const p=process.argv[1];const crops=[['ENTRY',27,66,236,596],['PROMISE',310,64,239,598],['CREATE',590,64,237,598],['SHARE',867,64,238,598]];sharp(p).metadata().then(m=>{for(const [n,x,y,w,h] of crops){if(x<0||y<0||w<1||h<1||x+w>m.width||y+h>m.height)throw new Error(n+' crop out of bounds');}console.log('PASS viewport crops in bounds: 236x596,239x598,237x598,238x598')})" $reference
```

Expected: no hash error, `PASS 1121x682`, and the exact viewport-dimension PASS
line. Any mismatch stops work.

Pinned implications:

- ImagePicker results are read as `result.canceled` plus `result.assets`; never
  assume an asset exists.
- Android may kill the app after launching the system picker. Compose and Share
  Proof must call `ImagePicker.getPendingResultAsync()` on focus/mount and feed
  a successful recovered result through the same validator as a live result.
- External sharing checks `Sharing.isAvailableAsync()` and presents an
  actionable unavailable state; it never silently reports success.
- Using the already-installed ImagePicker, Sharing, MediaLibrary, and view-shot
  modules from JavaScript is OTA-compatible. Adding/changing a config plugin,
  permission, native dependency, app identity, or runtime requires a new
  preview APK.

## Baseline facts to preserve

- `/sign-in` validates email/password, handles unconfirmed accounts by resending
  verification and forwarding the email, supports recovery and sign-up, and
  never performs its own post-login redirect.
- `/sign-up`, `/verify-email`, `/forgot-password`, legal routes, age/consent,
  birthday query propagation, and auth-provider routing are compatibility
  dependencies. They are regression-tested but not redesigned in Group 2.
- `/onboarding` first saves profile identity/area, then offers optional promises.
  Completion is stored under `onboarded:<userId>`; daily selection is stored
  under `daily-promises:<userId>`. Skip writes no timeline promises. Timeline
  creation is duplicate-resistant by normalized title.
- `/compose` preserves `photo`, `event`, `text`, and `edit` query variants;
  post editing, audience, image/video picking, PhotoEditor, tags, Memories,
  events, upload, retry/error behavior, and back navigation.
- `/win-card` preserves capture, Portrait/Square/Landscape, conditional privacy,
  Feed post, external image share, save to phone, and save to Memories.
- Private proof fields and private media references must never enter an
  externally shared attachment, message, public URL, log, or fallback bucket
  unless the user explicitly leaves the corresponding field visible and the
  approved contract permits it. Amounts are hidden by default.

## Ownership and serialization

No two implementers edit the same file concurrently. The Identity feature owner
owns Welcome and Promise (Tasks 2.1–2.2). The Social feature owner owns only
Tasks 2.3, 2.3A, 2.4, 2.5, 2.5A, and 2.6. For Task 2.3B only, Social records a
serialized handoff and the Identity/Account owner temporarily owns
`src/app/edit-profile.tsx`, `src/entry/accountDraftCleanup.ts`, and
`src/entry/accountDraftCleanup.test.ts`; Identity may import
`cleanupOwnerDrafts` and `createExpoDraftFileAdapter` from Social-owned
`composeDraft.ts` but must not modify `composeDraft.ts`. The
Integration/evidence owner owns only Tasks 2.7–2.8. Identity
records the exact changed-file list and commit after Task 2.2; Social explicitly
accepts that handoff before Task 2.3. Fresh sequential workers require written
handoff acceptance in Group 2 evidence.

### Identity feature owner — Welcome files

- `src/app/sign-in.tsx`
- `src/ui/AuthShell.tsx`
- `src/entry/welcomeContract.ts`
- `src/entry/welcomeContract.test.ts`

### Identity feature owner — Promise files

- `src/app/onboarding.tsx`
- `src/entry/promisePersistence.ts`
- `src/entry/promisePersistence.test.ts`
- `src/entry/promiseSelection.ts`
- `src/entry/promiseSelection.test.ts`

### Social feature owner — Create files

- `src/app/compose.tsx`
- `src/entry/CreateHub.tsx`
- `src/entry/createFlow.ts`
- `src/entry/createFlow.test.ts`
- `src/entry/pickerRecovery.ts`
- `src/entry/pickerRecovery.test.ts`
- `src/entry/composeDraft.ts`
- `src/entry/composeDraft.test.ts`

### Social feature owner — Share Proof files

- `src/app/win-card.tsx`
- `src/entry/proofPrivacy.ts`
- `src/entry/proofPrivacy.test.ts`
- `src/entry/proofActions.ts`
- `src/entry/proofActions.test.ts`
- `src/entry/pendingProofActions.ts`
- `src/entry/pendingProofActions.test.ts`
- `src/entry/proofExport.ts`
- `src/entry/proofExport.test.ts`

### Integration/evidence owner — final verification only

- `docs/release-evidence/2026-07-29-group2-entry-create.md`
- screenshots, recordings, UI dumps, overlays, and difference images under
  `docs/release-evidence/2026-07-29-group2-entry-create/`

The integration owner does not edit application source. `package.json`,
lockfiles, app configuration, root layouts, Group 1 shared files, APIs,
Supabase/R2 code, migrations, and functions are frozen. If a source task
discovers that one is required, stop and request an explicit serialized handoff
and plan revision.

Draft persistence is an approved serialized extension of Social's
`compose.tsx` ownership. A stronger post/Memory idempotency guarantee requiring
API/backend work is not approved here: Social freezes its files and requests a
serialized data/platform handoff and plan revision.
Draft media helpers remain in Social-owned `composeDraft.ts`. If filesystem
integration requires a helper outside declared ownership, freeze Social files
and obtain an explicit serialized handoff before editing it.

## Preservation gate before Task 2.1

- [ ] Immediately before the first Group 2 source edit, create a fresh,
  timestamped, access-controlled snapshot outside the Git root. Include ignored
  environment files; exclude only regenerable `node_modules`, `.expo`, and
  `dist`. Keep it out of cloud/sibling candidate folders unless encryption and
  access controls are proven. Do not stash, reset, clean, or create a mixed
  checkpoint.
- [ ] Record timestamp, branch, HEAD, and both commands:

```powershell
git status --porcelain=v1 --untracked-files=normal
git status --porcelain=v1 --untracked-files=all
```

Expected: both exit `0`; counts and complete app-scoped output are attached to
the Group 2 evidence. Existing unrelated changes remain untouched.

- [ ] Record branch/HEAD, `git diff --binary`, snapshot file count, and a
  complete SHA-256 manifest. Verify every included file against the full
  manifest. Expected: zero missing, extra, or mismatched files. Record the
  protected location without environment values.

- [ ] Capture the current Android staging walkthrough and database record counts
  for the test user: profile row, today's matching timeline items, posts, and
  Memories. Do not expose content or credentials in evidence.
- [ ] Run and record the canonical hash/dimension fail-fast commands above.

### Task 2.1: Refit Welcome / Sign In without changing auth transitions

**Files:**
- Create: `src/entry/welcomeContract.ts`
- Create: `src/entry/welcomeContract.test.ts`
- Modify: `src/ui/AuthShell.tsx`
- Modify: `src/app/sign-in.tsx`

- [ ] **Step 1: Write the failing pure contract test**

Define `WELCOME_ACTIONS` and `welcomeErrorState` and test:

```ts
expect(WELCOME_ACTIONS.map((action) => action.id)).toEqual([
  'login',
  'create-account',
  'forgot-password',
]);
expect(WELCOME_ACTIONS.find((action) => action.id === 'login')?.route).toBeNull();
expect(WELCOME_ACTIONS.find((action) => action.id === 'create-account')?.route).toBe('/sign-up');
expect(WELCOME_ACTIONS.find((action) => action.id === 'forgot-password')?.route)
  .toBe('/forgot-password');
expect(welcomeErrorState('', '')).toEqual({ visible: false, liveRegion: 'none' });
expect(welcomeErrorState('Bad email', '')).toEqual({
  visible: true,
  liveRegion: 'assertive',
});
```

- [ ] **Step 2: Prove red**

Run:

```powershell
npm.cmd test -- src/entry/welcomeContract.test.ts --runInBand
```

Expected: FAIL because `welcomeContract.ts` does not exist.

- [ ] **Step 3: Add the minimal pure contract and make it green**

The module contains no React, Router, Supabase, or native imports. Run the same
command; expected: `PASS`, one suite.

- [ ] **Step 4: Refit only presentation**

`AuthShell` supplies the mountain image, approved large mark, safe-area-aware
image/scrim, and cream/white bottom sheet. `sign-in.tsx` supplies the serif
welcome hierarchy, existing fields, cobalt Log in action, outlined Create an
account action, recovery link, privacy reassurance, busy state, and assertive
form error. Use Group 1 primitives/tokens where available. Do not change
`supabase.auth.signInWithPassword`, validation, unconfirmed resend, verification
params, or AuthProvider navigation.

- [ ] **Step 5: Verify behavior and large text**

Run:

```powershell
npm.cmd test -- src/entry/welcomeContract.test.ts src/auth/validation.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/sign-in.tsx src/ui/AuthShell.tsx src/entry/welcomeContract.ts src/entry/welcomeContract.test.ts
```

Expected: all tests and TypeScript pass; changed-path lint has no error. On the
installed Android candidate, test empty submit, invalid email, wrong password,
offline sign-in, unconfirmed account, successful sign-in, recovery, sign-up,
back, keyboard, 1.0× and maximum supported font scale. No field, error, primary
action, or privacy copy clips; screen remains scrollable with keyboard shown.

- [ ] **Step 6: Commit only owned files**

```powershell
git add src/app/sign-in.tsx src/ui/AuthShell.tsx src/entry/welcomeContract.ts src/entry/welcomeContract.test.ts
git commit -m "feat: refit welcome entry"
```

### Task 2.2: Refit optional Promise selection and lock its write semantics

**Files:**
- Create: `src/entry/promiseSelection.ts`
- Create: `src/entry/promiseSelection.test.ts`
- Modify: `src/entry/promisePersistence.test.ts`
- Modify only if a failing test requires it: `src/entry/promisePersistence.ts`
- Modify: `src/app/onboarding.tsx`

- [ ] **Step 1: Write selection-policy tests**

Define `togglePromiseSelection(current, id, maximum = 3)` as a pure function and
test exact add, remove, and cap behavior:

```ts
expect([...togglePromiseSelection(new Set(), 'body-run')]).toEqual(['body-run']);
expect([...togglePromiseSelection(new Set(['body-run']), 'body-run')]).toEqual([]);
expect([...togglePromiseSelection(
  new Set(['body-run', 'money-save', 'focus-work']),
  'people-call',
)]).toEqual(['body-run', 'money-save', 'focus-work']);
```

Extend persistence tests to prove:

```ts
await persistPromisesForToday(new Set(), deps, DAY);
expect(deps.createItem).not.toHaveBeenCalled();
```

and that a second identical call creates no duplicate after `listItemsForDay`
returns the first call's created rows.

Define and test `promiseCompletionWrites(userId, selected, 'skip')`:

```ts
expect(promiseCompletionWrites('u1', new Set(), 'skip')).toEqual({
  dailyKey: 'daily-promises:u1',
  dailyValue: '[]',
  onboardingKey: 'onboarded:u1',
  onboardingValue: '1',
  persistTimeline: false,
});
```

- [ ] **Step 2: Prove red**

Run:

```powershell
npm.cmd test -- src/entry/promiseSelection.test.ts src/entry/promisePersistence.test.ts --runInBand
```

Expected: selection suite fails because its module is absent; existing
persistence assertions continue to pass.

- [ ] **Step 3: Implement the pure selection helper and minimally correct persistence**

Do not create a new promise table, API, migration, or goal requirement. Existing
timeline `type`, title, local-day conversion, reminder shape, and sequential
creation stay unchanged. Re-run the focused command; expected: both suites pass.

- [ ] **Step 4: Refit the Promise step**

Use the approved serif question, “Choose up to 3” guidance, Body/Money/Focus/
People grouping, selected row state with icon plus checkbox/border, clear Start
my day and Skip for now actions, loading/error/retry treatment, and a scrollable
large-text layout. Profile setup remains the preceding step and retains name,
area/geocoder confirmation, legal links, and save behavior. Start with zero
selected promises so optional really means optional; Start stays disabled at
zero while Skip remains available.

- [ ] **Step 5: Prove per-user/offline/error behavior on device**

Test user A and user B on the same installed app. User A selection must not
populate user B's `daily-promises:<id>` or onboarding flag. Test three selected,
attempt a fourth, remove/re-add, Start twice, Skip, network loss before Start,
retry after reconnect, AsyncStorage failure, relaunch, and account switch.
Expected: at most three; no duplicate timeline write; failed persistence keeps
the user on the Promise screen with retry; Skip enters Feed without timeline
writes and attempts `daily-promises:<id> = []` then
`onboarded:<id> = 1`. If either storage write fails after timeline success or
Skip, navigation still reaches Feed for that session; relaunch may re-present
onboarding because the flag is absent, but existing-title reconciliation must
create zero duplicate timeline items. The error is recorded without claiming
the flag persisted. Zero-selection Start is disabled and performs no write;
zero-selection Skip remains enabled and follows the exact write sequence above.

- [ ] **Step 6: Verify and commit**

```powershell
npm.cmd test -- src/entry/promiseSelection.test.ts src/entry/promisePersistence.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/onboarding.tsx src/entry/promiseSelection.ts src/entry/promiseSelection.test.ts src/entry/promisePersistence.ts src/entry/promisePersistence.test.ts
git add src/app/onboarding.tsx src/entry/promiseSelection.ts src/entry/promiseSelection.test.ts src/entry/promisePersistence.ts src/entry/promisePersistence.test.ts
git commit -m "feat: refit optional daily promises"
```

Expected before commit: focused suites and TypeScript pass; no changed-path lint
error.

### Task 2.3: Lock Unified Create routing and edit preservation

**Files:**
- Create: `src/entry/createFlow.ts`
- Create: `src/entry/createFlow.test.ts`
- Modify: `src/entry/CreateHub.tsx`
- Modify: `src/app/compose.tsx`

- [ ] **Step 1: Write the failing create-flow test**

Define the five approved top-level choices and query-mode resolver:

```ts
expect(CREATE_CHOICES.map((choice) => choice.id)).toEqual([
  'post',
  'photo-video',
  'flex',
  'share-run',
  'my-day',
]);
expect(resolveComposeMode({})).toBe('hub');
expect(resolveComposeMode({ text: 'hello' })).toBe('post');
expect(resolveComposeMode({ photo: '1' })).toBe('photo');
expect(resolveComposeMode({ event: '1' })).toBe('event');
expect(resolveComposeMode({ edit: 'post-1' })).toBe('edit');
expect(resolveComposeMode({ edit: 'post-1', photo: '1' })).toBe('edit');
```

Each choice contract includes one accessible label and one destination/action;
`photo-video` opens an in-screen choice without inventing a route.
`my-day` must resolve to `/add`, never `/today`.

- [ ] **Step 2: Prove red, implement the pure resolver, prove green**

```powershell
npm.cmd test -- src/entry/createFlow.test.ts --runInBand
```

Expected before implementation: FAIL for absent module. After the minimal pure
implementation: PASS.

- [ ] **Step 3: Refit CreateHub and compose framing**

Show exactly Post, Photo/video, Flex, Share a run, and Add to My Day; include
preview, audience, and one primary Continue action. Continue advances into the
existing post/editor workflow—it does not create/upload content. Preserve edit
as direct edit mode, event/text/photo query behavior, `/win-card`, `/run`,
existing My Day destination, close/back semantics, and all existing fields.
Do not combine Post and Save into two competing primary actions.

The exact route assertion is:

```ts
expect(CREATE_CHOICES.find((choice) => choice.id === 'my-day')?.route).toBe('/add');
```

- [ ] **Step 4: Verify routing and editing**

On installed Android, open `/compose` from every existing entry point and cold
deep-link the query variants. Edit an existing own post and cancel once, then
save body/audience once. Expected: no duplicate post; original image remains;
audience persists; back returns predictably. Verify each hub row has a 44-point
target, role/label, visible focus/pressed state, non-color selected cue, and
large-text wrapping.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- src/entry/createFlow.test.ts src/feed/videoPolicy.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/compose.tsx src/entry/CreateHub.tsx src/entry/createFlow.ts src/entry/createFlow.test.ts
git add src/app/compose.tsx src/entry/CreateHub.tsx src/entry/createFlow.ts src/entry/createFlow.test.ts
git commit -m "feat: unify create entry"
```

Expected: focused tests and TypeScript pass; changed-path lint has no error.

### Task 2.3A: Persist per-user Compose drafts across interruption

This task starts only after Social records explicit acceptance of serialized
ownership for `src/app/compose.tsx`.

**Files:**
- Create: `src/entry/composeDraft.ts`
- Create: `src/entry/composeDraft.test.ts`
- Modify: `src/app/compose.tsx`

- [ ] **Step 1: Write the failing draft-contract tests**

Define versioned `ComposeDraftV1` with `draftId`, `ownerId`, `kind:
'new'|'edit'`, `editingId: string|null`, exact initiating `origin`, normalized
`queryIdentity` (`photo`, `event`, `text`, `edit`), `body`, `audience`, durable
local media descriptor, event fields, tag IDs, and `keepInMemories`. Its key is
`compose-draft:v1:<ownerId>:<kind>:<draftId>` and its per-user index key is
`compose-draft-index:v1:<ownerId>`. Test round-trip, index membership, owner
isolation, and validation.

```ts
expect(composeDraftKey('user-a', 'new', 'draft-1'))
  .toBe('compose-draft:v1:user-a:new:draft-1');
expect(parseComposeDraft(JSON.stringify(validDraft), 'user-a')).toEqual(validDraft);
expect(parseComposeDraft(JSON.stringify({ ...validDraft, ownerId: 'user-b' }), 'user-a'))
  .toBeNull();
expect(parseComposeDraft('{broken', 'user-a')).toBeNull();
```

Test precedence: `edit` wins over `event`, `photo`, and `text`; `event` wins
over `photo` and `text`; `photo` wins over `text`. Compatibility requires equal
owner, kind, `editingId`, origin, and normalized query identity. Stale or
mismatched drafts are offered separately as “Other saved draft” or ignored and
are never merged into the cold-link form.

```ts
expect(resolveDraftContext({ edit: 'p1', event: '1', photo: '1', text: 'x' }).kind)
  .toBe('edit');
expect(isCompatibleDraft(editP1Draft, contextForEditP2)).toBe(false);
expect(isCompatibleDraft(photoDraft, contextForEvent)).toBe(false);
```

Test the pure trigger policy exactly:

```ts
expect(draftEffect('field-change')).toBe('save');
expect(draftEffect('background')).toBe('save');
expect(draftEffect('process-recovery')).toBe('save');
expect(draftEffect('explicit-cancel')).toBe('clear');
expect(draftEffect('successful-post')).toBe('clear');
expect(draftEffect('successful-edit')).toBe('clear');
expect(draftEffect('hardware-back')).toBe('keep');
expect(draftEffect('upload-error')).toBe('keep');
expect(draftEffect('account-switch')).toBe('detach');
```

- [ ] **Step 2: Prove red, implement the pure schema/policy, prove green**

```powershell
npm.cmd test -- src/entry/composeDraft.test.ts --runInBand
```

Expected before implementation: FAIL for absent module. After the minimal
versioned parser/key/trigger policy: PASS.

- [ ] **Step 3: Integrate save, restore, and clear semantics**

After auth owner resolution, restore only that owner's compatible valid draft. Debounce
field-change writes; flush on background. Preserve body, audience, applicable
media/event/tags/Memories state. Back/relaunch/process death retains the draft
and next `/compose` offers Restore or Discard. Explicit Cancel/Discard and
successful post/edit clear it. Upload/post error retains it. Account switch
detaches user A state before loading user B. Corrupt/unsupported data is cleared
with a non-blocking notice. Write failure shows “Draft could not be saved” and
keeps the live form; it never claims persistence.

- [ ] **Step 4: Verify interruption matrix on installed Android**

For text, photo, video, event, tags, audience, and Memories as applicable:
background/foreground, process death, relaunch, hardware back, Restore, Discard,
successful submit, failed upload, account switch, corrupt JSON, and simulated
AsyncStorage write failure. Expected: exact applicable fields restore; success
and explicit discard clear; back/error retain; no cross-account state; corrupt
data never crashes; write failure never shows false success.

Media durability: use `expo-file-system` `Paths.document` (never `Paths.cache`)
and copy into app-private
`Paths.document/compose-drafts/<safeOwnerId>/<safeDraftId>/<sha256>.<safeExtension>`. Before path construction, accept
`ownerId` and `draftId` only as canonical UUIDs (lowercase hex plus hyphens,
maximum 36 characters) and extension only from `jpg`, `jpeg`, `png`, `heic`,
`webp`, `mp4`, `mov`; reject traversal (`..`, `/`, `\`), absolute paths, URI
schemes, Windows reserved names, control/NUL characters, Unicode separators,
empty values, overlong values, and non-allowlisted extensions. Write
`<name>.tmp`, close it, verify a nonzero expected byte count and readable bytes,
then atomically move/replace to the final path before updating draft JSON.
Copy/read/size/free-space failure preserves the prior final file and draft,
deletes the temp, and exposes a precise retry/remove-media error. Delete final
media on explicit discard, successful post/edit, and account removal; retain it
across back/background/crash. Account switch detaches without deleting.

Add adapter tests for temp→final call order, readable-byte verification,
zero-byte and size-limit rejection, insufficient-space failure, preservation of
the previous final, temp cleanup, discard/success/account-removal cleanup, and a
crash between temp write and atomic move. Add exact path-policy tests for valid
UUIDs/extensions and every traversal, reserved-name, long, empty, Unicode
separator, scheme, absolute-path, NUL/control, and invalid-extension case;
assert no rejected value reaches a filesystem adapter.

Task 2.3A must export these production signatures for the serialized deletion
handoff:

```ts
export function createExpoDraftFileAdapter(): DraftFileAdapter;
export async function cleanupOwnerDrafts(
  ownerId: string,
  files: DraftFileAdapter,
): Promise<void>;
```

`cleanupOwnerDrafts` validates the canonical UUID, enumerates only that owner's
draft index/managed directory, removes its draft JSON/index/media/temp files,
and is idempotent when entries are absent. It never derives a parent/broad path
from unchecked input.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- src/entry/composeDraft.test.ts src/entry/createFlow.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/compose.tsx src/entry/composeDraft.ts src/entry/composeDraft.test.ts
git add src/app/compose.tsx src/entry/composeDraft.ts src/entry/composeDraft.test.ts
git commit -m "feat: persist per-user compose drafts"
```

Expected: focused tests and TypeScript pass; changed-path lint has no error.

### Task 2.3B: Clean only the deleted account's Compose drafts

This is a narrow serialized handoff. Social first commits Task 2.3A, records
the exported signatures of `cleanupOwnerDrafts` and
`createExpoDraftFileAdapter`, and hands read-only consumption of those exports
to Identity/Account. Identity records acceptance before editing. Identity must
not modify `composeDraft.ts`; Social resumes ownership only after Identity's
spec review, code/security review, focused verification, and recorded handback.

**Files:**
- Create: `src/entry/accountDraftCleanup.ts`
- Create: `src/entry/accountDraftCleanup.test.ts`
- Modify: `src/app/edit-profile.tsx`
- Import without modifying: `src/entry/composeDraft.ts`

- [ ] **Step 1: Write failing production-orchestrator tests**

Create production helper `prepareAccountDeletionDraftCleanup` with injected
`getAuthenticatedUserId`, `cleanupOwnerDrafts`, and file adapter. It returns
`{ status: 'cleaned', ownerId }` or
`{ status: 'cleanup-failed', ownerId, error }`. It accepts only the canonical
authenticated lowercase UUID returned immediately after the final “Delete
forever” confirmation; it does not accept a profile/query/cached arbitrary ID.

```ts
expect(callOrder).toEqual(['get-auth-user', 'cleanup:user-a']);
expect(result).toEqual({ status: 'cleaned', ownerId: USER_A });
expect(cleanupOwnerDrafts).toHaveBeenCalledWith(USER_A, fileAdapter);
expect(cleanupOwnerDrafts).not.toHaveBeenCalledWith(USER_B, expect.anything());
```

Tests cover invalid/missing auth UUID (no cleanup and no deletion), cleanup
before account deletion, cleanup failure preventing automatic deletion,
same-owner retry, explicit continue after failure, cleanup idempotence, repeated
confirmation, and no cross-owner cleanup. Inject a second
`getAuthenticatedUserId` check at the destructive boundary and test account
switch/sign-out during cleanup, after cleanup but before deletion, and while the
cleanup-failure dialog is open before both Retry and Continue. Missing,
non-canonical, or different IDs must leave `deleteMyAccount` uncalled. Add a source contract assertion that
ordinary `onSignOut` and account-switch/AuthProvider paths never import or call
`prepareAccountDeletionDraftCleanup`, `cleanupOwnerDrafts`, or the draft file
adapter.

```ts
await attemptDelete({ authSequence: [USER_A, USER_B], cleanup: 'success' });
expect(deleteMyAccount).not.toHaveBeenCalled();
await attemptDelete({ authSequence: [USER_A, null], cleanup: 'success' });
expect(deleteMyAccount).not.toHaveBeenCalled();
await continueAfterCleanupFailure({ capturedOwnerId: USER_A, currentUserId: USER_B });
expect(deleteMyAccount).not.toHaveBeenCalled();
expect(clearPendingDeletionState).toHaveBeenCalled();
```

- [ ] **Step 2: Prove red**

```powershell
npm.cmd test -- src/entry/accountDraftCleanup.test.ts --runInBand
```

Expected: FAIL because the production helper does not exist.

- [ ] **Step 3: Implement the minimal owner-scoped orchestrator**

Validate the authenticated ID using the same canonical UUID rule as
`composeDraft.ts`, create the Expo draft adapter, and invoke
`cleanupOwnerDrafts(ownerId, adapter)`. The helper performs no sign-out,
account deletion, navigation, or cleanup for any other owner. Re-running it
after partial/successful cleanup is safe and produces the same cleaned result.

- [ ] **Step 4: Integrate only the confirmed deletion branch**

Inside the final `Delete forever` handler:

1. fetch and capture the currently authenticated canonical UUID;
2. run owner-scoped draft cleanup;
3. immediately before calling existing `deleteMyAccount()`, fetch the current
   authenticated UUID again, canonical-validate it, and require exact equality
   with `capturedOwnerId`;
4. only after that equality check, call `deleteMyAccount()`.

If cleanup fails, keep account deletion undispatched and show exactly:
`Retry cleanup`, `Continue account deletion`, and `Keep my account`.
Retry reuses the captured authenticated UUID only after rechecking it still
matches the current authenticated user. Keep cancels deletion. Continue clearly
states that this account's app-private local drafts may remain on this device;
immediately fetches and canonical-validates the current authenticated UUID,
requires exact equality with `capturedOwnerId`, and only then calls
`deleteMyAccount()` without claiming draft cleanup succeeded. It never
broadens/deletes another owner's directory. If product/security requires
guaranteed cleanup rather than this explicit continuation, stop for a revised
Data/Platform/account-deletion contract.

For the cleaned path, Retry, and Continue, a missing, invalid, signed-out, or
mismatched current UUID aborts the operation, clears deleting/pending
confirmation and failure-dialog state, calls neither cleanup for a new owner nor
`deleteMyAccount`, and requires a fresh `Delete forever` confirmation for the
currently authenticated account. The captured ID is never silently replaced.

An account-deletion API failure remains “Could not delete account”; cleanup may
already be complete and its idempotent retry is safe. Ordinary Sign out and
account switch retain/detach drafts and must never invoke deletion cleanup.

- [ ] **Step 5: Verify failure ordering and commit**

```powershell
npm.cmd test -- src/entry/accountDraftCleanup.test.ts src/entry/composeDraft.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/edit-profile.tsx src/entry/accountDraftCleanup.ts src/entry/accountDraftCleanup.test.ts
git add src/app/edit-profile.tsx src/entry/accountDraftCleanup.ts src/entry/accountDraftCleanup.test.ts
git commit -m "fix: clean deleted account compose drafts"
```

Expected: both suites and TypeScript pass; changed-path lint has zero errors.
The diff contains no `composeDraft.ts` modification. Identity records its
commit, changed-file list, test output, review results, and explicit handback to
Social before Task 2.4 begins.

### Task 2.4: Add process-death-safe picker handling without changing upload policy

**Files:**
- Create: `src/entry/pickerRecovery.ts`
- Create: `src/entry/pickerRecovery.test.ts`
- Modify: `src/app/compose.tsx`

- [ ] **Step 1: Write failing picker normalization tests**

Define `normalizePickedAsset(result, expected)` where `expected` is `'image' |
'video'`; return `{ status: 'canceled' }`, `{ status: 'invalid', message }`, or
`{ status: 'accepted', asset }`. Test canceled, empty assets, wrong media type,
missing URI, valid image, and valid video. A recovered Android result must use
this same function.

- [ ] **Step 2: Prove red and green**

```powershell
npm.cmd test -- src/entry/pickerRecovery.test.ts --runInBand
```

Expected before implementation: FAIL for absent module; after minimal pure
implementation: PASS.

- [ ] **Step 3: Integrate live and recovered results**

On mount/focus call `ImagePicker.getPendingResultAsync()` on native platforms.
Normalize it and restore the preview only when accepted. Do not upload from the
recovery callback. Preserve existing image preparation, video duration/size
policy, PhotoEditor, tags, Memories, audience, events, and editing. Permission
denial shows a settings-capable explanation; cancellation is quiet; an invalid
asset gives a retryable error; offline upload retains the draft/preview and
never falls back to public storage.

- [ ] **Step 4: Installed Android process-death test**

Enable Android Developer Options “Don't keep activities,” open Photo/video,
select an image and then a valid video, and return. Expected: app recovers
without crash, accepted asset appears once, and no upload/post occurs before the
user confirms. Repeat cancellation and denial. Disable the developer option
after capture and record device setting in evidence.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- src/entry/pickerRecovery.test.ts src/feed/videoPolicy.test.ts src/media/uploadPolicy.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/compose.tsx src/entry/pickerRecovery.ts src/entry/pickerRecovery.test.ts
git add src/app/compose.tsx src/entry/pickerRecovery.ts src/entry/pickerRecovery.test.ts
git commit -m "fix: recover interrupted create picker"
```

Expected: all focused suites and TypeScript pass; changed-path lint has no error.

### Task 2.5: Make Share Proof privacy deterministic and fail closed

**Files:**
- Create: `src/entry/proofPrivacy.ts`
- Create: `src/entry/proofPrivacy.test.ts`
- Modify: `src/app/win-card.tsx`

- [ ] **Step 1: Write the failing privacy-policy tests**

Define:

```ts
type ProofPrivacy = {
  hideLocation: boolean;
  hideRoute: boolean;
  hideAmounts: boolean;
  hideBuddyNames: boolean;
  hideBuddyPortraits: boolean;
};
```

Test `DEFAULT_PROOF_PRIVACY` has `hideAmounts: true` and that
`redactProofFields(input, privacy)` removes—not masks—location, route, amounts,
buddy names, buddy portraits, and unknown sensitive fields from external/feed
card data. Test `sanitizeProofParam` trims/collapses whitespace, limits length,
and rejects `r2://`, `file://`, Supabase/storage URLs, control characters, and
non-string arrays except their first valid scalar.

- [ ] **Step 2: Prove red, implement pure policy, prove green**

```powershell
npm.cmd test -- src/entry/proofPrivacy.test.ts --runInBand
```

Expected before implementation: FAIL for absent module. After implementation:
PASS.

- [ ] **Step 3: Apply the policy before render/capture**

Refit the polished image-led card using the approved brand mark, editorial
headline, tabular metrics, and Portrait/Square/Landscape formats. Render only
the redacted model inside the captured subtree. Expose applicable privacy
switches for location, route, amounts, buddy names, buddy portraits, and other
sensitive proof fields. Amounts start hidden. Privacy state is announced to
assistive technology and never depends on color alone. Do not place private
voice audio, private media references, raw internal identifiers, or signed URLs
in the external card.

- [ ] **Step 4: Verify privacy on installed device**

Capture every format with every sensitive field present, first defaults and then
explicit opt-in. Inspect the pixels, Android share preview, saved photo, Feed
post, and Memory. Search captured text/log evidence for:

```text
r2://
supabase
cloudflarestorage
user_id
file://
```

Expected: none occur. Default external images omit amounts and any other hidden
field. Toggle-off removes the field from pixels, not merely metadata.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- src/entry/proofPrivacy.test.ts src/media/privateMedia.test.ts src/feed/publicShare.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/win-card.tsx src/entry/proofPrivacy.ts src/entry/proofPrivacy.test.ts
git add src/app/win-card.tsx src/entry/proofPrivacy.ts src/entry/proofPrivacy.test.ts
git commit -m "feat: enforce Daily Proof privacy"
```

Expected: all focused tests and TypeScript pass; changed-path lint has no error.

### Task 2.5A: Build destination-specific allowlisted proof export DTOs

**Files:**
- Create: `src/entry/proofExport.ts`
- Create: `src/entry/proofExport.test.ts`
- Modify: `src/app/win-card.tsx`

- [ ] **Step 1: Write failing fail-closed DTO tests**

Define separate builders `buildFeedProofExport`, `buildExternalProofExport`,
`buildPhoneProofExport`, and `buildMemoryProofExport`. Each constructs a new
object from an explicit destination allowlist; it must never spread input.
The exact output allowlist is:

| Field | Feed | External | Phone | Memories | Legal opt-in |
|---|---:|---:|---:|---:|---|
| `brand` | yes | yes | yes | yes | none |
| `headline` | yes | yes | yes | yes | none |
| `format` | yes | yes | yes | yes | none |
| `metrics.workouts` | yes | yes | yes | yes | none |
| `metrics.activities` | yes | yes | yes | yes | none |
| `metrics.streakDays` | yes | yes | yes | yes | none |
| `locationLabel` | yes | yes | yes | yes | `location=true` |
| `routeImage` | yes | yes | yes | yes | `route=true`; rendered pixels only, no coordinates |
| `amountDisplay` | yes | yes | yes | yes | `amount=true`; hidden by default everywhere |
| `buddyDisplayNames` | yes | yes | yes | yes | `buddyNames=true`; hidden by default everywhere |
| `buddyPortraitImages` | yes | yes | yes | yes | `buddyPortraits=true`; hidden by default everywhere |

Feed and Memories use the same explicit opt-ins; neither inherits visibility
from the source post/Memory. External and phone permit location, rendered
route, amount, names, and portraits only after their corresponding explicit
opt-in, matching the Daily Proof contract. No other field is legal. Each builder has an exact-output equality test for
all-safe input, no opt-ins, each single legal opt-in, all legal opt-ins, and
malformed opt-ins. Tests assert both key set and values; every sensitive field
is absent by default and present only for its one legal opt-in.

Tests pass an adversarial object containing unknown top-level/nested keys,
arrays, encoded values, raw UUID/user/post IDs, `r2://`, `file://`,
`content://`, signed-query URLs, Supabase/Cloudflare hosts, percent/base64
encoded private URLs, buddy identity objects, route coordinates, and amounts.
Assert unknown keys are dropped recursively and forbidden tokens do not occur
in `JSON.stringify(output)`.

```ts
expect(Object.keys(buildExternalProofExport(adversarial, noOptIns)).sort()).toEqual([
  'brand', 'format', 'headline', 'metrics',
]);
expect(JSON.stringify(buildExternalProofExport(adversarial, noOptIns))).not.toMatch(
  /r2:|file:|content:|supabase|cloudflarestorage|X-Amz-|user_id|post_id|[0-9a-f]{8}-[0-9a-f-]{27,}/i,
);
expect(buildExternalProofExport(safeInput, { amount: true }).amountDisplay).toBe('$50');
```

The last assertion proves explicit external opt-in; the adjacent no-opt-in and
malformed-opt-in tests prove the default remains hidden.

`routeImage` and `buddyPortraitImages` cross a trusted, non-serializable
render-asset boundary. An internal module creates opaque objects branded by a
module-private `Symbol` and stores their backing values in a module-private
`WeakMap<RenderAssetHandle, ManagedBitmap>`. Handles expose no URI, path, ref,
identifier, enumerable properties, string conversion, or JSON representation.
Only the capture renderer receives the resolver capability; it resolves a
same-owner live handle to a validated app-managed `file://` bitmap under the
owned proof-render cache/document directory. Raw `file://` is rejected at every
input, DTO, export, log, metadata, error, and telemetry boundary.

Before creating a handle, copy/download the source into the managed directory
using a temp file and atomic move. Validate same owner, image MIME allowlist
(`image/jpeg`, `image/png`, `image/webp`, `image/heic`), configured maximum
bytes and pixel dimensions, successful decode, canonical managed-path
containment, and no traversal/symlink escape. A remote source is fetched only
from the explicit approved media-host allowlist. Revalidate every redirect and
reject redirects to an unapproved host; the adapter must not follow such a
redirect. Reject signed/private/storage URLs at public boundaries even when
their hostname otherwise resembles an approved host.

Create handles immediately before capture. In `finally`, and on unmount,
account switch, cancel, success, or error, revoke handles and delete managed
temporary bitmaps. Serialized DTO/share metadata/log/error/telemetry builders
omit handles and backing URIs.

Adapter tests prove handle opacity and non-serializability; only the capture
renderer can resolve a valid same-owner live handle; canonical managed-path
containment; MIME, byte-limit, dimension-limit, decode, traversal/symlink,
wrong-owner, unapproved-host, and unapproved-redirect rejection; redirect
revalidation; temp/final cleanup for success/failure/finally/unmount/switch/
cancel; forged/revoked handle rejection; portrait display order; and zero URI
or handle leakage through JSON, metadata, logs, errors, or telemetry.

- [ ] **Step 2: Prove red, implement builders, prove green**

```powershell
npm.cmd test -- src/entry/proofExport.test.ts --runInBand
```

Expected before implementation: FAIL for absent module. After minimal
allowlist-only builders and recursive scalar validation: PASS.

- [ ] **Step 3: Route every destination through its DTO**

The captured card subtree receives only the selected destination DTO, never raw
route params/stats/API objects. Feed, external share, phone, and Memory each
build independently immediately before capture/action. Reject unsafe optional
values rather than sanitizing a private URL into a plausible public string.

- [ ] **Step 4: Verify and commit**

```powershell
npm.cmd test -- src/entry/proofExport.test.ts src/entry/proofPrivacy.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/win-card.tsx src/entry/proofExport.ts src/entry/proofExport.test.ts
git add src/app/win-card.tsx src/entry/proofExport.ts src/entry/proofExport.test.ts
git commit -m "feat: allowlist Daily Proof exports"
```

Expected: focused suites and TypeScript pass; changed-path lint has no error.

### Task 2.6: Lock all four proof actions, retries, and permission states

**Files:**
- Create: `src/entry/proofActions.ts`
- Create: `src/entry/proofActions.test.ts`
- Create: `src/entry/pendingProofActions.ts`
- Create: `src/entry/pendingProofActions.test.ts`
- Modify: `src/app/win-card.tsx`

- [ ] **Step 1: Write failing action-state tests**

Define a pure action state reducer with actions `post-feed`, `share-external`,
`save-phone`, and `save-memories`. Test idle → working → success/error → retry,
UI single-flight behavior per action, and that a failed action never marks
another destination successful. Define an `ambiguous` outcome for timeout or
process interruption after dispatch. Define
`shareAvailability(platform, available)` and test web/unavailable returns an
explicit unavailable state.

Define durable per-user journal key
`pending-proof-actions:v1:<ownerId>` and schema:

```ts
type PendingProofActionV1 = {
  version: 1;
  operationId: string;
  ownerId: string;
  action: 'post-feed' | 'save-memories';
  fingerprint: string;
  dispatchedAt: string;
  expiresAt: string;
  match: {
    destination: 'posts' | 'memories';
    imageSha256: string;
    normalizedHeadline: string;
  };
};
```

The reconciliation window is exactly 15 minutes. Before dispatch, atomically
append the entry to the per-user journal; after confirmed success or explicit
user discard, clear that operation. Same fingerprint
within the window reuses the pending operation; different fingerprints remain
distinct. Same fingerprint with different action is not a collision. Expired
entries are shown as unresolved and require “Check destination” or explicit
discard; they are not automatically retried. Account switch unloads user A and
loads only user B's key. Tests cover append-before-dispatch order, exact match,
hash collision with differing headline, same fingerprint/different action,
clear-on-confirmed-success, retain-on-ambiguous, explicit discard, corrupt
journal, account switch, crash after append/before dispatch, crash after
dispatch/before response, and relaunch reconciliation inside/outside 15 minutes.
`imageSha256` is SHA-256 of captured PNG bytes; `normalizedHeadline` is trimmed,
whitespace-collapsed Unicode text; `fingerprint` is SHA-256 of UTF-8
`version|ownerId|action|imageSha256|normalizedHeadline`. A reconciliation match
requires equal destination, image hash, and normalized headline within the
15-minute timestamp window—partial matches and hash/headline collisions remain
unresolved and never auto-clear.
For `save-memories`, relaunch tests assert the entry remains unresolved both
inside and outside the window, no list result is interpreted as a match or
absence, Retry is disabled, Check Memories performs navigation only, and
Discard pending is the only local clear besides a confirmed original response.

- [ ] **Step 2: Prove red and green**

```powershell
npm.cmd test -- src/entry/proofActions.test.ts src/entry/pendingProofActions.test.ts --runInBand
```

Expected before implementation: both suites run and FAIL for absent modules;
after the minimal reducer and journal implementation both suites run and PASS.

- [ ] **Step 3: Wire exact destination semantics**

- Post to Feed: capture once, upload once, create one post, and report that
  nothing posted only on a definitive pre-dispatch failure. After ambiguous
  timeout/interruption, refresh recent own posts and match a locally recorded
  action fingerprint; show “Check Feed” and permit Retry only after absence is
  confirmed.
- Share outside app: capture an image attachment, call
  `Sharing.isAvailableAsync()`, then `Sharing.shareAsync`; unavailable/error
  remains retryable and never degrades to raw text/link.
- Save to phone: request only the existing photo permission, distinguish denial
  from failure, create one asset, and confirm only after success.
- Save to Memories: capture once, save once, and confirm only after success.
  Frozen Memories list/save APIs cannot deterministically reconcile an
  interrupted response. Ambiguous completion remains `unresolved` and Retry is
  disabled. Present exactly `Check Memories` (read-only navigation; no inferred
  match/absence and no write) or `Discard pending` (clear the local journal
  entry, then allow a new explicit save). Never promise absence. Automatic
  idempotency requires a mandatory serialized Data/Platform handoff and plan
  revision before dispatch implementation.

All action rows remain individually disabled only while their operation is in
flight, expose busy/disabled state, and have 44-point targets. Recover pending
ImagePicker results through Task 2.4's shared normalizer. Do not add a config
plugin or permission.

- [ ] **Step 4: Exercise the failure matrix on installed Android**

For each action test success, rapid double tap, capture failure, offline before
upload/save, reconnect/retry, app background/relaunch, and account switch.
Additionally test camera denial, gallery denial, media-library denial, picker
cancel, process-killed picker recovery, and sharing unavailable. Expected: no
duplicate dispatch from rapid taps in one live UI session; no false success; no
leaked prior-user preview; current card remains available for retry. Existing
APIs do not expose durable idempotency for every destination, so do not promise
exactly-once behavior across crashes. Feed may reconcile only if current post
fields support the exact image-hash/headline/time match; otherwise it uses an
unresolved/no-retry Check Feed or Discard pending flow. Memories never
auto-reconciles and follows Check Memories or Discard pending above.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- src/entry/proofActions.test.ts src/entry/pendingProofActions.test.ts src/entry/proofPrivacy.test.ts src/entry/pickerRecovery.test.ts src/feed/publicShare.test.ts src/media/uploadPolicy.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/win-card.tsx src/entry/proofActions.ts src/entry/proofActions.test.ts src/entry/pendingProofActions.ts src/entry/pendingProofActions.test.ts
git add src/app/win-card.tsx src/entry/proofActions.ts src/entry/proofActions.test.ts src/entry/pendingProofActions.ts src/entry/pendingProofActions.test.ts
git commit -m "feat: harden Daily Proof destinations"
```

Expected: focused tests and TypeScript pass; changed-path lint has no error.

### Task 2.7: Run complete Group 2 automated and route gates

**Files:**
- Create: `docs/release-evidence/2026-07-29-group2-entry-create.md`
- Do not modify application source

- [ ] **Step 1: Record fresh focused verification**

```powershell
npm.cmd test -- src/entry/welcomeContract.test.ts src/entry/promiseSelection.test.ts src/entry/promisePersistence.test.ts src/entry/createFlow.test.ts src/entry/composeDraft.test.ts src/entry/accountDraftCleanup.test.ts src/entry/pickerRecovery.test.ts src/entry/proofPrivacy.test.ts src/entry/proofExport.test.ts src/entry/proofActions.test.ts src/entry/pendingProofActions.test.ts src/auth/validation.test.ts src/feed/videoPolicy.test.ts src/feed/publicShare.test.ts src/media/uploadPolicy.test.ts src/media/privateMedia.test.ts --runInBand
npx.cmd tsc --noEmit
npx.cmd eslint src/app/sign-in.tsx src/ui/AuthShell.tsx src/app/onboarding.tsx src/app/compose.tsx src/app/win-card.tsx src/entry
```

Expected: every listed suite and TypeScript pass; changed-path lint has zero
errors. Record exact output, test counts, duration, and exit code.

- [ ] **Step 2: Run repository gates**

```powershell
npm.cmd test -- --runInBand
npm.cmd run test:update-budget
```

Expected: full Jest and update-budget tests pass. If a known baseline failure
persists unchanged, record before/after evidence and do not classify Group 2
complete until the lead accepts it under the baseline policy.

- [ ] **Step 3: Run the route/state matrix**

On the installed candidate verify signed-out `/sign-in`; `/sign-up`,
`/verify-email` with email/birthday, `/forgot-password`, legal routes; optional
`/onboarding`; `/compose` with empty/photo/event/text/edit params; `/win-card`
with and without location/amount params; successful returns to Feed; expired
session; onboarding-required account; cold launch; back fallback; background/
relaunch; and account switch.

Expected: no route is removed, no auth bypass exists, Feed remains initial
post-entry destination, query/edit state is preserved, and Add to My Day opens
`/add` (never `/today`).

- [ ] **Step 4: Record data/privacy proof**

Use two staging users. Record sanitized before/after counts and identifiers for
today's promises, created/edited posts, Feed proof post, and Memories. Verify
ordinary RLS prevents the second user from reading private proof/media. Do not
widen grants, use service-role credentials in the app, or include secrets/user
content in evidence.

### Task 2.8: Produce installed-device visual, accessibility, and release evidence

**Files:**
- Modify: `docs/release-evidence/2026-07-29-group2-entry-create.md`
- Create evidence artifacts under:
  `docs/release-evidence/2026-07-29-group2-entry-create/`
- Do not modify application source

- [ ] **Step 1: Prove staging identity before any EAS action**

```powershell
$env:APP_VARIANT = 'staging'
npx.cmd expo config --type public
```

Expected public config: `AccountAbility Staging`,
`accountabilityapp-staging`, Android/iOS
`com.awldesk.accountability.staging`, owner/project
`@kingrand/accountability-app`, and project ID
`f91c0791-4a6e-4080-88fd-5cc9a4e720bf`. Preview environment/channel/profile must
be `preview`. Run EAS only from this app directory with `EAS_NO_VCS=1`.

- [ ] **Step 2: Classify OTA versus APK**

Record the diff classification:

- JavaScript/TypeScript and bundled-image changes only, using already installed
  modules and the same runtime: eligible for a lead-approved preview OTA.
- Any plugin, native permission, native dependency, identity, runtime, or native
  asset configuration change: new `preview` internal-distribution APK required.

This plan proposes no native/config/package change and is therefore
**OTA-eligible only if the installed staging APK has the same runtime and all
listed native modules**. Do not publish/build merely because it is eligible.
Record approval, preview update/build ID, channel, exact source commit, previous
compatible update, previous staging APK build-details page, and checksum where
applicable. Never use production profile/channel.

- [ ] **Step 3: Capture reproducible installed-device comparisons**

Rerun the canonical hash/dimension commands. Preserve the four full-column
provenance crops, but generate overlay/difference inputs only from app viewport
crops ENTRY `27,66,236,596`, PROMISE `310,64,239,598`, CREATE
`590,64,237,598`, SHARE `867,64,238,598`. Assert each output's exact dimensions,
record its SHA-256, and visually prove it contains no bezel, title, or
surrounding background. Do not consume copied/rescaled/full-column references
for overlays.

Use the one agreed physical Android model. Record manufacturer/model, OS,
resolution, density, font scale, display size, theme, locale, app version,
runtime, update/build ID, timestamp, and test-user state. For each of the four
references capture:

1. approved reference;
2. actual installed candidate at the same logical viewport;
3. side-by-side;
4. 50% overlay;
5. difference image;
6. accessibility tree/UI dump;
7. complete successful interaction recording.

Do not rescale one image independently or crop away discrepancies. Record every
known difference. Functional-but-different and visual-but-broken both fail.

- [ ] **Step 4: Run accessibility and resilience gates**

At exactly `100%`, `130%`, and `200%` font scale, small and large phone profiles,
screen reader enabled, reduced motion, light/dark system setting, and keyboard
shown, verify: 44×44 targets; header/role/state/labels; focus order; assertive
errors; contrast; non-color selection; safe areas/system bars; no clipping;
scroll reachability; and no hidden primary action. Repeat empty, loading,
retryable error, offline, required permission denial, privacy/redaction, relaunch,
and account-switch states according to the reference matrix.

- [ ] **Step 5: Independent audits and product-owner gate**

The lead dispatches, sequentially:

1. spec-compliance reviewer who did not implement Group 2;
2. code-quality/security/privacy reviewer;
3. installed-device visual/accessibility auditor.

Every blocker/high or visual `FAIL` returns to the exclusive file owner and
restarts focused verification plus the relevant audit. Only independent `PASS`
for all four IDs reaches the product owner.

- [ ] **Step 6: Record rollback**

Rollback selects the recorded previous compatible preview update or reinstalls
the recorded previous preview APK. It rolls back code/assets only. It does not
delete or rewind profiles, onboarding flags, timeline promises, posts, media,
Memories, messages, runs, or finance data. Any database correction is a
forward-only compensating migration, although this group is prohibited from
creating migrations.

## Group 2 stop condition

Group 2 is complete only when:

- all four exact references have independent installed-Android `PASS`;
- sign-in and optional Promise transitions remain correct and per-user;
- promise Start is duplicate-resistant and Skip creates no timeline item;
- all Compose query/edit/audience/media/draft behaviors pass;
- Android picker process-death recovery passes without implicit upload;
- all four Share Proof destinations pass success, denial, offline, retry, and
  single-flight checks;
- privacy defaults and captured pixels pass redaction review;
- focused tests, TypeScript, changed-path lint, full Jest, update-budget, route,
  two-user RLS/private-media, large-text, accessibility, and relaunch gates pass;
- staging candidate and rollback targets are immutable and recorded; and
- the product owner approves the Group 2 evidence package.

No iOS production claim is made from Android evidence. iOS device/simulator and
platform behavior remain mandatory before any production release.
