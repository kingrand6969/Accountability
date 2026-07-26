# Run Selfie Beauty and Media Lifecycle Design

**Status:** Approved design  
**Date:** 2026-07-26  
**Scope:** Run-share selfie capture, natural beauty processing, color looks,
media persistence, and repeat sharing

## Purpose

AccountAbility will help users create flattering, polished run selfies without
changing who they look like. Selfie processing stays on the phone, facial
geometry is never modified, and media is persisted only when the user explicitly
saves or posts it.

This feature is separate from the offline activity queue. Activity data remains
protected until it syncs, while selfie media follows the temporary-storage rules
in this document.

## Experience Overview

The approved experience is a hybrid:

1. The camera shows a lightweight live natural-beauty preview.
2. Beauty starts at a subtle 20% strength.
3. The user takes the selfie.
4. A higher-quality post-capture pass produces the final preview.
5. The user may adjust the main Beauty strength or open the natural advanced
   controls.
6. Pressing and holding **Original** temporarily reveals the untouched capture.
7. The user chooses **Save to Memories**, **Save to phone**, **Share**, or
   **Post to Feed**.

The original remains untouched throughout editing. Canceling discards temporary
media after confirmation when appropriate.

## Natural Beauty Controls

The main **Beauty** slider controls a balanced combination of:

- skin smoothing;
- blemish softening;
- shine reduction;
- under-eye brightening;
- gentle tone and lighting improvement.

Advanced controls expose those adjustments individually. Every adjustment has a
conservative upper limit so the result cannot become plastic or unrecognizable.
The default strength is 20%; the user may reduce it to zero.

The feature does not provide:

- face slimming;
- eye enlargement;
- nose, jaw, lip, or cheek reshaping;
- body reshaping;
- age transformation;
- identity-changing effects.

If more than one face is detected, the same conservative natural treatment is
applied to each detected face. The app does not identify people or retain face
landmarks. If no face is detected, Beauty is unavailable but ordinary color
looks remain usable.

## Color Looks

Color looks are separate from face-aware Beauty processing. The initial curated
collection is:

- **Natural** — minimal correction;
- **Clean** — bright, crisp, and the default color look;
- **Golden Hour** — warm outdoor achievement tone;
- **Energy** — stronger sports color and contrast;
- **Night Run** — controlled glare and deeper evening tones;
- **Focus B&W** — high-contrast monochrome.

Users can swipe these looks in the live camera and adjust their strength after
capture. Beauty and color strength are independent.

## Camera and Processing Architecture

### Camera session

The current image-picker launch flow is replaced on the selfie path by an
embedded camera experience capable of delivering preview frames. The existing
gallery/photo and map-only paths remain available.

The camera layer owns permissions, front-camera capture, orientation, flash,
timer, and a stable preview stream. It exposes captured media to the processor
without deciding where media is saved.

### Live preview processor

The live processor performs on-device face detection and a lightweight preview
treatment. It must not upload frames, face crops, face landmarks, or biometric
templates.

The target is a responsive preview of at least 24 frames per second on supported
staging devices. If live processing is unavailable or would make the camera
unstable, the app falls back to an unprocessed live preview and applies the
approved beauty treatment after capture. Capture must never fail merely because
the live effect is unavailable.

### Final image processor

After capture, a higher-quality local pass applies the selected Beauty and color
parameters to the full-resolution source. It creates a flattened export suitable
for the run card, Memories, phone gallery, sharing, or Feed.

The processor preserves orientation and supports the existing Original, Story
9:16, Feed 4:5, Square 1:1, and Wide 16:9 run-card formats.

### Settings model

The editing state contains:

- Beauty enabled;
- overall Beauty strength;
- smoothing, blemish, shine, under-eye, and lighting strengths;
- selected color look and strength;
- selected run-card format and media fit;
- source orientation.

These settings are local editing data. Face landmarks and intermediate frames
are never written to persistent storage.

## Media Lifecycle

Media uses the application cache while the editor is open. The cache may contain
the original capture, processed preview, and current export.

### Save to Memories

The final flattened image is uploaded or copied into the existing Memories
system. After Memories confirms persistence, temporary originals and exports are
removed unless another selected action still needs them.

### Save to phone

The final flattened image is written to the device photo library after the
required permission is granted. Once the photo library confirms the write,
temporary media is removed unless another selected action still needs it.

### Share

The app creates a temporary final export and opens the native share panel. When
the sharing operation returns, the app releases the share lock and schedules the
temporary export for cleanup. Sharing alone does not save the selfie to
Memories, the phone gallery, cloud storage, or Feed.

