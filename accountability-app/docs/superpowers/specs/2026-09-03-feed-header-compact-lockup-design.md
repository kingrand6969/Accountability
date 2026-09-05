# Feed header compact lockup design

## Goal

Make the Mantle lockup feel proportional to the Feed header controls after removing the duplicate top-left menu button. Preserve the approved header structure, color system, and dashboard navigation.

## Approved visual direction

- Reduce the Feed-only Mantle mark from 24 to 20 points.
- Reduce the Feed-only Mantle wordmark from 18 to 16 points.
- Reduce the Feed header minimum height from 54 to 48 points.
- Keep the existing 16-point horizontal inset.
- Keep Search, Create, and Notifications visually unchanged.
- Keep every action's 44-point touch target unchanged.
- Keep the bottom dashboard Menu unchanged and as the only Menu entry point.

## Component boundary

Add a named, Feed-specific compact presentation to `BrandWordmark`. Do not shrink the compact wordmark used by other navigation headers. `SocialBrandHeader` opts into the new presentation and owns the 48-point header height.

## Interaction and accessibility

The lockup remains a single accessible image labelled “Mantle.” Search, Create, and Notifications retain their current button labels and touch targets. No new state, navigation, or data flow is introduced.

## Verification

- Component test confirms the Feed uses the smaller named lockup presentation.
- Appearance contract confirms the 48-point header and unchanged 44-point controls.
- Existing navigation tests confirm the bottom Menu remains available.
- TypeScript and focused Jest suites pass.
- A staging-only preview is visually checked on the connected phone at its native width.

## Out of scope

- Bottom navigation sizing or styling.
- Header action icon sizing.
- Other navigation header lockups.
- Feed content, composer, or post-card changes.
