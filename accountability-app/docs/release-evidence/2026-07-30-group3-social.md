# Group 3 Social Release Evidence

## Task 3.0 — Prechange preservation gate

- Timestamp: `2026-07-30 04:01:23` Australia/Perth
- Branch: `codex/offline-beauty-safety`
- HEAD: `da2b9ca6660c72790c8942b1dce2693cff522335`
- App: `C:\Users\KinGrand\New folder\accountability-app`
- Snapshot:
  `C:\Users\KinGrand\AccountAbility-Safe-Snapshots\accountability-app-group3-prechange-20260730-040123`
- Normal app-scoped porcelain entries: `230`
- All-untracked app-scoped porcelain entries: `1692`
- Complete manifest entries: `2123`
- Full SHA-256 verification mismatches: `0`
- Binary working-tree patch: `working-tree.patch`, `1,326,862` bytes
- Route manifest entries: `63`
- Regenerable exclusions: `node_modules`, `.expo`, `dist`, and Git metadata
- Environment files are confined to the access-controlled local snapshot and
  are not printed or copied into release evidence.

### Access control

The snapshot has inheritance removed and full control limited to the local
AccountAbility Windows account, `SYSTEM`, and local administrators. The first
verification attempt correctly failed after the account name was resolved
incorrectly; Windows elevation restored the exact local user access. The
binary patch and complete manifest were then regenerated, every manifest entry
was re-hashed, and the final result was zero mismatches.

### Staging identity

Fresh command:

```powershell
$env:APP_VARIANT = 'staging'
npx.cmd expo config --type public --json
```

Verified public fields:

- Name: `AccountAbility Staging`
- Scheme: `accountabilityapp-staging`
- Android package: `com.awldesk.accountability.staging`
- iOS bundle ID: `com.awldesk.accountability.staging`
- Owner: `kingrand`
- EAS project ID: `f91c0791-4a6e-4080-88fd-5cc9a4e720bf`
- Runtime policy: app version
- Updates project: `https://u.expo.dev/f91c0791-4a6e-4080-88fd-5cc9a4e720bf`

No EAS publish/build, Supabase mutation, R2 mutation, production command, or
application-source edit occurred during Task 3.0.

### Rollback

- Previous staging APK build:
  `55bc82fc-e1fd-45a5-8a0b-618ff84e0160`
- Permanent build page:
  `https://expo.dev/accounts/kingrand/projects/accountability-app/builds/55bc82fc-e1fd-45a5-8a0b-618ff84e0160`
- Previous compatible preview update group:
  `d908a5b3-134d-42d3-ae91-857e5bd4fc58`
- Previous update page:
  `https://expo.dev/accounts/kingrand/projects/accountability-app/updates/d908a5b3-134d-42d3-ae91-857e5bd4fc58`

Rollback is limited to selecting the preserved source, compatible preview
update, or previous staging APK. It must never delete, rewind, or rewrite user
posts, media, messages, runs, finance records, or other user data.

### Route manifest

The generated manifest is stored at:

`docs/release-evidence/2026-07-30-group3-social/route-manifest.txt`

It contains `63` current file routes, including `/`, `/post/[id]`, `/groups`,
`/group/[id]`, `/group-new`, `/pages`, `/page/[id]`, `/page-new`,
`/story/[userId]`, `/notifications`, `/search`, `/compose`, `/win-card`, and
`/share/[id]`.

## Task 3.0 result

`PASS` — the exact Group 3 prechange state is recoverable and fully
hash-verified, staging identity is proven, rollback targets are recorded, the
current route manifest is attached, and production remains untouched.
