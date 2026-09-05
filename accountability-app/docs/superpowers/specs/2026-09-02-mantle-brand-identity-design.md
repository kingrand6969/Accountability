# Mantle Brand Identity Design

**Date:** 2026-09-02  
**Status:** Approved visual direction; implementation pending  
**Scope:** Public-facing rename and production-ready logo system for the Expo app and its owned sharing surfaces

## Objective

Replace the public **AccountAbility** identity with **Mantle** and replace the Unbroken A with the approved connected-path mark. The result must look intentional at launcher, splash, header, navigation, sharing, and favicon sizes while preserving existing user data, links, services, and staging/production separation.

## Approved identity

### Brand name

- Public name: **Mantle**
- Staging display name: **Mantle Staging**
- Capitalization: title case only (`Mantle`), except where an existing all-caps card treatment intentionally requires `MANTLE`
- Pro product: **Mantle Pro**
- Member fallback: **Mantle member**

### Mark

The approved mark is one continuous, soft, upward-moving path with a circular node at each end:

- the lower-left node represents one person starting from their own position;
- the upper-right node represents another person further along the shared path;
- the connected curve represents mutual accountability, transferred momentum, and progress made together;
- the overall motion rises to the right without using a literal runner, arrow, shield, checkmark, heart, or letter M.

The geometry must be redrawn as native vector paths and circles. The supplied preview is a visual reference, not a production bitmap.

### Wordmark

- Text: **Mantle**
- Character: rounded geometric, bold, compact, and friendly without becoming playful
- Default lockup: neon-lime mark to the left of a warm off-white wordmark
- Compact lockup: the same mark with a smaller Mantle wordmark; do not abbreviate to `M`

### Color and effects

- Primary lime: existing app action neon (`#B9FF3D`) so the identity remains aligned with the approved app-wide palette
- Supporting lime: existing darker lime (`#7FAF1C`) only when a two-tone large-format rendering needs depth
- Charcoal: existing dark brand foundation (`#0B0D0B` / `#111411` as appropriate)
- Wordmark: warm off-white (`#F4F5F1` or the active semantic primary ink)

The canonical logo is flat. A restrained neon halo may be rendered by the splash or a large dark marketing treatment at 64 px and above, but it must not be baked into the vector geometry, launcher foreground, favicon, monochrome asset, navigation icon, or accessibility-critical UI.

## Implementation boundaries

### Change

1. Replace the authoritative `brandGeometry.ts` contract with Mantle path, node, palette, and wordmark data.
2. Update `BrandMark` to render the connected path and two nodes from that contract.
3. Update `BrandWordmark` to render `Mantle` as one word using semantic theme colors.
4. Update the asset generator and regenerate the established eight-image inventory:
   - launcher icon;
   - Android adaptive foreground;
   - Android monochrome icon;
   - mark PNG;
   - splash icon;
   - horizontal logo;
   - wordmark;
   - favicon.
5. Replace public-facing AccountAbility copy across the mobile app, permission prompts, invite/share text, legal operator label, public share pages, and owned admin headers with Mantle.
6. Change the Expo display names to `Mantle` and `Mantle Staging`.
7. Update active tests, accessibility labels, and current project documentation that assert the old identity.

### Preserve

- Android package IDs: `com.awldesk.accountability` and `com.awldesk.accountability.staging`
- iOS bundle identifiers
- Expo project owner, project ID, and slug
- update channels, build profiles, runtime version, and EAS environments
- URL schemes and existing deep links
- Supabase project, database schema, storage keys, analytics identifiers, and persisted user data
- historical implementation plans and evidence whose filenames or prose record the old brand at the time
- production deployment prohibition

Keeping these technical identifiers stable makes this a safe visual/public rename instead of a destructive app migration.

## Source of truth and rendering

`src/ui/brandGeometry.ts` remains the authoritative machine-readable contract shared by React Native and the Node asset generator. The contract should use semantic names rather than the old cobalt/cyan naming and include:

- `viewBox`;
- `wordmark`;
- `colors` for lime, supporting lime, charcoal, and cream;
- one curved path definition with a stroke width and rounded caps/joins;
- two node definitions with center coordinates and radius.

`BrandMark` must accept the existing `size`, `color`, and `accessibilityLabel` API so consumers do not break. A caller-supplied color produces a single-color mark suitable for navigation and monochrome use. Without an override, the mark uses the approved lime.

The asset generator must consume only the geometry contract and must not duplicate mark coordinates or brand color literals.

## Public rename rules

- Replace user-visible `AccountAbility` and `Accountability App` references with `Mantle`.
- Replace `AccountAbility Staging` with `Mantle Staging`.
- Do not blindly replace lowercase `accountability` when it describes the product behavior rather than the old proper name.
- Do not rename code folders, package identifiers, database fields, schemes, EAS resources, or historical files merely for cosmetic consistency.
- Use an explicit allowlist in the stale-brand scan for preserved technical identifiers and historical documentation.

## Accessibility

- Default image label: `Mantle logo`
- Wordmark/lockup label: `Mantle`
- Decorative duplicates in a labelled parent must be hidden from accessibility to avoid repeated announcements.
- The mark must remain recognisable at 24 px and pass visual checks at 24, 32, 64, 180, 432, and 1024 px.
- The monochrome Android asset must preserve the path and both nodes without relying on color differences or glow.

## Verification

1. Contract tests reject malformed path/node geometry and confirm deep immutability.
2. Renderer tests confirm one rounded path plus exactly two nodes and no Unbroken A paths.
3. Wordmark tests confirm `Mantle`, semantic colors, and active Feed-header use.
4. Asset generator tests confirm all eight PNG files and their existing dimensions.
5. Pixel/visual inspection covers launcher, adaptive icon crop, splash, header, favicon, and 24 px navigation use in dark and monochrome treatments.
6. Public-copy scan confirms no unintended visible AccountAbility references remain outside the allowlist.
7. Expo public configuration is checked with `APP_VARIANT=staging` and must report:
   - name `Mantle Staging`;
   - package `com.awldesk.accountability.staging`;
   - unchanged preview environment and EAS project ID.
8. Run focused brand/config/copy tests, then the full Jest suite.
9. Build and install staging only after the code and assets pass; never publish or install production.
10. On the connected phone, verify cold launch, launcher icon, splash, authentication, Feed header, menu, invite/share surfaces, and navigation without clearing existing app data.

## Failure handling

- Asset generation writes atomically and must not leave partial PNGs.
- If any generated asset crops or loses a node at target size, adjust geometry padding once in the shared contract and regenerate every asset.
- If a stale public brand string is found, fix the source rather than patching rendered output.
- If the staging config changes package, scheme, project ID, or channel unexpectedly, stop before building or installing.
- Existing app data must be preserved with an in-place staging installation only.

## Completion criteria

The work is complete when Mantle is the consistent public identity on all active owned surfaces, the approved connected-path logo is sharp and legible at every required size, all technical identifiers and user data remain intact, the complete test suite passes, and the staging app is visually verified on the connected phone.
