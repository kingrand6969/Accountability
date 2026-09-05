# Mantle Linked Motion Mark

## Decision

Replace the current Mantle symbol with the approved compact linked-motion mark shown in the selected dashboard render. Keep the existing `Mantle` wordmark typography and permanent charcoal/chartreuse palette.

## Visual construction

- Two rounded, continuous chartreuse paths overlap into one horizontal linked rhythm.
- The silhouette reads simultaneously as connection, forward movement, and a subtle lowercase/flowing `m`.
- Rounded endpoints are integrated into the paths; there are no detached decorative shapes.
- The mark uses a roughly 1.55:1 horizontal footprint so it appears confident beside the wordmark instead of looking undersized inside a square.
- At compact header size, the mark and wordmark form one balanced lockup with a 6–7 dp optical gap.
- The wordmark stays warm white, sentence case, and unchanged in font family.

## Scope

The new geometry becomes the canonical Mantle mark used by:

- Feed and navigation headers.
- Authentication and onboarding surfaces.
- Share and proof cards.
- Launcher, adaptive, splash, favicon, logo, and wordmark assets generated from the shared geometry contract.

No dashboard layout, navigation behavior, copy, feature logic, or color-system changes are part of this work. Dashboard refinement is the next separate design task.

## Implementation boundary

- Keep `src/ui/brandGeometry.ts` as the single source of truth.
- Update the React Native mark renderer so its on-screen aspect ratio matches the approved horizontal lockup.
- Update geometry and raster contracts rather than adding a second one-off header logo.
- Regenerate every established brand raster from the same geometry.
- Preserve accessibility labels and semantic theme colors.

## Quality requirements

- The mark remains recognizable at 18–24 dp.
- No clipping at compact, standard, splash, launcher, or adaptive-icon sizes.
- Header alignment stays vertically centered and touch-target spacing is unchanged.
- Raster and React Native renderings use identical geometry.
- Existing brand, type, lint, and full test suites remain green.
- Staging-device verification must confirm the same mark in the header and launcher before any production release.

## Explicit exclusions

- No production deployment.
- No dashboard redesign.
- No new icon family yet.
- No changes to app identity, package IDs, routes, data, or sharing behavior.