Because another application may still be reading the file immediately after the
share panel closes, normal cleanup may be delayed briefly. Startup maintenance
removes abandoned share exports older than 24 hours so crashes cannot accumulate
cache files.

### Post to Feed

The final image is persisted only after its Feed upload and post creation
succeed. For verified run cards, **Post to Feed** remains unavailable until the
associated activity has synced. After server confirmation, temporary media is
removed.

### Back, cancel, and app interruption

Navigating back within the editor may regenerate a different background without
losing the active temporary source. Leaving the run-share flow without choosing
Memories, phone, or Feed deletes the temporary media. If the app is interrupted,
startup cache maintenance removes abandoned media after the 24-hour recovery
window.

The offline activity queue does not delete or depend on selfie cache files.

## Repeat Sharing Requirement

The existing second-share failure is a prerequisite bug fix. The one-share-at-a-
time lock must be released in every completion path, including success, cancel,
fallback text sharing, and error.

The user must be able to:

1. share a generated image;
2. return to the run-share editor;
3. change the photo, background, filter, format, fit, or privacy setting;
4. regenerate the card;
5. share again.

Every share must capture the current preview rather than reusing a stale export.
Rapid double taps during one active share remain blocked.

## Privacy and Trust

- All face-aware processing occurs on the device.
- No face geometry, landmarks, embeddings, or biometric templates are uploaded
  or persisted.
- The interface clearly indicates when Beauty is active and its strength.
- **Original** provides an immediate, honest comparison.
- Beauty can be disabled completely.
- The app never claims an image is saved unless the selected destination
  confirms it.
- Location start and end points remain hidden by default on shared run cards.

## Accessibility

- Beauty and color controls have text labels in addition to icons.
- Slider values are announced as percentages.
- Every touch target is at least 44 by 44 logical pixels.
- Original comparison is available as an accessible toggle as well as
  press-and-hold.
- Processing, saving, and sharing states are announced without trapping focus.
- The flow remains operable when live preview processing falls back.

## Build and Release Impact

Live face-aware preview requires native camera and frame-processing capability,
so this cannot be delivered only as an over-the-air JavaScript update. A new
Android development/preview build is required, followed by an iOS build before
production parity is claimed.

The chosen native camera and processing dependencies must be verified against
the project's Expo SDK and React Native versions during implementation planning.
If a dependency cannot meet the privacy, performance, maintenance, and build
compatibility requirements, post-capture processing is the safe fallback.

## Required Tests

### Beauty behavior

- Beauty defaults to 20% and can be reduced to zero.
- Original comparison shows the untouched capture.
- Each natural control changes only its documented property.
- No facial geometry is modified at any setting.
- Multiple faces receive the same conservative treatment.
- No-face capture disables Beauty without blocking color looks.
- Front-camera orientation and mirroring are correct in preview and export.

### Performance and resilience

- Live preview remains responsive on the minimum supported Android device.
- Automatic fallback works when frame processing is unsupported or too slow.
- Camera permission denial offers a gallery fallback.
- Low memory, backgrounding, and rotation do not lose the active editor state.
- Processing failure preserves the original and offers retry or Original.

### Media lifecycle

- Cancel removes temporary media.
- Save to Memories persists only the final image.
- Save to phone persists only after photo-library confirmation.
- Share-only leaves no durable Memories, gallery, Feed, or cloud copy.
- Feed media persists only after upload and post confirmation.
- Startup cleanup removes abandoned cache exports older than 24 hours.
- Activity queue data survives every media cleanup path.

### Share regression

- First share opens the native share panel.
- Returning and sharing again opens it a second time.
- Changing the background before the second share exports the new background.
- Changing photo, format, crop/fit, filter, and privacy settings exports the
  current preview.
- Canceling the first native share still permits a second share.
- Rapid double taps create only one active share operation.

### Visual QA

- Compare 0%, 20%, 50%, and maximum Beauty on varied skin tones and ages.
- Test bright sun, indoor light, low light, sweat, facial hair, glasses, hats,
  and motion.
- Confirm smoothing retains natural skin texture.
- Confirm run stats, route, logo, and text remain sharp in every export ratio.

## Release Requirements

Before production approval:

- the repeat-share regression is fixed and covered by a focused test;
- Android staging includes a new native build;
- privacy verification confirms there are no face-data network requests or
  persistent landmarks;
- performance and fallback evidence is recorded on representative devices;
- temporary-media cleanup is demonstrated;
- before-and-after screenshots cover varied people and lighting without facial
  reshaping;
- the release-control entry documents the native dependency and rollback plan.

