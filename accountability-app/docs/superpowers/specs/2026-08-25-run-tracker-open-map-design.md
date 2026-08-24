# Run Tracker Open Map Design

**Date:** 2026-08-25
**Status:** Approved
**Approved direction:** L — Open Map
**Visual reference:** [approved-open-map.png](../../references/run-tracker/approved-open-map.png)

## Goal

Replace the idle Run tracker’s card-heavy dashboard with the approved Open Map composition: the map remains the screen, the primary metrics sit directly over its lower edge, and the action remains obvious without hiding the user’s location context.

This is a presentation change to the existing tracker. GPS recording, permissions, recovery, offline persistence, owner isolation, Run/Walk/Ride selection, stop-and-save, and post-run sharing must retain their existing behavior.

## Approved visual hierarchy

From top to bottom:

1. Safe-area status space over the dark map.
2. A 48-point circular Back control, centered text tabs for Run/Walk/Ride, and a 48-point circular options control.
3. An uninterrupted interactive dark map with the existing lime current-position marker.
4. Right-edge map controls that remain clear of the primary metrics.
5. A compact truthful readiness chip floating above the metric band.
6. Two primary metrics on the same horizontal band:
   - left: distance with `km` suffix and `DISTANCE` label;
   - right: elapsed time with `TIME` label.
7. A single subtle divider followed by Pace and Calories as secondary information.
8. A wide rounded neon-lime Start action above the bottom safe area.

There is no conventional bottom sheet, no opaque metric card, no avatar/title row, no card stack, no industrial HUD treatment, and no visible tab bar while the Run tracker is focused.

## Product truth

- `formatKm` remains the source of the distance string; idle renders `0.00`.
- `formatDuration` remains the source of elapsed time; idle renders `00:00`.
- `formatPace` remains the source of pace; unavailable pace renders `--:--`.
- `estimateCalories` remains the source of the estimated calorie value.
- The readiness chip must not claim that GPS is ready before the app has evidence:
  - when a permitted last-known position exists: `Ready to run` / `GPS available`;
  - otherwise: `Ready to run` / `GPS checks when you start`.
- Start continues to request/check native location permission and create the durable owner-bound recording before tracking begins.
- Recovery and account-mismatch states remain authoritative; they may replace the readiness treatment and disable Start.

## Interaction behavior

### Activity tabs

- Run, Walk, and Ride are visible text tabs.
- Each tab has a minimum 48×48-point target.
- The active tab uses lime text and a thin lime underline; inactive tabs use muted off-white text.
- During tracking, pending save, startup, or blocked recovery, the selector retains its existing disabled behavior.

### Map

- The map remains full viewport and uses existing dark OSM tiles.
- Existing route updates continue through the imperative map ref so live GPS does not reload the map.
- The map may be panned and zoomed without changing the recording.
- A 48-point target control recenters on the latest known/current location.
- A route-overview control is available only when enough route geometry exists; otherwise it is visibly disabled and described as unavailable to assistive technology.

### Primary action

- Idle: `Start Run`, `Start Walk`, or `Start Ride` based on the selected tab.
- Starting: `Starting…`, disabled.
- Active recording: existing `Stop & Save` behavior remains.
- Pending local save: existing `Retry` behavior remains.
- Blocked recovery: existing recovery-safe disabled action and recovery controls remain.
- Every action has at least a 48-point target and exposes its disabled/busy state.

## State scope

The Open Map composition is selected by explicit tracker state, never by whether a metric happens to be zero:

```ts
const readyIdle =
  !tracking &&
  !pending &&
  !shareRun &&
  !recoveryBlocked;
```

`starting` remains inside the ready-idle composition so the user sees the same Start control transition to `Starting…`.

Tracking, pending-save, paused-recovery, owner-mismatch, storage-error, legacy recovery, and post-run share states retain their existing safe state machines. They may reuse the Open Map metric hierarchy only when doing so does not conceal recovery information or change behavior.

## Responsive geometry

- The map is always `absoluteFill`.
- Phone horizontal inset: 20 points; tablet/wide-screen content remains capped using the existing responsive width helper.
- Top controls begin at `safeTop + 8`.
- Bottom action ends at `safeBottom + 16`.
- Primary metric text targets 56 points on a 390-point-wide phone and scales down through an explicit layout model on narrow screens.
- At 320 points wide and/or 200% text:
  - numeric values remain one line with controlled fitting;
  - labels remain visible;
  - controls never overlap;
  - the secondary rail may tighten its gap but does not collapse into an unlabeled icon-only row.
- At larger widths, the overlay remains centered and capped; it does not stretch edge to edge across a tablet.

## Typography and color

- Use the app’s Inter family throughout. Primary values use the regular face at
  large scale; this keeps the approved design light and precise instead of
  turning it into a condensed sports HUD.
- Use tabular numerals for stable live updates.
- Brand lime comes from `colors.primary` (`#B9FF3D`).
- Base map scrim and ink use the established charcoal/off-white system; retired orange and blue accents are prohibited.
- Normal text meets WCAG AA contrast; lime is not the only selected/disabled cue.

## Accessibility

- Screen-reader order: Back → activity tabs → options → map controls → readiness status → Distance → Time → Pace → Calories → primary action → recovery controls when present.
- The three activity choices use tab semantics with selected and disabled state.
- Icon-only controls have explicit labels and hints.
- Distance, time, pace, and calories expose complete spoken values rather than fragmented decorative text.
- Decorative dividers and map scrims are hidden from assistive technology.
- Direct touch targets are at least 48×48 points.
- The layout must remain usable at 100%, 130%, and 200% text sizes.

## Verification requirements

- Component tests prove the idle Open Map hierarchy, text-tab selection, map controls, action callbacks, tracking/pending action variants, accessibility names/states, and touch targets.
- A pure layout-model test proves safe containment and non-overlap at small, reference, and large phone widths across supported font scales.
- Existing Run completion, recovery, offline queue, map privacy, safe exit, private image, route access, and tab-shell tests remain green.
- TypeScript and lint remain clean.
- The final build is visually inspected on the connected Android phone in both idle and active tracking states without publishing or discarding real user data.

## Non-goals

- No new map provider, paid map dependency, or tile-service migration.
- No changes to route privacy, saved activity schema, background location task, run statistics calculations, or post-run Share Studio.
- No app-wide theme redesign in this change.
- No new Pro-only tracker styling.
