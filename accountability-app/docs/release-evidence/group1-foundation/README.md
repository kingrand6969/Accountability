# Group 1 Device Evidence Manifest

## Final physical-device audit — 2026-07-29 10:48 +08:00

Status: **PASS**

The installed staging APK and preview refinements were independently audited on
physical Android device NX769J. Production remained untouched: there was no
store submission and no production OTA update.

Final staging preview update:

- Group: `27bfc3c5-23b9-4258-b3f4-4bfb078c438e`
- Runtime: `1.0.0`
- Scope: large-text navigation/reflow and Finance bottom-scroll clearance

Final evidence:

- Five distinct routes at 130% and 200%:
  `device-NX769J/post-ota-65a44ec9/`
- Corrected Finance 130% top tabs:
  `device-NX769J/post-ota-e4bd79c5/font-1.3-finance.png`
- TalkBack UI tree with canonical navigation names:
  `device-NX769J/post-ota-e4bd79c5/talkback-ui-tree.xml`
- Finance 200% bottom-scroll clearance:
  `device-NX769J/post-ota-27bfc3c5/font-2.0-finance-bottom-scroll.png`

The final independent audit passed status-bar contrast, selected-state
visibility, route navigation, TalkBack names/roles/state, WCAG 2.2 resize-text
and reflow checks, and operability around floating/fixed navigation. After
testing, the phone was restored to font scale `1.0`, TalkBack off, and
stay-awake off.

> Historical notes below describe the earlier blocked state and are retained as
> an audit trail. This final PASS section supersedes them.

Last updated after successful staging build: 2026-07-29 09:22:56 +08:00
(Australia/Perth)

Status: **BLOCKED_DEVICE — staging APK finished; physical Android
installation/ADB connection required**

Release classification: **new staging APK required**. The approved launcher,
adaptive, monochrome, and splash assets are native resources. An OTA cannot
deliver the complete Group 1 outcome and is not a completion path.

Finished staging build:

- ID: `4dd4e12f-b880-4741-a7c5-5cd5ca05ec19`
- Android preview/internal, SDK 56, version `1.0.0`, build 1
- Status: `FINISHED`; artifact present
- Completed: `2026-07-29T01:16:34.060Z`
- Expires: 2026-08-12
- Install:
  <https://expo.dev/accounts/kingrand/projects/accountability-app/builds/4dd4e12f-b880-4741-a7c5-5cd5ca05ec19>

Production was untouched; no store submission or OTA update was performed.

This directory is reserved for independently captured installed-staging
evidence. Do not substitute simulator, generated, or design-reference images
for actual-device evidence.

For each required anchor, capture:

1. approved reference;
2. installed-device actual;
3. side-by-side comparison;
4. 50% overlay;
5. difference image;
6. device profile, app identity, route, state, timestamp, and auditor result.

Expected filenames:

- `brand-mark-reference.png`, `brand-mark-actual.png`,
  `brand-mark-side-by-side.png`, `brand-mark-overlay-50.png`,
  `brand-mark-difference.png`
- `foundation-gallery-reference.png`, `foundation-gallery-actual.png`,
  `foundation-gallery-side-by-side.png`, `foundation-gallery-overlay-50.png`,
  `foundation-gallery-difference.png`
- `tab-bar-reference.png`, `tab-bar-actual.png`,
  `tab-bar-side-by-side.png`, `tab-bar-overlay-50.png`,
  `tab-bar-difference.png`

Approved target output:

`C:\Users\KinGrand\.codex\generated_images\019fa8d8-4e01-7fb0-86b0-dca741695df2\call_7a6i52w9jic4lv2S8lHh8tgm.png`

No actual-device screenshot existed when this manifest was last updated. The
user must install the finished staging APK on a physical Android device and
connect ADB before capture begins.

The installed-device session must additionally record:

- protected cold-link authentication/resume and expired-session behavior;
- public-share browser handoff and return;
- TalkBack announcements and focus behavior for sheets, tabs, Journey, selected
  and disabled states;
- 130% and 200% font scales;
- small and large Android safe-area profiles; and
- reduced-motion behavior.
