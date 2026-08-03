# Group 2 Final Share Proof Evidence

## Staging release

- Date: `2026-07-30` (Australia/Perth)
- Branch: `preview`
- Runtime: `1.0.0`
- Update group: `d908a5b3-134d-42d3-ae91-857e5bd4fc58`
- Android update: `019faf60-3e5e-7cab-8529-1d7571caa1e3`
- iOS update: `019faf60-3e5e-7cdf-9a13-b3a2e5602923`
- Dashboard: `https://expo.dev/accounts/kingrand/projects/accountability-app/updates/d908a5b3-134d-42d3-ae91-857e5bd4fc58`
- Rollback target: update group `e3a48ca3-c885-4718-bb0b-8e04a003e06c`
- Production was not changed.

## Correction

- Exported proof metrics use singular grammar at exactly one:
  `1 workout`, `1 activity`, and `1 day`.
- All four proof actions provide explicit accessibility labels, preventing
  icon-font glyphs from entering their TalkBack names.
- Privacy defaults, proof DTO allowlisting, capture paths, action journaling,
  ownership guards, and fail-closed media behavior were unchanged.

## Fresh automated verification

- Full Jest: `70 / 70` suites and `1,041 / 1,041` tests passed; snapshot passed.
- Focused red/green regression run: `122 / 122` tests passed.
- TypeScript: passed with zero diagnostics.
- Scoped ESLint for the four corrected/test files: zero errors and warnings.
- Android release update: `20.36 MiB`, below the unchanged `25 MiB` limit.

## Installed evidence

- Device: nubia NX769J, Android 16, `1116 x 2480`, density `480`.
- Folder:
  `docs/release-evidence/2026-07-29-group2-entry-create/device-NX769J/post-ota-d908a5b3`
- `share-final.png`: visibly renders `1 activity`; all format controls,
  default-hidden location privacy, and all four proof actions are visible.
- `share-final.xml`: exposes the proof as one complete image summary and the
  exact Android button names `Post to Feed`, `Share outside app`,
  `Save to phone`, and `Save to Memories`, without icon glyphs.
- `welcome-font-1.3.png` and `.xml`: authenticated Welcome/setup at 130% text;
  headings, copy, fields, and labels reflow without horizontal clipping.
- `welcome-font-2.0.png` and `.xml`: authenticated Welcome/setup at 200% text;
  the page remains vertically scrollable and form fields remain operable.
- `welcome-font-2.0-bottom.png` and `.xml`: scrolled 200% state proving the
  `Get started` action and both legal links remain reachable.
- `share-reduced-motion.png` and `.xml`: Share Proof rendered with all three
  Android animation scales set to zero; privacy and all four actions remain
  visible and reachable.
- Independent strict regression audit: `PASS`; no new visual, privacy, touch
  target, safe-area, or accessibility-label blocker found.
- Phone settings restored after testing: font scale `1.0`; window and
  transition animation scales `1.0`; animator override removed; TalkBack
  disabled; temporary keep-awake disabled.

## Evidence limitations retained

- The authenticated staging session cannot show the signed-out Welcome screen
  without signing out and potentially stranding the retained account.
- A fresh TalkBack focus-traversal recording was not retained: enabling the
  installed TalkBack service locked the device, and those lock-screen captures
  were deliberately discarded as invalid evidence. The fresh Android UI tree
  proves roles, state, bounds, and exact accessible names.
- The authenticated Welcome/setup large-text matrix is fresh. Existing
  130%/200% Share Proof captures predate only the final text/label correction;
  that correction did not change layout code.
- Platform image normalization remains explicitly `NOT PASS`; unsafe
  user/remote media continues to fail closed. The trusted bundled runner image
  is the only Share Proof hero used.
